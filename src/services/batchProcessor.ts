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
import { selectRandomLocationsWithReplacement } from '../utils/locationSelector';
import { sampleZoneAddresses } from '../utils/zoneAddressSampler';
import { buildOutputFilename } from '../utils/imageOrdering';
import { ImageProcessingError, processPhoto } from './imageProcessor';
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
import type { Location, ZoneAddressEntry, ZoneFeaturePool } from '../types/location';
import { prepareAddressLines, renderLinesOverlay, renderLocationOverlay } from './imageProcessor/locationOverlay';

/**
 * Stability guard: cap the emitted square side so very large photos cannot
 * exhaust canvas memory mid-batch. Outputs up to this size remain far above
 * typical social/print usage.
 */
const MAX_OUTPUT_SIDE_PX = 4096;

export interface BatchOptions {
  /** Confirmed crop template (§19), or null to keep each photo's full frame. */
  crop: CropTemplate | null;

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
  /** Location overlay configuration (optional). */
  locations?: Location[];
  locationEnabled?: boolean;
  /**
   * Corner for the location overlay. When omitted, the corner diagonally
   * opposite the timestamp is chosen automatically to avoid collisions.
   */
  locationPosition?: TimestampPosition;
}

/** Default name of the subfolder holding as-is copies of extra photos. */
export const EXTRAS_SUBFOLDER_NAME = 'Tanpa jam';

