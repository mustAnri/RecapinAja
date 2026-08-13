/**
 * Step 1 — Select Photos (PRDv2 §13, §14, §34).
 *
 * The user picks a local folder; supported images are detected and listed
 * in their deterministic filename order — as a table or a thumbnail grid.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FolderSelection } from '../../services/filesystem';
import { sortPhotosByFilename } from '../../utils/imageOrdering';
import { formatBytes } from '../../utils/validation';
import { Badge, Button, Card, ErrorBanner, Icons, TableShell, Tabs } from '../ui';

const MAX_LISTED = 200;
/** Thumbnails are memory-heavy — cap the grid preview. */
const MAX_THUMBNAILS = 60;

interface FolderSelectorProps {
  selection: FolderSelection | null;
  onPick: () => void;
  /** True when the browser lacks folder access (needs Chrome/Edge). */
  unsupported: boolean;
  disabled?: boolean;
}

/** One thumbnail tile — creates and revokes its own object URL. */
function Thumb({ file, index }: { file: File; index: number }) {
  const [failed, setFailed] = useState(false);

  // Object URLs are created lazily per file and revoked on cleanup.
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-square bg-slate-100">
        {url && !failed ? (
          <img
            src={url}
            alt={file.name}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Icons.image className="h-6 w-6 text-slate-300" />
          </div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
          {index + 1}
        </span>
      </div>
      <div className="px-2 py-1.5">
        <p className="truncate text-[11px] font-medium text-slate-700" title={file.name}>
          {file.name}
        </p>
        <p className="text-[10px] text-slate-400 tabular-nums">{formatBytes(file.size)}</p>
      </div>
    </div>
  );
}

export function FolderSelector({ selection, onPick, unsupported, disabled }: FolderSelectorProps) {
  const photos = selection ? sortPhotosByFilename(selection.photos) : [];
  const [view, setView] = useState<'table' | 'grid'>('table');

  return (
    <Card
      title="Photo Folder"
      subtitle="Select the folder that contains the raw photos — it is scanned automatically"
      actions={
        selection ? (
          <Badge tone={photos.length > 0 ? 'emerald' : 'amber'}>
            {photos.length > 0 ? `${photos.length} photos detected` : 'No photos found'}
          </Badge>
        ) : undefined
      }
    >
      {unsupported && (
        <div className="mb-4">
          <ErrorBanner message="This browser cannot open local folders. Please use Chrome or Edge on desktop." />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onPick} disabled={disabled || unsupported}>
          <Icons.upload className="h-4 w-4" />
          {selection ? 'Change folder' : 'Select Folder'}
        </Button>
        {selection && (
          <p className="text-sm text-slate-500">
            Input folder: <span className="font-medium text-slate-800">{selection.name}</span>
            {selection.skippedCount > 0 && (
              <span className="text-slate-400"> · {selection.skippedCount} non-photo files ignored</span>
            )}
          </p>
        )}
      </div>

      {selection && selection.rejected.length > 0 && (
        <div className="mt-4">
          <ErrorBanner
            message={`${selection.rejected.length} photo-shaped file(s) were skipped: ${selection.rejected
              .slice(0, 3)
              .map((r) => `${r.filename} (${r.reason})`)
              .join(', ')}${selection.rejected.length > 3 ? ', …' : ''}`}
          />
        </div>
      )}

      {photos.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Detected order (filename ascending — urutan ini menentukan pasangan foto ↔ jam)
            </p>
            <Tabs
              tabs={[
                { id: 'table', label: 'Tabel' },
                { id: 'grid', label: 'Grid' },
              ]}
              active={view}
              onChange={(id) => setView(id)}
            />
          </div>

          {view === 'table' ? (
            <>
              <TableShell headers={['#', 'Filename', 'Size']} maxHeight="max-h-64">
                {photos.slice(0, MAX_LISTED).map((file, index) => (
                  <tr key={`${file.name}-${index}`} className="bg-white hover:bg-slate-50">
                    <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">{index + 1}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">
                      <span className="block max-w-[360px] truncate">{file.name}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500 tabular-nums">
                      {formatBytes(file.size)}
                    </td>
                  </tr>
                ))}
              </TableShell>
              {photos.length > MAX_LISTED && (
                <p className="text-xs text-slate-400">
                  Showing first {MAX_LISTED} of {photos.length} photos.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {photos.slice(0, MAX_THUMBNAILS).map((file, index) => (
                  <Thumb key={`${file.name}-${index}`} file={file} index={index} />
                ))}
              </div>
              {photos.length > MAX_THUMBNAILS && (
                <p className="text-xs text-slate-400">
                  Menampilkan {MAX_THUMBNAILS} thumbnail pertama dari {photos.length} foto — semua
                  foto tetap diproses.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
