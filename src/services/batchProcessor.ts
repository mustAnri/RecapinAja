/**
 * Batch processing orchestrator (PRDv2 §27, §28, §32).
 *
 * Runs the per-photo pipeline over the sequential mapping with controlled
 * concurrency, writes each result to the output folder, and records
 * per-photo errors. Individual failures never stop the batch (§32); a photo
 * whose spreadsheet row is invalid fails visibly — a fake timestamp is
 * never generated (§32).
 */

import { mapWithConcurrency, DEFAULT_CONCURRENCY } from '../utils/concurrency';
import { formatTimestamp } from '../utils/dateFormatter';
import { buildOutputFilename } from '../utils/imageOrdering';
import { processPhoto } from './imageProcessor';
import type { SequentialMappingEntry } from '../types/spreadsheet';
import type { OutputFolder } from './filesystem';
import type {
  BatchOutput,
  BatchProgress,
  BatchSummary,
  CropTemplate,
  BatchResult,
  TimestampPosition,
} from '../types/processing';

/**
 * Stability guard: cap the emitted square side so very large photos cannot
 * exhaust canvas memory mid-batch. Outputs up to this size remain far above
 * typical social/print usage.
 */
const MAX_OUTPUT_SIDE_PX = 4096;

export interface BatchOptions {
  /** Confirmed crop template (§19), applied to every photo. */
  crop: CropTemplate;
  /** Manually entered date applied to every photo, e.g. "20/05/2022". */
  dateCell: string;
  /** Timestamp format id from the dateFormatter registry. */
  formatId: string;
  position?: TimestampPosition;
  /** Where processed files are saved (§29). */
  outputFolder: OutputFolder;
  /** Max photos processed simultaneously (§28). */
  concurrency?: number;
  onProgress?: (progress: BatchProgress) => void;
  /** Return true to stop gracefully after in-flight items. */
  isCancelled?: () => boolean;
  /** Photos with no matching time row — copied as-is, never dropped. */
  extraPhotos?: File[];
  /** Subfolder inside the output folder that receives the extra photos. */
  extrasFolderName?: string;
}

/** Default name of the subfolder holding as-is copies of extra photos. */
export const EXTRAS_SUBFOLDER_NAME = 'Tanpa jam';

/**
 * Process every mapped photo: crop template -> timestamp overlay -> save
 * (§27). The UI stays responsive because work is async and bounded (§28).
 */
export async function processBatch(
  mapping: SequentialMappingEntry[],
  options: BatchOptions,
): Promise<BatchOutput> {
  const extras = options.extraPhotos ?? [];
  const total = mapping.length + extras.length;
  const results: BatchResult[] = [];
  let processed = 0;
  let cancelled = false;

  const report = (result: BatchResult) => {
    processed += 1;
    results.push(result);
    options.onProgress?.({ total, processed, current: result.filename });
  };

  await mapWithConcurrency(
    mapping,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    async (entry): Promise<BatchResult> => {
      if (cancelled || (options.isCancelled?.() ?? false)) {
        cancelled = true;
        return {
          filename: entry.file.name,
          status: 'failed',
          error: 'Cancelled before this photo was processed.',
        };
      }

      // A row with invalid/missing data fails with a clear error (§32);
      // the photo is never stamped with a fabricated timestamp.
      if (entry.row.error) {
        return {
          filename: entry.file.name,
          status: 'failed',
          error: `Spreadsheet row ${entry.row.sheetRowNumber}: ${entry.row.error}.`,
        };
      }

      const timestamp = formatTimestamp(options.dateCell, entry.row.time, options.formatId);
      try {
        const photo = await processPhoto(entry.file, {
          timestamp,
          crop: options.crop,
          position: options.position,
          maxOutputSize: MAX_OUTPUT_SIDE_PX,
        });
        const outputFilename = buildOutputFilename(entry.file.name);
        await options.outputFolder.write(outputFilename, photo.blob);
        return { filename: entry.file.name, outputFilename, status: 'success' };
      } catch (error) {
        return {
          filename: entry.file.name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unable to process image.',
        };
      }
    },
    (_index, result) => report(result),
  );

  // Photos beyond the spreadsheet data are never dropped: the original
  // files are copied as-is (no crop, no timestamp) into a "Tanpa jam"
  // subfolder so the user still gets every photo back.
  if (extras.length > 0) {
    let extrasFolder: OutputFolder | null = null;
    try {
      extrasFolder = await options.outputFolder.subfolder(
        options.extrasFolderName ?? EXTRAS_SUBFOLDER_NAME,
      );
    } catch {
      // Leave extrasFolder null — every extra photo reports the failure below.
    }

    for (const file of extras) {
      if (cancelled || (options.isCancelled?.() ?? false)) {
        cancelled = true;
        report({
          filename: file.name,
          status: 'failed',
          error: 'Cancelled before this photo was copied.',
        });
        continue;
      }
      if (!extrasFolder) {
        report({
          filename: file.name,
          status: 'failed',
          error: `Could not create the “${options.extrasFolderName ?? EXTRAS_SUBFOLDER_NAME}” subfolder.`,
        });
        continue;
      }
      try {
        await extrasFolder.write(file.name, file);
        report({
          filename: file.name,
          outputFilename: `${extrasFolder.name}/${file.name}`,
          status: 'copied',
        });
      } catch (error) {
        report({
          filename: file.name,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unable to copy file.',
        });
      }
    }
  }

  // Restore input (sorted) order for stable display; extras come last.
  const order = new Map<string, number>(mapping.map((entry, index) => [entry.file.name, index]));
  extras.forEach((file, index) => order.set(file.name, mapping.length + index));
  results.sort((a, b) => (order.get(a.filename) ?? 0) - (order.get(b.filename) ?? 0));

  const summary: BatchSummary = {
    total,
    successful: results.filter((r) => r.status === 'success').length,
    failed: results.filter((r) => r.status === 'failed').length,
    copied: results.filter((r) => r.status === 'copied').length,
  };

  return { results, summary, outputFolderName: options.outputFolder.name };
}
