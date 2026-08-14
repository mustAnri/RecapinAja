import { useEffect, useMemo } from 'react';
import type { SequentialMapping, SpreadsheetRow } from '../../types/spreadsheet';
import { formatTimestamp, parseDateCell, parseTimeCell } from '../../utils/dateFormatter';
import { Badge, Button, Icons, InfoBanner, StatCard, TableShell, WarningBanner } from '../ui';

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
  /** True when pairs came from filename matching (shows the name column). */
  nameMode?: boolean;
  disabled?: boolean;
  /** All extracted rows — the choices offered by the manual row picker. */
  allRows?: SpreadsheetRow[];
  /** Effective pairing after manual assignments (filename → row index). */
  pairIndexes?: ReadonlyMap<string, number>;
  /** The user's explicit manual assignments (filename → row index or null). */
  manualPairs?: ReadonlyMap<string, number | null>;
  /** Manual assignment: pair a photo with a row index, or null = un-pair. */
  onAssignRow?: (filename: string, rowIndex: number | null) => void;
  /** Undo one manual assignment (photo falls back to the auto strategy). */
  onResetPair?: (filename: string) => void;
  /** Undo every manual assignment at once. */
  onResetAllPairs?: () => void;
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

/** 40px photo thumbnail — falls back to an icon while the URL loads. */
function Thumb({ url, name }: { url?: string; name: string }) {
  if (!url) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <Icons.image className="h-4 w-4" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
    />
  );
}

/**
 * Row picker — the interactive heart of the mapping review. Lets the user
 * choose exactly which spreadsheet row a photo takes its timestamp from.
 */
