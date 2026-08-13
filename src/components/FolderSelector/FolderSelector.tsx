/**
 * Step 1 — Select Photos (PRDv2 §13, §14, §34).
 *
 * The user picks a local folder; supported images are detected and listed
 * in their deterministic filename order.
 */

import type { FolderSelection } from '../../services/filesystem';
import { sortPhotosByFilename } from '../../utils/imageOrdering';
import { formatBytes } from '../../utils/validation';
import { Badge, Button, Card, ErrorBanner, Icons, TableShell } from '../ui';

const MAX_LISTED = 200;

interface FolderSelectorProps {
  selection: FolderSelection | null;
  onPick: () => void;
  /** True when the browser lacks folder access (needs Chrome/Edge). */
  unsupported: boolean;
  disabled?: boolean;
}

export function FolderSelector({ selection, onPick, unsupported, disabled }: FolderSelectorProps) {
  const photos = selection ? sortPhotosByFilename(selection.photos) : [];

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
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Detected order (filename ascending — PRD §14)
          </p>
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
        </div>
      )}
    </Card>
  );
}