/** Trim, drop empties, and dedupe plain string options. */
function uniquePoolStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/** Dedupe address entries by house-number + street, dropping empty streets. */
function uniquePoolAddresses(entries: ZoneAddressEntry[]): ZoneAddressEntry[] {
  const seen = new Set<string>();
  const result: ZoneAddressEntry[] = [];
  for (const entry of entries) {
    const street = entry.street.trim();
    if (street === '') continue;
    const houseNumber = entry.houseNumber?.trim() ?? '';
    const key = `${houseNumber}|${street}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const uniqueEntry: ZoneAddressEntry = { street };
    if (houseNumber !== '') uniqueEntry.houseNumber = houseNumber;
    result.push(uniqueEntry);
  }
  return result;
}

/**
 * Expand the selected location zones into `count` per-photo locations.
 *
 * Every zone's detected OSM feature pool is merged into one combined pool;
 * `count` unique addresses are then sampled from it so each processed photo
 * gets its own street line plus kecamatan/kabupaten/provinsi. Legacy point
 * locations without a feature pool contribute their stored address fields as
 * fixed options. When the pool yields no usable data the legacy random
 * selection with replacement is used so behavior never regresses.
 */
export function expandLocationsForBatch(locations: Location[], count: number): Location[] {
  if (locations.length === 0 || count <= 0) {
    return [];
  }

  const merged: ZoneFeaturePool = {
    addresses: [],
    roads: [],
    kecamatan: [],
    kabupaten: [],
    provinsi: [],
  };

  for (const location of locations) {
    const pool = location.zoneFeatures;
    if (pool) {
      merged.addresses.push(...pool.addresses);
      merged.roads.push(...pool.roads);
      merged.kecamatan.push(...pool.kecamatan);
      merged.kabupaten.push(...pool.kabupaten);
      merged.provinsi.push(...pool.provinsi);
    } else {
      // Legacy point record: offer its stored address as fixed options.
      merged.roads.push(location.address.street);
      merged.kecamatan.push(location.address.kecamatan);
      merged.kabupaten.push(location.address.kabupaten);
      merged.provinsi.push(location.address.provinsi);
    }
  }

  const combinedPool: ZoneFeaturePool = {
    addresses: uniquePoolAddresses(merged.addresses),
    roads: uniquePoolStrings(merged.roads),
    kecamatan: uniquePoolStrings(merged.kecamatan),
    kabupaten: uniquePoolStrings(merged.kabupaten),
    provinsi: uniquePoolStrings(merged.provinsi),
  };

  const sampledAddresses = sampleZoneAddresses(combinedPool, count);
  if (sampledAddresses.length === 0) {
    return selectRandomLocationsWithReplacement(locations, count);
  }

  const base = locations[0];
  return sampledAddresses.map((sampledAddress, index) => ({
    ...base,
    id: `${base.id}-gen-${index}`,
    address: sampledAddress,
  }));
}

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

  // Prepare locations if enabled: expand the selected zones into one unique
  // sampled address per mapped photo.
  let selectedLocations: Location[] = [];
  if (options.locations && options.locations.length > 0 && options.locationEnabled) {
    selectedLocations = expandLocationsForBatch(options.locations, mapping.length);
  }

  const report = (result: BatchResult) => {
    processed += 1;
    results.push(result);
    options.onProgress?.({ total, processed, current: result.filename });
  };

  await mapWithConcurrency(
    mapping,
    options.concurrency ?? DEFAULT_CONCURRENCY,
      async (entry, index): Promise<BatchResult> => {

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
          error: `Baris ${entry.row.sheetRowNumber}: ${entry.row.error}.`,
        };
      }
      if (entry.row.dateError) {
        return {
          filename: entry.file.name,
          status: 'failed',
          error: `Baris ${entry.row.sheetRowNumber}: ${entry.row.dateError}.`,
        };
      }

      const timestamp = formatTimestamp(entry.row.date, entry.row.time, options.formatId);

      // The location overlay (when enabled) aligns with the original mapping
      // index, not completion order.
      const location = options.locationEnabled ? selectedLocations[index] : undefined;
      const timestampPosition = options.position ?? 'bottom-right';
      // An explicitly chosen location corner wins; otherwise fall back to the
      // diagonal-opposite corner so the two overlays never collide.
      const autoLocationPosition: TimestampPosition =
        timestampPosition === 'top-left'
          ? 'bottom-right'
          : timestampPosition === 'top-right'
            ? 'bottom-left'
            : timestampPosition === 'bottom-left'
              ? 'top-right'
              : timestampPosition === 'bottom-right'
                ? 'top-left'
                : 'top-left';
      const locationPosition = options.locationPosition ?? autoLocationPosition;
      // When both overlays share one corner they are merged into a single
      // stacked block (timestamp on top, address lines below) — never overlap.
      const sameCorner = location !== undefined && locationPosition === timestampPosition;

      try {
        const photo = await processPhoto(entry.file, {
          timestamp,
          crop: options.crop,
          position: options.position,
          maxOutputSize: MAX_OUTPUT_SIDE_PX,
          skipTimestamp: sameCorner,
        });

        let outputBlob = photo.blob;
        if (location) {
          const imgBitmap = await createImageBitmap(outputBlob);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = imgBitmap.width;
            canvas.height = imgBitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new ImageProcessingError('Canvas 2D context is unavailable.');
            }
            ctx.drawImage(imgBitmap, 0, 0);

            const overlayOptions = {
              fontSizeRatio: 0.035,
              minFontSize: 16,
              textColor: '#ffffff',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              paddingRatio: 0.4,
            };

            if (sameCorner) {
              // One stacked block: timestamp line first, then address lines.
              const lines = [timestamp, ...prepareAddressLines(location.address, 4)];
              renderLinesOverlay(ctx, lines, timestampPosition, overlayOptions);
            } else {
              renderLocationOverlay(ctx, location, locationPosition, overlayOptions);
            }

            const encoded = await new Promise<Blob | null>((resolve) => {
              canvas.toBlob(resolve, photo.mimeType, photo.mimeType === 'image/jpeg' ? 0.92 : undefined);
            });
            if (!encoded) {
              throw new ImageProcessingError('Image encoding failed.');
            }
            outputBlob = encoded;
          } finally {
            imgBitmap.close();
          }
        }
        
        const outputFilename = buildOutputFilename(entry.file.name);
        await options.outputFolder.write(outputFilename, outputBlob);
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
