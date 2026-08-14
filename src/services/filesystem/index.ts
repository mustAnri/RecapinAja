/**
 * Local filesystem access (PRDv2 §13, §29–§31) via the File System Access
 * API (Chrome/Edge). Photos are read from a user-selected input folder and
 * written to a separate output folder; originals are never touched (§30).
 */

import { isSupportedPhoto, validatePhotoEntry } from '../../utils/validation';

export class FilesystemError extends Error {}

/** User cancelled a folder picker. */
export class PickerCancelledError extends Error {}

/* Minimal File System Access API typings (not yet in lib.dom). */
interface FSWritableStream {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface FSFileHandle {
  createWritable(): Promise<FSWritableStream>;
}
interface FSDirectoryHandle {
  name: string;
  values(): AsyncIterable<FSDirectoryHandle | FSFileHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FSFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FSDirectoryHandle>;
}
interface WindowWithPicker {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FSDirectoryHandle>;
}

/** True when the browser supports folder picking (Chrome/Edge). */
export function supportsFolderAccess(): boolean {
  return typeof (window as WindowWithPicker).showDirectoryPicker === 'function';
}

async function pickDirectory(mode: 'read' | 'readwrite'): Promise<FSDirectoryHandle> {
  const picker = (window as WindowWithPicker).showDirectoryPicker;
  if (!picker) {
    throw new FilesystemError(
      'This browser cannot open folders. Use Chrome or Edge on desktop.',
    );
  }
  try {
    return await picker.call(window, { mode });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new PickerCancelledError('Folder selection was cancelled.');
    }
    throw new FilesystemError('The folder could not be opened.');
  }
}

export interface FolderSelection {
  handle: FSDirectoryHandle;
  /** Folder name for display. */
  name: string;
  /** Supported photos found in the folder and its subfolders. */
  photos: File[];
  /** Non-photo files skipped during the scan. */
  skippedCount: number;
  /** Photo-shaped files that failed validation, with reasons. */
  rejected: { filename: string; reason: string }[];
}

/** How many folder levels below the picked root are scanned. */
const MAX_SCAN_DEPTH = 3;

/**
 * Step 1 (§13): let the user pick the input folder and scan it for
 * supported image files. Subfolders are scanned too (up to
 * `MAX_SCAN_DEPTH` levels), since photo drops commonly land one level
 * down — the deterministic filename sort keeps ordering stable anyway.
 */
export async function pickInputFolder(): Promise<FolderSelection> {
  const handle = await pickDirectory('read');

  const photos: File[] = [];
  const rejected: { filename: string; reason: string }[] = [];
  let skippedCount = 0;

  const queue: { dir: FSDirectoryHandle; depth: number }[] = [{ dir: handle, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift() as { dir: FSDirectoryHandle; depth: number };
    for await (const entry of dir.values()) {
      if (!('getFile' in entry)) {
        // A sub-directory — recurse while within the depth cap.
        if (depth < MAX_SCAN_DEPTH) queue.push({ dir: entry as FSDirectoryHandle, depth: depth + 1 });
        continue;
      }
      const fileHandle = entry as FSFileHandle & { getFile(): Promise<File> };
      let file: File;
      try {
        file = await fileHandle.getFile();
      } catch {
        skippedCount += 1;
        continue;
      }
      if (!isSupportedPhoto(file.name, file.type)) {
        skippedCount += 1;
        continue;
      }
      const problem = validatePhotoEntry(file.name, file.size, file.type);
      if (problem) {
        rejected.push({ filename: file.name, reason: problem });
      } else {
        photos.push(file);
      }
    }
  }

  return { handle, name: handle.name, photos, skippedCount, rejected };
}

/** Abstraction batch processing uses to save outputs (§29). */
export interface OutputFolder {
  name: string;
  write(filename: string, blob: Blob): Promise<void>;
  /** Create (or reuse) a subfolder inside this output folder. */
  subfolder(name: string): Promise<OutputFolder>;
}

/**
 * Steps 5/6 (§29): pick the output folder with write access.
 */
export async function pickOutputFolder(): Promise<OutputFolder> {
  const handle = await pickDirectory('readwrite');
  return createOutputFolder(handle);
}

/**
 * Pick the folder that will CONTAIN the output subfolder (§29). Returns the
 * raw handle so the app can create a uniquely named subfolder inside it,
 * keeping processed copies separate from the originals (§30).
 */
export async function pickOutputParent(): Promise<FSDirectoryHandle> {
  return pickDirectory('readwrite');
}

/**
 * Create (or reuse) a subfolder inside a picked folder (§29: "create the
 * folder if it does not exist").
 */
export async function createSubfolder(
  parent: FSDirectoryHandle,
  name: string,
): Promise<OutputFolder> {
  const trimmed = name.trim();
  if (!trimmed || /[\\/:*?"<>|]/.test(trimmed)) {
    throw new FilesystemError('That folder name is not valid.');
  }
  const handle = await parent.getDirectoryHandle(trimmed, { create: true });
  return createOutputFolder(handle);
}

function createOutputFolder(handle: FSDirectoryHandle): OutputFolder {
  return {
    name: handle.name,
    async write(filename: string, blob: Blob): Promise<void> {
      const fileHandle = await handle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        throw new FilesystemError(
          `Could not save "${filename}": ${error instanceof Error ? error.message : 'write failed'}`,
        );
      }
    },
    subfolder(name: string): Promise<OutputFolder> {
      return createSubfolder(handle, name);
    },
  };
}

export type { FSDirectoryHandle };
