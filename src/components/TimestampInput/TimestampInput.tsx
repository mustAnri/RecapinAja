import { formatTimestamp, parseDateCell } from '../../utils/dateFormatter';
import { rowHeaders } from '../../services/spreadsheet/parse';
import type { ImportedSheet, ValueSource } from '../../types/spreadsheet';
import {
  Badge,
  Card,
  ErrorBanner,
  Field,
  Icons,
  InfoBanner,
  Tabs,
  inputClasses,
} from '../ui';

interface TimestampInputProps {
  /** Loaded spreadsheet — needed to pick the date column (source "sheet"). */
  sheet: ImportedSheet | null;
  /** 1-based header row, shared with the column step, for column labels. */
  headerRow: number;
  /** Where dates come from: the sheet's date column or one manual value. */
  dateSource: ValueSource;
  /** Column index holding the dates (source "sheet"). */
  dateColumn: number | null;
  /** Manually typed date (source "manual"), e.g. "20/05/2022". */
  dateInput: string;
  /** Timestamp format id used for the live preview. */
  formatId: string;
  disabled?: boolean;
  onDateSource: (source: ValueSource) => void;
  onDateColumn: (column: number | null) => void;
  onDateChange: (value: string) => void;
}

/**
 * Step "Tanggal": the date applied to every photo. It can come from a
 * spreadsheet column (one date per row) or from a single manually typed
 * value used for all photos.
 */
export function TimestampInput({
  sheet,
  headerRow,
  dateSource,
  dateColumn,
  dateInput,
  formatId,
  disabled = false,
  onDateSource,
  onDateColumn,
  onDateChange,
}: TimestampInputProps) {
  const trimmed = dateInput.trim();
  const valid = trimmed !== '' && parseDateCell(trimmed) !== null;
  const preview = valid ? formatTimestamp(trimmed, '08:15', formatId) : null;
  const headers = sheet ? rowHeaders(sheet, headerRow) : [];
  const manual = dateSource === 'manual';

  return (
    <Card
      title="Tanggal"
      subtitle="Pilih sumber tanggal — tiap baris spreadsheet bisa punya tanggal sendiri, atau satu tanggal manual untuk semua foto"
      actions={
        manual ? (
          valid ? (
            <Badge tone="emerald">
              <Icons.check className="h-3.5 w-3.5" />
              Tanggal valid
            </Badge>
          ) : (
            <Badge tone="red">
              <Icons.alert className="h-3.5 w-3.5" />
              Belum valid
            </Badge>
          )
        ) : dateColumn !== null ? (
          <Badge tone="emerald">
            <Icons.check className="h-3.5 w-3.5" />
            Kolom dipilih
          </Badge>
        ) : (
          <Badge tone="amber">Kolom belum dipilih</Badge>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Sumber tanggal</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {manual
              ? 'Satu tanggal yang sama dipakai untuk semua foto.'
              : 'Tanggal diambil dari kolom spreadsheet — satu per baris.'}
          </p>
        </div>
        <Tabs
          tabs={[
            { id: 'sheet', label: 'Dari spreadsheet' },
            { id: 'manual', label: 'Input manual' },
          ]}
          active={dateSource}
          onChange={(id) => onDateSource(id)}
        />
      </div>

      <div className="mt-4">
        {manual ? (
          <>
            <Field
              label="Tanggal"
              hint="Dipakai untuk semua foto — digabung dengan jam tiap foto"
            >
              <input
                type="text"
                value={dateInput}
                disabled={disabled}
                onChange={(event) => onDateChange(event.target.value)}
                placeholder="20/05/2022"
                className={inputClasses}
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {trimmed === '' ? (
                <span className="text-slate-400">Format: DD/MM/YYYY — contoh 20/05/2022</span>
              ) : valid ? (
                <>
                  <Badge tone="emerald">
                    <Icons.check className="h-3.5 w-3.5" />
                    Valid
                  </Badge>
                  <span className="text-slate-500">
                    Preview: <span className="font-mono text-slate-700">{preview}</span>
                  </span>
                </>
              ) : (
                <Badge tone="red">
                  <Icons.alert className="h-3.5 w-3.5" />
                  Invalid — gunakan DD/MM/YYYY, mis. 20/05/2022
                </Badge>
              )}
            </div>
          </>
        ) : sheet ? (
          <Field
            label="Kolom tanggal"
            hint="Satu tanggal per baris, dipasangkan berurutan dengan foto"
          >
            <select
              value={dateColumn ?? ''}
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value;
                onDateColumn(value === '' ? null : Number(value));
              }}
              className={inputClasses}
            >
              <option value="">— pilih kolom —</option>
              {headers.map((header, index) => (
                <option key={index} value={index}>
                  {header || `Column ${index + 1}`}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <InfoBanner message="Spreadsheet belum dimuat — muat dulu di langkah 1, atau pilih “Input manual” untuk mengetik tanggal sendiri." />
        )}
      </div>

      {!manual && dateColumn === null && sheet && (
        <div className="mt-4">
          <ErrorBanner message="Pilih kolom tanggal dari spreadsheet — atau ganti sumber ke “Input manual”." />
        </div>
      )}
    </Card>
  );
}
