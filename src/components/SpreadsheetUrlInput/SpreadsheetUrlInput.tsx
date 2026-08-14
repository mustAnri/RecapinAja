/**
 * Step 1 — Spreadsheet source (PRDv2 §4–§7, §34, §36).
 *
 * The user pastes a normal Google Sheets URL (no Google login — the sheet
 * must be public), or uploads a local CSV/TSV export directly (e.g. the
 * "Form responses" download from Google Forms). Both paths stay 100% local.
 */

import { useRef } from 'react';
import { Button, Card, ErrorBanner, Field, Icons, WarningBanner, inputClasses } from '../ui';

interface SpreadsheetUrlInputProps {
  url: string;
  onUrl: (url: string) => void;
  onLoad: () => void;
  /** Upload a local .csv/.tsv/.txt export instead of pasting a link. */
  onImportCsv: (file: File) => void;
  loading: boolean;
  error: string | null;
  disabled?: boolean;
}

export function SpreadsheetUrlInput({
  url,
  onUrl,
  onLoad,
  onImportCsv,
  loading,
  error,
  disabled,
}: SpreadsheetUrlInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <Card
      title="Sumber data — link Google Sheets atau file CSV"
      subtitle="Tempel link spreadsheet, atau unggah file CSV/TSV hasil export (mis. Google Forms → File → Download → CSV)"
    >
      <div className="space-y-4">
        <WarningBanner title="Before you continue">
          <p>
            This app reads the sheet <strong>without Google login</strong>, so the spreadsheet
            must be shared as “Anyone with the link” or published to the web. Make sure it does
            not contain sensitive information — keep only the time list you need.
          </p>
        </WarningBanner>

        <Field
          label="Spreadsheet URL"
          hint="Copy it from the browser address bar — the spreadsheet id and worksheet are detected automatically"
        >
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(event) => onUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && url.trim() && !loading && !disabled) onLoad();
              }}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className={inputClasses}
              disabled={disabled || loading}
              spellCheck={false}
            />
            <Button onClick={onLoad} disabled={disabled || loading || !url.trim()}>
              {loading ? (
                <Icons.refresh className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.download className="h-4 w-4" />
              )}
              {loading ? 'Loading…' : 'Load Spreadsheet'}
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportCsv(file);
              event.target.value = ''; // allow re-selecting the same file
            }}
          />
          <Button
            variant="secondary"
            disabled={disabled || loading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Icons.upload className="h-4 w-4" />
            Unggah file CSV
          </Button>
          <p className="min-w-0 flex-1 text-xs text-slate-500">
            File dibaca sepenuhnya di browser — delimiter (koma/titik koma/tab) dideteksi
            otomatis, termasuk export Google Forms yang memakai kolom “Tanggal Test Drive” dan
            “Start Test Drive”.
          </p>
        </div>

        {error && <ErrorBanner message={error} />}
      </div>
    </Card>
  );
}
