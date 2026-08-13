import { useState } from 'react';
import type { ImportedSheet, RowSelection } from '../../types/spreadsheet';
import {
  describeUnselectedRoles,
  isSelectionComplete,
  rowHeaders,
} from '../../services/spreadsheet/parse';
import { Badge, Button, Card, ErrorBanner, Field, InfoBanner, Icons, TableShell, WarningBanner, inputClasses } from '../ui';

interface ColumnSelectorProps {
  sheet: ImportedSheet;
  config: RowSelection;
  onConfig: (config: RowSelection) => void;
  /** Worksheet gid currently requested (null = first worksheet). */
  gidSelection: number | null;
  /** Re-fetch another worksheet by gid (PRDv2 §8). */
  onWorksheet: (gid: number | null) => void;
  loadingWorksheet: boolean;
  disabled?: boolean;
}

const PREVIEW_ROWS = 8;

/**
 * Step 5: worksheet, time column, header row and starting row selection,
 * with a live preview of the loaded data. The date is entered manually in
 * step 4 — only the time list comes from the sheet.
 */
export function ColumnSelector({
  sheet,
  config,
  onConfig,
  gidSelection,
  onWorksheet,
  loadingWorksheet,
  disabled = false,
}: ColumnSelectorProps) {
  const [gidDraft, setGidDraft] = useState<string>(
    gidSelection === null ? '' : String(gidSelection),
  );

  const headers = rowHeaders(sheet, config.headerRow);
  const complete = isSelectionComplete(config);
  const unselected = describeUnselectedRoles(config);

  const dataRowCount = Math.max(0, sheet.rows.length - Math.max(config.startRow, config.headerRow + 1) + 1);

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
      subtitle="Pick the worksheet and the column that holds the time list"
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

        <Field
          label="Time column"
          hint="One time per photo — combined with the manually entered date"
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

        <Field
          label="Start data row"
          hint="Spreadsheet row where the first timestamp data lives"
        >
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

      {!complete && (
        <div className="mt-4">
          <ErrorBanner
            message={`Select a column for: ${unselected.join(' and ')} — then continue.`}
          />
        </div>
      )}

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="indigo">Spreadsheet loaded</Badge>
          <Badge tone="emerald">{dataRowCount} data rows detected</Badge>
          <Badge tone="slate">header row {config.headerRow}</Badge>
          <Badge tone="slate">data starts at row {config.startRow}</Badge>
        </div>

        <TableShell headers={headers.map((h, i) => h || `Column ${i + 1}`)} maxHeight="max-h-64">
          {sheet.rows
            .slice(config.headerRow, config.headerRow + PREVIEW_ROWS)
            .map((row, rowIndex) => (
              <tr key={rowIndex} className="text-slate-700">
                {headers.map((_, columnIndex) => {
                  const selected = columnIndex === config.timeColumn;
                  return (
                    <td
                      key={columnIndex}
                      className={`px-4 py-2 ${selected ? 'bg-indigo-50 font-medium text-indigo-900' : ''}`}
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
            Showing first {PREVIEW_ROWS} rows after the header — {dataRowCount} data rows in total
            from row {config.startRow}.
          </p>
        )}

        {dataRowCount === 0 && (
          <WarningBanner title="No data rows found">
            <p>
              With header row {config.headerRow} and start row {config.startRow}, no data rows are
              left. Lower the start row or check the header row.
            </p>
          </WarningBanner>
        )}

        <InfoBanner message="Photos are paired with these rows in order: photo 1 → first data row, photo 2 → second, and so on. Verify the order before processing." />
      </div>
    </Card>
  );
}
