/**
 * Data models for crop, overlay and batch processing (PRDv2 §17–§33).
 */

/** Only aspect ratio supported by the MVP (PRDv2 §18). */
export type CropMode = '1:1';

/** Overlay anchor positions. MVP requires bottom-right (PRDv2 §24). */
export type TimestampPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * The saved crop template (PRDv2 §19), stored as fractions so it can be
 * applied proportionally to photos with different resolutions (§20).
 *
 * - `xFraction` / `yFraction`: top-left corner of the crop area, relative
 *   to the source photo's width / height.
 * - `sizeFraction`: the square side, relative to the source photo's
 *   shortest dimension (so 1 = the biggest square that fits).
 */
export interface CropTemplate {
  xFraction: number;
  yFraction: number;
  sizeFraction: number;
  /** Pixel size of the photo the template was drawn on (display/sanity). */
  sourceWidth: number;
  sourceHeight: number;
}

/** Fixed processing configuration for the MVP (PRDv2 §26). */
export interface ProcessingSettings {
  crop: CropMode;
  /** Id of the timestamp format from the dateFormatter registry (§23). */
  formatId: string;
  position: TimestampPosition;
}

/** `copied` = extra photo saved as-is (no matching time row). */
export type ProcessingStatus = 'success' | 'failed' | 'copied';

/** Review status for labeling-tool style workflow */
export type ReviewStatus = 'pending' | 'approved' | 'skipped' | 'unsure' | 'failed';

/** Outcome for one photo in the batch (§33). */
export interface BatchResult {
  filename: string;
  outputFilename?: string;
  status: ProcessingStatus;
  error?: string;
}

export interface BatchProgress {
  total: number;
  processed: number;
  /** Filename currently being worked on, if any. */
  current?: string;
}

export interface BatchSummary {
  total: number;
  successful: number;
  failed: number;
  /** Extra photos copied as-is because they had no time row. */
  copied: number;
  /** Photos skipped during review */
  skipped?: number;
  /** Photos marked as unsure during review */
  unsure?: number;
}

export interface BatchOutput {
  results: BatchResult[];
  summary: BatchSummary;
  /** Name of the folder the processed photos were written to. */
  outputFolderName: string;
}
