import type { SequentialMapping } from '../../types/spreadsheet';
import { formatTimestamp } from '../../utils/dateFormatter';
import { Badge, Icons, StatCard, TableShell, WarningBanner } from '../ui';

interface MappingPreviewProps {
  mapping: SequentialMapping;
  /** Timestamp format used to preview the final overlay text. */
  formatId: string;
  /** Manually entered date applied to every row ('' = not filled yet). */
  dateCell: string;
}

const MAX_LISTED = 300;

/**
 * Step 5 preview (PRDv2 §16): the sequential photo-to-timestamp mapping is
 * shown before processing — the safety net for positional mapping.
 */
export function MappingPreview({ mapping, formatId, dateCell }: MappingPreviewProps) {
  const { entries, extraPhotos, extraRows, counts } = mapping;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Photos" value={counts.photos} tone="indigo" hint="sorted by filename" />
        <StatCard label="Spreadsheet rows" value={counts.rows} tone="slate" hint="from start row" />
        <StatCard
          label="Mapped"
          value={counts.mapped}
          tone={counts.mapped > 0 ? 'emerald' : 'red'}
          hint="photo ↔ row pairs"
        />
        <StatCard
          label="Invalid rows"
          value={counts.invalidRows}
          tone={counts.invalidRows > 0 ? 'red' : 'slate'}
          hint="will fail, never guessed"
        />
      </div>

      {extraPhotos.length > 0 && (
        <WarningBanner title={`${extraPhotos.length} foto tidak punya pasangan jam — tetap ikut tersimpan`}>
          <p>
            Data spreadsheet hanya cukup untuk {counts.mapped} foto. Sisanya tidak dibuang:
            file asli <strong>disalin apa adanya</strong> (tanpa crop & tanpa timestamp) ke
            subfolder <strong>“Tanpa jam”</strong> di dalam folder hasil.
          </p>
        </WarningBanner>
      )}

      {extraRows.length > 0 && (
        <WarningBanner title={`${extraRows.length} spreadsheet row(s) have no photo`}>
          <p>
            The extra rows are ignored — only the first {counts.photos} row(s) are mapped. Adjust
            the start row if this is not what you expected.
          </p>
        </WarningBanner>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Processing preview ({entries.length})
          </p>
          <TableShell headers={['Photo', 'Row', 'Timestamp preview', 'Status']}>
            {entries.slice(0, MAX_LISTED).map((entry, index) => (
              <tr key={`${entry.filename}-${index}`} className="bg-white hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="block max-w-[280px] truncate">{entry.filename}</span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">
                  {entry.row.sheetRowNumber}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-600">
                  {entry.row.error ? (
                    <span className="text-red-600">{entry.row.time || '(empty)'}</span>
                  ) : dateCell ? (
                    formatTimestamp(dateCell, entry.row.time, formatId)
                  ) : (
                    <span className="text-amber-600">
                      {entry.row.time} — tanggal belum diisi
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {entry.row.error ? (
                    <Badge tone="red">
                      <Icons.alert className="h-3 w-3" />
                      {entry.row.error}
                    </Badge>
                  ) : (
                    <Badge tone="emerald">
                      <Icons.check className="h-3 w-3" />
                      Ready
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
          {entries.length > MAX_LISTED && (
            <p className="text-xs text-slate-400">
              Showing first {MAX_LISTED} of {entries.length} mapped photos.
            </p>
          )}
        </div>
      )}

      {extraPhotos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
            Photos without a spreadsheet row ({extraPhotos.length})
          </p>
          <TableShell headers={['Photo', 'What happens']} maxHeight="max-h-48">
            {extraPhotos.slice(0, MAX_LISTED).map((file, index) => (
              <tr key={`${file.name}-${index}`} className="bg-white hover:bg-amber-50/40">
                <td className="px-4 py-2 font-medium text-slate-800">
                  <span className="block max-w-[280px] truncate">{file.name}</span>
                </td>
                <td className="px-4 py-2">
                  <Badge tone="amber">
                    <Icons.download className="h-3 w-3" />
                    Copied as-is to “Tanpa jam”
                  </Badge>
                </td>
              </tr>
            ))}
          </TableShell>
        </div>
      )}
    </div>
  );
}
