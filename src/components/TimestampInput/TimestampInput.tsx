/**
 * Step 4 — manual timestamp date input.
 *
 * The spreadsheet only supplies the time list; the date is typed once here
 * and applied to every photo. Combined preview shows exactly what will be
 * stamped (e.g. "20 Mei 2022 14:09").
 */

import { formatTimestamp, parseDateCell } from '../../utils/dateFormatter';
import { Badge, Card, ErrorBanner, Field, Icons, inputClasses } from '../ui';

interface TimestampInputProps {
  /** Date value from `<input type="date">` — YYYY-MM-DD or empty. */
  dateInput: string;
  onDateChange: (value: string) => void;
  /** Active timestamp format id (preview follows it). */
  formatId: string;
  disabled?: boolean;
}

export function TimestampInput({
  dateInput,
  onDateChange,
  formatId,
  disabled = false,
}: TimestampInputProps) {
  const valid = dateInput !== '' && parseDateCell(dateInput) !== null;

  return (
    <Card
      title="Input Tanggal Timestamp"
      subtitle="Satu tanggal untuk semua foto — digabung dengan jam dari list spreadsheet"
      actions={
        valid ? (
          <Badge tone="emerald">
            <Icons.check className="h-3.5 w-3.5" />
            Tanggal siap
          </Badge>
        ) : (
          <Badge tone="amber">Isi tanggal dulu</Badge>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Tanggal (berlaku untuk semua foto)"
          hint="Contoh: 20 Mei 2022 — pilih dari kalender atau ketik"
        >
          <input
            type="date"
            value={dateInput}
            disabled={disabled}
            onChange={(event) => onDateChange(event.target.value)}
            className={inputClasses}
          />
        </Field>

        <Field label="Preview timestamp final" hint="Tanggal di atas + jam dari tiap baris">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700">
            {valid ? formatTimestamp(dateInput, '14:09', formatId) : '— tanggal belum valid —'}
          </div>
        </Field>
      </div>

      {dateInput !== '' && !valid && (
        <div className="mt-4">
          <ErrorBanner message="Tanggal tidak valid — gunakan format yang dikenali (mis. 20/05/2022 atau 2022-05-20)." />
        </div>
      )}
    </Card>
  );
}
