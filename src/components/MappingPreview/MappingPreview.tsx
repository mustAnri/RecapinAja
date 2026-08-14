import type { SequentialMapping } from '../../types/spreadsheet';
import { formatTimestamp, parseDateCell, parseTimeCell } from '../../utils/dateFormatter';
import { Badge, Icons, InfoBanner, StatCard, TableShell, WarningBanner } from '../ui';

interface MappingPreviewProps {
  mapping: SequentialMapping;
  /** Timestamp format used to preview the final overlay text. */
  formatId: string;
  /**
   * When provided, the date & time cells become editable inputs so the user
   * can replace/fix a wrong value directly (no spreadsheet edit needed).
   */
  onEditCell?: (sheetRowNumber: number, field: 'date' | 'time', value: string) => void;
  /** Row numbers the user has edited manually (shows an "edited" badge). */
  editedRows?: ReadonlySet<number>;
  disabled?: boolean;
}

const MAX_LISTED = 300;

/** Small editable cell input with validity-colored border. */
function CellInput({
  value,
  valid,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  valid: boolean;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`w-28 rounded-lg border px-2 py-1.5 font-mono text-xs shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
        value.trim() === '' || valid
          ? 'border-slate-200 bg-white text-slate-800 focus:border-indigo-400 focus:ring-indigo-500/15'
          : 'border-red-300 bg-red-50/60 text-red-700 focus:border-red-400 focus:ring-red-500/15'
      }`}
    />
  );
}

/**
 * Step 5 preview (PRDv2 §16): the sequential photo-to-timestamp mapping is
 * shown before processing — the safety net for positional mapping. The date
 * and time cells are editable so a wrong/invalid value can be replaced
 * without touching the spreadsheet.
 */
export function MappingPreview({
  mapping,
  formatId,
  onEditCell,
  editedRows,
  disabled,
}: MappingPreviewProps) {
  const { entries, extraPhotos, extraRows, counts } = mapping;
  const editable = !!onEditCell;
  const editedCount = editedRows?.size ?? 0;

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

      {editable && (
        <InfoBanner message="Kolom Tanggal dan Jam bisa langsung diketik untuk mengganti nilai yang salah — perubahan hanya dipakai di aplikasi ini, spreadsheet asli tidak diubah. Format diterima: 20/05/2022, 20.05.2022, 14:09, 21.22." />
      )}
      {editedCount > 0 && (
        <Badge tone="sky">
          <Icons.clipboard className="h-3 w-3" />
          {editedCount} baris diedit manual
        </Badge>
      )}

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
          <TableShell
            headers={['Photo', 'Baris', 'Tanggal', 'Jam', 'Timestamp preview', 'Status']}
          >
            {entries.slice(0, MAX_LISTED).map((entry, index) => {
              const row = entry.row;
              const dateValid = parseDateCell(row.date) !== null;
              const timeValid = parseTimeCell(row.time) !== null;
              const isEdited = editedRows?.has(row.sheetRowNumber) ?? false;
              return (
                <tr key={`${entry.filename}-${index}`} className="bg-white hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    <span className="block max-w-[240px] truncate">{entry.filename}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {row.sheetRowNumber}
                      {isEdited && (
                        <span
                          title="Diedit manual"
                          className="h-1.5 w-1.5 rounded-full bg-sky-500"
                        />
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <CellInput
                        value={row.date}
                        valid={dateValid}
                        placeholder="20/05/2022"
                        disabled={disabled}
                        onChange={(value) => onEditCell?.(row.sheetRowNumber, 'date', value)}
                      />
                    ) : (
                      <span
                        className={`font-mono text-xs ${
                          row.dateError ? 'text-red-600' : 'text-slate-600'
                        }`}
                      >
                        {row.date || '(empty)'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {editable ? (
                      <CellInput
                        value={row.time}
                        valid={timeValid}
                        placeholder="14:09"
                        disabled={disabled}
                        onChange={(value) => onEditCell?.(row.sheetRowNumber, 'time', value)}
                      />
                    ) : (
                      <span
                        className={`font-mono text-xs ${
                          row.error ? 'text-red-600' : 'text-slate-600'
                        }`}
                      >
                        {row.time || '(empty)'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600">
                    {row.error || row.dateError ? (
                      <span className="text-red-500">—</span>
                    ) : (
                      formatTimestamp(row.date, row.time, formatId)
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {row.error ? (
                      <Badge tone="red">
                        <Icons.alert className="h-3 w-3" />
                        {row.error}
                      </Badge>
                    ) : row.dateError ? (
                      <Badge tone="red">
                        <Icons.alert className="h-3 w-3" />
                        {row.dateError}
                      </Badge>
                    ) : (
                      <Badge tone="emerald">
                        <Icons.check className="h-3 w-3" />
                        Ready
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
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
