/**
 * Step 2 — Spreadsheet URL (PRDv2 §4–§7, §34, §36).
 *
 * The user pastes a normal Google Sheets URL. No Google login or OAuth is
 * ever involved; a privacy warning explains that the sheet must be public.
 */

import { Button, Card, ErrorBanner, Field, Icons, WarningBanner, inputClasses } from '../ui';

interface SpreadsheetUrlInputProps {
  url: string;
  onUrl: (url: string) => void;
  onLoad: () => void;
  loading: boolean;
  error: string | null;
  disabled?: boolean;
}

export function SpreadsheetUrlInput({
  url,
  onUrl,
  onLoad,
  loading,
  error,
  disabled,
}: SpreadsheetUrlInputProps) {
  return (
    <Card
      title="Google Spreadsheet URL"
      subtitle="Paste the link to the spreadsheet that holds the time list (the date is typed in step 4)"
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

        {error && <ErrorBanner message={error} />}
      </div>
    </Card>
  );
}
