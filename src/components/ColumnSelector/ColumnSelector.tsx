import { useState } from 'react';
import type { ImportedSheet, RowSelection } from '../../types/spreadsheet';
import {
  describeUnselectedRoles,
  isSelectionComplete,
  rowHeaders,
} from '../../services/spreadsheet/parse';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Icons,
  InfoBanner,
  TableShell,
  Tabs,
  WarningBanner,
  inputClasses,
} from '../ui';

interface ColumnSelectorProps {
  /** Loaded spreadsheet — null until step 1 succeeds (manual time still works). */
  sheet: ImportedSheet | null;
  config: RowSelection;
  onConfig: (config: RowSelection) => void;
  /** Worksheet gid currently requested (null = first worksheet). */
  gidSelection: number | null;
  /** Re-fetch another worksheet by gid (PRDv2 §8). */
  onWorksheet: (gid: number | null) => void;
  loadingWorksheet: boolean;
  /** Single typed time used when the time source is "manual" (HH:mm). */
  manualTime: string;
  onManualTime: (value: string) => void;
  disabled?: boolean;
}

const PREVIEW_ROWS = 8;

/**
 * Step 5: worksheet, header/start row, and time source selection — with a
 * live preview of the loaded data. The date side is configured in the
 * "Tanggal" step; its column is highlighted in the preview.
 */
export function ColumnSelector({
  sheet,
  config,
  onConfig,
  gidSelection,
  onWorksheet,
  loadingWorksheet,
  manualTime,
  onManualTime,
  disabled = false,
}: ColumnSelectorProps) {
  const [gidDraft, setGidDraft] = useState<string>(
    gidSelection === null ? '' : String(gidSelection),
  );

  const manual = config.timeSource === 'manual';
  const headers = sheet ? rowHeaders(sheet, config.headerRow) : [];
  const complete = isSelectionComplete(config);
  const unselected = describeUnselectedRoles(config);

  const dataRowCount = sheet
    ? Math.max(0, sheet.rows.length - Math.max(config.startRow, config.headerRow + 1) + 1)
    : 0;

  const columnOptions = headers.map((header, index) => (
    <option key={index} value={index}>
      {header || `Column ${index + 1}`}
    </option>
  ));

  const applyGid = () => {
    const trimmed = gidDraft.trim();
    onWorksheet(trimmed === '' ? null : Number(trimmed));
  };

  return (
    <Card
      title="Spreadsheet Data"
      subtitle="Atur sumber jam — kolom spreadsheet (satu per baris) atau satu jam manual untuk semua foto"
      actions={
        complete ? (
          <Badge tone="emerald">
            <Icons.check className="h-3.5 w-3.5" />
            Ready
          </Badge>
        ) : (
          <Badge tone="amber">Needs configuration</Badge>
        )
      }
    >
      {sheet && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Worksheet (gid)"
            hint="Found in the sheet URL after #gid= — leave empty for the first worksheet"
          >
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={gidDraft}
                disabled={disabled || loadingWorksheet}
                onChange={(event) => setGidDraft(event.target.value)}
                className={inputClasses}
              />
              <Button
                variant="secondary"
                onClick={applyGid}
                disabled={disabled || loadingWorksheet}
                className="shrink-0"
              >
                {loadingWorksheet ? 'Loading…' : 'Switch'}
              </Button>
            </div>
          </Field>

          <Field label="Header row" hint="Spreadsheet row that contains the column names">
            <input
              type="number"
              min={1}
              max={Math.max(1, sheet.rows.length)}
              value={config.headerRow}
              disabled={disabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1) {
                  onConfig({ ...config, headerRow: value });
                }
              }}
              className={inputClasses}
            />
          </Field>

          <Field label="Start data row" hint="Spreadsheet row where the first timestamp data lives">
            <input
              type="number"
              min={1}
              value={config.startRow}
              disabled={disabled}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1) {
                  onConfig({ ...config, startRow: value });
                }
              }}
              className={inputClasses}
            />
          </Field>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Sumber jam</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {manual
                ? 'Satu jam yang sama dipakai untuk semua foto — kolom jam spreadsheet diabaikan.'
                : 'Tiap baris spreadsheet menyumbang satu jam, dipasangkan berurutan dengan foto.'}
            </p>
          </div>
          <Tabs
            tabs={[
              { id: 'sheet', label: 'Dari spreadsheet' },
              { id: 'manual', label: 'Input manual' },
            ]}
            active={config.timeSource}
            onChange={(id) => onConfig({ ...config, timeSource: id })}
          />
        </div>

        <div className="mt-4">
          {manual ? (
            <Field
              label="Jam untuk semua foto"
              hint="Menggantikan kolom jam spreadsheet — format 24 jam, mis. 14:09"
            >
              <input
                type="time"
                value={manualTime}
                disabled={disabled}
                onChange={(event) => onManualTime(event.target.value)}
                className={inputClasses}
              />
            </Field>
          ) : sheet ? (
            <Field
              label="Time column"
              hint="One time per photo — combined with the date from the “Tanggal” step"
            >
              <select
                value={config.timeColumn ?? ''}
                disabled={disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  onConfig({ ...config, timeColumn: value === '' ? null : Number(value) });
                }}
                className={inputClasses}
              >
                <option value="">— select a column —</option>
                {columnOptions}
              </select>
            </Field>
          ) : (
            <InfoBanner message="Spreadsheet belum dimuat — muat dulu di langkah 1, atau ganti sumber jam ke “Input manual”." />
          )}
        </div>
      </div>

      {!complete && (
        <div className="mt-4">
          <ErrorBanner
            message={`Select a column for: ${unselected.join(' and ')} — or switch that source to manual input.`}
          />
        </div>
      )}

      {sheet && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="indigo">Spreadsheet loaded</Badge>
            <Badge tone="emerald">{dataRowCount} data rows detected</Badge>
            <Badge tone="slate">header row {config.headerRow}</Badge>
            <Badge tone="slate">data starts at row {config.startRow}</Badge>
            {manual && <Badge tone="amber">manual time overrides the sheet</Badge>}
          </div>

          <TableShell headers={headers.map((h, i) => h || `Column ${i + 1}`)} maxHeight="max-h-64">
            {sheet.rows
              .slice(config.headerRow, config.headerRow + PREVIEW_ROWS)
              .map((row, rowIndex) => (
                <tr key={rowIndex} className="text-slate-700">
                  {headers.map((_, columnIndex) => {
                    const isTime = !manual && columnIndex === config.timeColumn;
                    const isDate = columnIndex === config.dateColumn;
                    return (
                      <td
                        key={columnIndex}
                        className={`px-4 py-2 ${
                          isTime
                            ? 'bg-indigo-50 font-medium text-indigo-900'
                            : isDate
                              ? 'bg-violet-50 font-medium text-violet-900'
                              : ''
                        }`}
                      >
                        {row[columnIndex] ?? ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </TableShell>

          {sheet.rows.length > config.headerRow + PREVIEW_ROWS && (
            <p className="text-xs text-slate-400">
              Showing first {PREVIEW_ROWS} rows after the header — {dataRowCount} data rows in
              total from row {config.startRow}.
            </p>
          )}

          {dataRowCount === 0 && (
            <WarningBanner title="No data rows found">
              <p>
                With header row {config.headerRow} and start row {config.startRow}, no data rows
                are left. Lower the start row or check the header row.
              </p>
            </WarningBanner>
          )}

          <InfoBanner message="Photos are paired with these rows in order: photo 1 → first data row, photo 2 → second, and so on. Verify the order before processing." />
        </div>
      )}
    </Card>
  );
}