function RowPicker({
  filename,
  rowIndex,
  allRows,
  rowOwner,
  isManual,
  nameMode,
  disabled,
  onAssign,
  onReset,
}: {
  filename: string;
  /** Currently paired row index, or undefined when un-paired. */
  rowIndex: number | undefined;
  allRows: SpreadsheetRow[];
  /** Which photo currently owns each row (for the "dipakai" hint). */
  rowOwner: ReadonlyMap<number, string>;
  isManual: boolean;
  nameMode: boolean;
  disabled?: boolean;
  onAssign: (filename: string, rowIndex: number | null) => void;
  onReset: (filename: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={`Pilih baris data untuk ${filename}`}
        value={rowIndex ?? -1}
        disabled={disabled}
        onChange={(event) => {
          const value = Number(event.target.value);
          onAssign(filename, value === -1 ? null : value);
        }}
        className={`max-w-[15rem] rounded-lg border px-2 py-1.5 text-xs shadow-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          isManual
            ? 'border-indigo-300 bg-indigo-50/70 text-indigo-800 focus:border-indigo-400 focus:ring-indigo-500/15'
            : 'border-slate-200 bg-white text-slate-700 focus:border-indigo-400 focus:ring-indigo-500/15'
        }`}
      >
        <option value={-1}>Tanpa jam — salin apa adanya</option>
        {allRows.map((row, index) => {
          const owner = rowOwner.get(index);
          const usedByOther = owner !== undefined && owner !== filename;
          const label = [
            `Baris ${row.sheetRowNumber}`,
            `${row.date || '—'} ${row.time || '—'}`,
            nameMode && row.name ? row.name : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <option key={index} value={index}>
              {label}
              {usedByOther ? `  ← dipakai ${owner}` : ''}
              {row.error || row.dateError ? '  ⚠' : ''}
            </option>
          );
        })}
      </select>
      {isManual && (
        <button
          type="button"
          title="Kembalikan ke pilihan otomatis"
          disabled={disabled}
          onClick={() => onReset(filename)}
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icons.refresh className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Step 5 preview (PRDv2 §16), now interactive: every photo shows a thumbnail
 * and a row picker so the user can override the auto pairing by hand. The
 * date and time cells stay editable as before.
 */
export function MappingPreview({
  mapping,
  formatId,
  onEditCell,
  editedRows,
  nameMode = false,
  disabled,
  allRows,
  pairIndexes,
  manualPairs,
  onAssignRow,
  onResetPair,
  onResetAllPairs,
}: MappingPreviewProps) {
  const { entries, extraPhotos, extraRows, counts } = mapping;
  const editable = !!onEditCell;
  const interactive = !!(onAssignRow && onResetPair && allRows && pairIndexes);
  const editedCount = editedRows?.size ?? 0;
  const manualCount = manualPairs?.size ?? 0;

  /* Object URLs for the thumbnails. Memoized on a stable fingerprint of the
     file set (name + lastModified + size), so cell edits and other
     re-renders never recreate them; revoked whenever the set changes. */
  const thumbnailFiles = useMemo(
    () => [...entries.map((entry) => entry.file), ...extraPhotos],
    [entries, extraPhotos],
  );
  const fileMapKey = useMemo(
    () =>
      thumbnailFiles.map((file) => `${file.name}\u0000${file.lastModified}\u0000${file.size}`).join('\u0001'),
    [thumbnailFiles],
  );
  const previewUrls = useMemo(() => {
    const urls = new Map<string, string>();
    for (const file of thumbnailFiles) {
      if (!urls.has(file.name)) urls.set(file.name, URL.createObjectURL(file));
    }
    return urls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileMapKey]);
  useEffect(() => {
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  /** Which photo currently owns each row index (for picker hints). */
  const rowOwner = useMemo(() => {
    const owner = new Map<number, string>();
    if (!interactive) return owner;
    for (const file of [...entries.map((entry) => entry.file), ...extraPhotos]) {
      const rowIndex = pairIndexes?.get(file.name);
      if (rowIndex !== undefined) owner.set(rowIndex, file.name);
    }
    return owner;
  }, [interactive, entries, extraPhotos, pairIndexes]);

  const renderPicker = (filename: string) =>
    interactive ? (
      <RowPicker
        filename={filename}
        rowIndex={pairIndexes?.get(filename)}
        allRows={allRows ?? []}
        rowOwner={rowOwner}
        isManual={manualPairs?.has(filename) ?? false}
        nameMode={nameMode}
        disabled={disabled}
        onAssign={onAssignRow!}
        onReset={onResetPair!}
      />
    ) : null;

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

      {interactive && (
        <InfoBanner message="Pasangan bisa diatur manual: gunakan dropdown “Baris data” di setiap foto untuk memilih baris spreadsheet mana yang dipakai. Memilih baris yang sudah dipakai foto lain akan melepas pasangan foto tersebut. “Tanpa jam” menyalin foto apa adanya tanpa timestamp." />
      )}
      {editable && (
        <InfoBanner message="Kolom Tanggal dan Jam bisa langsung diketik untuk mengganti nilai yang salah — perubahan hanya dipakai di aplikasi ini, spreadsheet asli tidak diubah. Format diterima: 20/05/2022, 20.05.2022, 14:09, 21.22." />
      )}

      {(editedCount > 0 || manualCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {manualCount > 0 && (
            <>
              <Badge tone="indigo">
                <Icons.settings className="h-3 w-3" />
                {manualCount} pasangan diatur manual
              </Badge>
              <Button variant="ghost" disabled={disabled} onClick={onResetAllPairs}>
                <Icons.refresh className="h-3.5 w-3.5" />
                Reset semua ke otomatis
              </Button>
            </>
          )}
          {editedCount > 0 && (
            <Badge tone="sky">
              <Icons.clipboard className="h-3 w-3" />
              {editedCount} baris diedit manual
            </Badge>
          )}
        </div>
      )}

      {extraPhotos.length > 0 && (
        <WarningBanner title={`${extraPhotos.length} foto tidak punya pasangan jam — tetap ikut tersimpan`}>
          <p>
            {nameMode
              ? 'Nama file foto-foto ini tidak ditemukan (atau ganda) di kolom nama spreadsheet. File asli '
              : `Data spreadsheet hanya cukup untuk ${counts.mapped} foto. Sisanya `}
            {nameMode ? '' : 'tidak dibuang: file asli '}
            <strong>disalin apa adanya</strong> (tanpa crop & tanpa timestamp) ke subfolder{' '}
            <strong>“Tanpa jam”</strong> di dalam folder hasil.
            {interactive && ' Anda juga bisa langsung memilihkan baris untuk mereka lewat dropdown di bawah.'}
          </p>
        </WarningBanner>
      )}

      {extraRows.length > 0 && (
        <WarningBanner title={`${extraRows.length} baris spreadsheet tidak punya foto`}>
          <p>
            {nameMode
              ? 'Tidak ada foto dengan nama file yang cocok dengan baris-baris ini (atau namanya duplikat). Baris diabaikan — tidak ada timestamp yang ditebak.'
              : `Baris ekstra diabaikan — hanya ${counts.photos} foto pertama yang dipasangkan otomatis. Anda tetap bisa memasangnya manual lewat dropdown “Baris data”.`}
          </p>
        </WarningBanner>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Processing preview ({entries.length})
          </p>
          <TableShell
            headers={
              nameMode
                ? ['Photo', 'Nama di sheet', 'Baris data', 'Tanggal', 'Jam', 'Preview', 'Status']
                : ['Photo', 'Baris data', 'Tanggal', 'Jam', 'Preview', 'Status']
            }
          >
            {entries.slice(0, MAX_LISTED).map((entry, index) => {
              const row = entry.row;
              const dateValid = parseDateCell(row.date) !== null;
              const timeValid = parseTimeCell(row.time) !== null;
              const isEdited = editedRows?.has(row.sheetRowNumber) ?? false;
              const isManual = manualPairs?.has(entry.filename) ?? false;
              return (
                <tr key={`${entry.filename}-${index}`} className="bg-white hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Thumb url={previewUrls.get(entry.filename)} name={entry.filename} />
                      <span className="block max-w-[200px] truncate font-medium text-slate-800">
                        {entry.filename}
                      </span>
                    </div>
                  </td>
                  {nameMode && (
                    <td className="px-4 py-2">
                      <span className="block max-w-[160px] truncate font-mono text-xs text-emerald-700">
                        {row.name && row.name !== '' ? row.name : '(kosong)'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-1">
                      {renderPicker(entry.filename)}
                      <span className="text-[10px] tabular-nums text-slate-400">
                        Baris {row.sheetRowNumber}
                        {isEdited && ' · diedit'}
                        {isManual && ' · manual'}
                      </span>
                    </div>
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
          <TableShell
            headers={interactive ? ['Photo', 'Baris data', 'What happens'] : ['Photo', 'What happens']}
            maxHeight="max-h-64"
          >
            {extraPhotos.slice(0, MAX_LISTED).map((file, index) => (
              <tr key={`${file.name}-${index}`} className="bg-white hover:bg-amber-50/40">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Thumb url={previewUrls.get(file.name)} name={file.name} />
                    <span className="block max-w-[220px] truncate font-medium text-slate-800">
                      {file.name}
                    </span>
                  </div>
                </td>
                {interactive && <td className="px-4 py-2">{renderPicker(file.name)}</td>}
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
