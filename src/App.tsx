/**
 * App shell — SaaS-style layout: dark workflow sidebar + sticky header with
 * step context, driving the seven-step flow:
 *
 *   1. List Jam   — paste the Google Spreadsheet link (source of the times)
 *   2. Foto       — pick the local folder with the raw photos
 *   3. Crop 1:1   — draw the manual crop once, applied to every photo
 *   4. Tanggal    — date from a spreadsheet column or one manual value
 *   5. Kolom Jam  — worksheet / rows / time source + review mapping
 *   6. Proses     — run the batch into a chosen output folder
 *   7. Hasil      — summary of what was saved
 */

import { useMemo, useRef, useState } from 'react';
import type { ImportedSheet, RowSelection } from './types/spreadsheet';
import { EMPTY_SELECTION } from './types/spreadsheet';
import type { BatchOutput, BatchProgress, CropTemplate } from './types/processing';
import {
  FilesystemError,
  PickerCancelledError,
  createSubfolder,
  pickInputFolder,
  pickOutputParent,
  supportsFolderAccess,
  type FolderSelection,
} from './services/filesystem';
import { loadSpreadsheet } from './services/spreadsheet';
import {
  applyRowOverrides,
  extractTimestampRows,
  guessDateColumn,
  guessTimeColumn,
  rowHeaders,
  type RowOverrides,
} from './services/spreadsheet/parse';
import { buildSequentialMapping } from './services/mapping';
import { processBatch } from './services/batchProcessor';
import { sortPhotosByFilename } from './utils/imageOrdering';
import { DEFAULT_FORMAT_ID, formatTimestamp, parseDateCell, parseTimeCell } from './utils/dateFormatter';
import { Button, ErrorBanner, Guide, Icons } from './components/ui';
import { FolderSelector } from './components/FolderSelector/FolderSelector';
import { SpreadsheetUrlInput } from './components/SpreadsheetUrlInput/SpreadsheetUrlInput';
import { ColumnSelector } from './components/ColumnSelector/ColumnSelector';
import { CropEditor } from './components/CropEditor/CropEditor';
import { TimestampInput } from './components/TimestampInput/TimestampInput';
import { MappingPreview } from './components/MappingPreview/MappingPreview';
import { ProcessingProgress } from './components/ProcessingProgress/ProcessingProgress';
import { ResultPanel } from './components/ResultPanel/ResultPanel';
import { QuickMode } from './components/QuickMode/QuickMode';

const STEPS = [
  {
    title: 'List Jam',
    subtitle: 'Tempel link Google Sheets berisi daftar jam',
    icon: Icons.link,
  },
  {
    title: 'Foto',
    subtitle: 'Pilih folder berisi foto mentah',
    icon: Icons.image,
  },
  {
    title: 'Crop 1:1',
    subtitle: 'Tentukan area crop satu kali untuk semua foto',
    icon: Icons.settings,
  },
  {
    title: 'Tanggal',
    subtitle: 'Tanggal dari kolom spreadsheet atau input manual',
    icon: Icons.clipboard,
  },
  {
    title: 'Kolom Jam',
    subtitle: 'Sumber jam, kolom & review pasangan foto ↔ jam',
    icon: Icons.database,
  },
  {
    title: 'Proses',
    subtitle: 'Jalankan batch ke folder output',
    icon: Icons.refresh,
  },
  {
    title: 'Hasil',
    subtitle: 'Ringkasan file yang tersimpan',
    icon: Icons.check,
  },
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function runStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
}

/** Empty sheet stand-in so a fully manual run needs no spreadsheet at all. */
const NO_SHEET: ImportedSheet = {
  sourceTitle: 'Manual',
  spreadsheetId: null,
  gid: 0,
  headers: [],
  rows: [],
};

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/30">
        <Icons.logo className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-bold leading-tight tracking-tight text-white">RecapinAja</p>
        {!compact && (
          <p className="text-[11px] leading-tight text-slate-400">Photo Timestamp Studio</p>
        )}
      </div>
    </div>
  );
}

function PageHeading({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: (props: { className?: string }) => ReturnType<typeof Icons.link>;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-600 ring-1 ring-inset ring-indigo-500/20">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{title}</h1>
          {badge && (
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200/60">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [step, setStep] = useState<StepIndex>(0);
  /** Workflow mode: the full seven steps, or the dedicated quick tabs. */
  const [mode, setMode] = useState<'lengkap' | 'cepat'>('lengkap');

  // Step 1 — spreadsheet (the time list)
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ImportedSheet | null>(null);
  const [gidSelection, setGidSelection] = useState<number | null>(null);
  const [worksheetLoading, setWorksheetLoading] = useState(false);

  // Step 2 — photo folder
  const [folder, setFolder] = useState<FolderSelection | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Step 3 — crop template
  const [template, setTemplate] = useState<CropTemplate | null>(null);

  // Step 4 — manual date (used when dateSource is "manual")
  const [dateInput, setDateInput] = useState('');

  // Step 5 — column selection + manual time (used when timeSource is "manual")
  const [selection, setSelection] = useState<RowSelection>(EMPTY_SELECTION);
  const [timeInput, setTimeInput] = useState('');


  /** Per-row manual edits made in the mapping preview (replace/edit cells). */
  const [overrides, setOverrides] = useState<RowOverrides>({});

  // Steps 6/7 — batch run
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [output, setOutput] = useState<BatchOutput | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const folderSupported = supportsFolderAccess();

  const photos = useMemo(() => (folder ? sortPhotosByFilename(folder.photos) : []), [folder]);

  const dateValid = dateInput.trim() !== '' && parseDateCell(dateInput.trim()) !== null;
  const timeValid = timeInput.trim() !== '' && parseTimeCell(timeInput.trim()) !== null;

  /** Is the date side configured well enough to stamp photos? */
  const dateReady =
    selection.dateSource === 'manual' ? dateValid : selection.dateColumn !== null;
  /** Is the time side configured well enough to stamp photos? */
  const timeReady =
    selection.timeSource === 'manual' ? timeValid : selection.timeColumn !== null;

  const fullyManual =
    selection.dateSource === 'manual' && selection.timeSource === 'manual';

  const extracted = useMemo(() => {
    // A sheet source needs a loaded sheet; a fully manual run works without one.
    if (!sheet && !fullyManual) return null;
    const source = sheet ?? NO_SHEET;
    const base = extractTimestampRows(
      source,
      selection,
      { dateCell: dateInput, timeCell: timeInput },
      photos.length,
    );
    return { ...base, rows: applyRowOverrides(base.rows, overrides) };
  }, [sheet, selection, dateInput, timeInput, photos.length, fullyManual, overrides]);

  const mapping = useMemo(
    () => (extracted ? buildSequentialMapping(photos, extracted.rows) : null),
    [photos, extracted],
  );

  /** Row numbers the user has manually edited in the preview. */
  const editedRowNumbers = useMemo(
    () => new Set(Object.keys(overrides).map(Number)),
    [overrides],
  );

  /* ------------------------- step 1: spreadsheet ------------------------- */

  const applyLoadedSheet = (loaded: ImportedSheet) => {
    setSheet(loaded);
    setGidSelection(loaded.gid);
    setOutput(null);
    setOverrides({}); // new data — old manual edits no longer apply
    const headers = rowHeaders(loaded, 1);
    setSelection((prev) => ({
      ...prev,
      timeColumn: guessTimeColumn(headers),
      dateColumn: guessDateColumn(headers),
    }));
  };

  const handleLoadUrl = async () => {
    setSheetLoading(true);
    setSheetError(null);
    try {
      const loaded = await loadSpreadsheet(sheetUrl, null);
      applyLoadedSheet(loaded);
      setStep((s) => (s === 0 ? 1 : s));
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : 'Unable to load the spreadsheet.');
    } finally {
      setSheetLoading(false);
    }
  };

  const handleWorksheet = async (gid: number | null) => {
    setWorksheetLoading(true);
    setSheetError(null);
    try {
      const loaded = await loadSpreadsheet(sheetUrl, gid);
      applyLoadedSheet(loaded);
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : 'Unable to load that worksheet.');
    } finally {
      setWorksheetLoading(false);
    }
  };

  /** Manual per-row edit from the mapping preview (replace/fix a cell). */
  const handleEditCell = (sheetRowNumber: number, field: 'date' | 'time', value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [sheetRowNumber]: { ...prev[sheetRowNumber], [field]: value },
    }));
  };
  /* --------------------------- step 2: photos ---------------------------- */

  const handlePickFolder = async () => {
    setFolderError(null);
    try {
      const picked = await pickInputFolder();
      setFolder(picked);
      setTemplate(null); // crop depends on the photo set
      setOutput(null);
    } catch (error) {
      if (error instanceof PickerCancelledError) return;
      setFolderError(error instanceof Error ? error.message : 'Unable to open that folder.');
    }
  };

  /* ----------------------------- step 6: run ----------------------------- */

  const canProcess =
    !!folder &&
    photos.length > 0 &&
    !!mapping &&
    mapping.entries.length > 0 &&
    !!template &&
    dateReady &&
    timeReady &&
    !progress;

  const handleProcess = async () => {
    if (!canProcess || !mapping || !template) return;
    setBatchError(null);

    let outputFolder;
    try {
      const parent = await pickOutputParent();
      outputFolder = await createSubfolder(parent, `Processed ${runStamp()}`);
    } catch (error) {
      if (error instanceof PickerCancelledError) return;
      setBatchError(
        error instanceof Error ? error.message : 'Unable to prepare the output folder.',
      );
      return;
    }

    const runId = ++runIdRef.current;
    setProgress({ total: mapping.entries.length + mapping.extraPhotos.length, processed: 0 });
    try {
      const result = await processBatch(mapping.entries, {
        crop: template,
        formatId: DEFAULT_FORMAT_ID,
        position: 'bottom-right',
        outputFolder,
        extraPhotos: mapping.extraPhotos,
        onProgress: (p) => {
          if (runIdRef.current === runId) setProgress(p);
        },
      });
      if (runIdRef.current !== runId) return;
      setOutput(result);
      setProgress(null);
      setStep(6);
    } catch (error) {
      setProgress(null);
      setBatchError(
        error instanceof FilesystemError
          ? error.message
          : 'Processing stopped unexpectedly — completed photos were already saved.',
      );
    }
  };

  const reset = () => {
    runIdRef.current += 1;
    setStep(0);
    setSheetUrl('');
    setSheet(null);
    setSelection(EMPTY_SELECTION);
    setGidSelection(null);
    setFolder(null);
    setTemplate(null);
    setDateInput('');
    setTimeInput('');
    setOverrides({});
    setProgress(null);
    setOutput(null);
    setBatchError(null);
    setSheetError(null);
    setFolderError(null);
  };

  /* -------------------------------- render ------------------------------- */

  /* Checklist of what is still needed before processing (no lock — informational). */
  const missing: { label: string; step: StepIndex }[] = [];
  if (!sheet) missing.push({ label: 'Spreadsheet belum dimuat', step: 0 });
  if (photos.length === 0) missing.push({ label: 'Folder foto belum dipilih', step: 1 });
  if (photos.length > 0 && !template)
    missing.push({ label: 'Crop 1:1 belum dikonfirmasi', step: 2 });
  if (selection.dateSource === 'sheet') {
    if (selection.dateColumn === null)
      missing.push({ label: 'Kolom tanggal belum dipilih', step: 3 });
  } else if (!dateValid) {
    missing.push({ label: 'Tanggal manual belum diisi / tidak valid', step: 3 });
  }
  if (selection.timeSource === 'sheet') {
    if (selection.timeColumn === null)
      missing.push({ label: 'Kolom jam belum dipilih', step: 4 });
  } else if (!timeValid) {
    missing.push({ label: 'Jam manual belum diisi / tidak valid', step: 4 });
  }
  if (sheet && photos.length > 0 && (!mapping || mapping.entries.length === 0))
    missing.push({ label: 'Belum ada pasangan foto ↔ jam', step: 4 });

  const stepDone = (index: StepIndex): boolean => {
    switch (index) {
      case 0:
        return !!sheet;
      case 1:
        return photos.length > 0;
      case 2:
        return !!template;
      case 3:
        return dateReady;
      case 4:
        return timeReady && !!mapping && mapping.entries.length > 0;
      case 5:
        return !!output;
      default:
        return false;
    }
  };

  const completedCount = STEPS.reduce(
    (acc, _stepMeta, index) => acc + (stepDone(index as StepIndex) ? 1 : 0),
    0,
  );
  const progressPercent = Math.round((completedCount / STEPS.length) * 100);
  const activeMeta = STEPS[step];

  const sheetHeaders = sheet ? rowHeaders(sheet, selection.headerRow) : [];
  const dateColumnLabel =
    selection.dateColumn !== null
      ? sheetHeaders[selection.dateColumn] || `Column ${selection.dateColumn + 1}`
      : null;
  const timeColumnLabel =
    selection.timeColumn !== null
      ? sheetHeaders[selection.timeColumn] || `Column ${selection.timeColumn + 1}`
      : null;

  const modeSwitch = (
    <div
      className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
      role="tablist"
      aria-label="Mode workflow"
    >
      {(
        [
          { id: 'lengkap', label: 'Mode Lengkap' },
          { id: 'cepat', label: 'Mode Cepat' },
        ] as const
      ).map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={mode === option.id}
          onClick={() => setMode(option.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
            mode === option.id
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  /* Mode Cepat — dedicated simple tabs, no spreadsheet needed. */
  if (mode === 'cepat') {
    return (
      <div className="app-bg min-h-screen">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Brand compact />
            {modeSwitch}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          <div className="space-y-6">
            <PageHeading
              icon={Icons.sparkles}
              title="Mode Cepat"
              description="Alur ringkas tanpa spreadsheet: atur jam → upload foto → proses (batch/manual) → save."
            />
            <QuickMode />
          </div>
        </main>
        <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
          Semua pemrosesan berjalan lokal di browser Anda — foto asli tidak pernah diubah.
        </footer>
      </div>
    );
  }

  return (
    <div className="app-bg min-h-screen">
      {/* ------------------------- sidebar (desktop) ------------------------ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-slate-800/80 bg-slate-950 lg:flex">
        <div className="px-5 pb-6 pt-6">
          <Brand />
        </div>

        <div className="px-5 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Workflow — {completedCount}/{STEPS.length} selesai
          </p>
        </div>

        <nav aria-label="Workflow steps" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {STEPS.map((stepMeta, index) => {
            const isActive = index === step;
            const done = stepDone(index as StepIndex);
            const Icon = stepMeta.icon;
            return (
              <button
                key={stepMeta.title}
                type="button"
                onClick={() => setStep(index as StepIndex)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  isActive ? 'bg-white/10 ring-1 ring-inset ring-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    done
                      ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30'
                      : isActive
                        ? 'bg-white/10 text-white ring-1 ring-inset ring-white/20'
                        : 'bg-white/5 text-slate-400'
                  }`}
                >
                  {done ? <Icons.check className="h-4 w-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm font-semibold leading-tight ${
                      isActive || done ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    {stepMeta.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-slate-500">
                    {stepMeta.subtitle}
                  </span>
                </span>
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-indigo-300' : 'text-slate-600 group-hover:text-slate-400'
                  }`}
                />
              </button>
            );
          })}
        </nav>

        <div className="mx-3 mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Icons.lock className="h-4 w-4 text-emerald-400" />
            100% client-side
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Crop, timestamp, dan penyimpanan berjalan di browser. Foto tidak pernah diunggah ke
            server mana pun.
          </p>
        </div>
      </aside>

      {/* ------------------------------ main -------------------------------- */}
      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3 lg:hidden">
              <Brand compact />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Langkah {step + 1} dari {STEPS.length}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-sm font-bold tracking-tight text-slate-900">
                {activeMeta.title}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {modeSwitch}
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold tabular-nums text-slate-500 sm:block">
                {progressPercent}% selesai
              </span>
              {photos.length > 0 && (
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold tabular-nums text-indigo-600 ring-1 ring-inset ring-indigo-200/60">
                  {photos.length} foto
                </span>
              )}
            </div>
          </div>

          {/* mobile step pills */}
          <div className="border-t border-slate-100 px-4 py-2 lg:hidden">
            <ol className="flex gap-1.5 overflow-x-auto">
              {STEPS.map((stepMeta, index) => {
                const isActive = index === step;
                const done = stepDone(index as StepIndex);
                return (
                  <li key={stepMeta.title} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setStep(index as StepIndex)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                          : done
                            ? 'bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-200/60'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {done && !isActive ? (
                        <Icons.check className="h-3.5 w-3.5" />
                      ) : (
                        <span className="tabular-nums">{index + 1}</span>
                      )}
                      {stepMeta.title}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* workflow progress bar */}
          <div className="h-0.5 w-full bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
          <div className="space-y-6">
            <PageHeading
              icon={activeMeta.icon}
              title={activeMeta.title}
              description={activeMeta.subtitle}
              badge={step === 6 ? 'Batch selesai' : undefined}
            />

            {step === 0 && (
              <>
                <Guide
                  steps={[
                    'Buka Google Sheets yang berisi daftar jam test drive.',
                    'Pastikan sheet dibagikan sebagai “Anyone with the link” (atau Publish to web).',
                    'Salin URL dari address bar, tempel di bawah, lalu klik “Muat spreadsheet”.',
                    'Setelah berhasil dimuat, lanjut ke langkah berikutnya — kolom jam bisa diatur nanti di langkah 5.',
                  ]}
                />
                <SpreadsheetUrlInput
                  url={sheetUrl}
                  onUrl={setSheetUrl}
                  onLoad={handleLoadUrl}
                  loading={sheetLoading}
                  error={sheetError}
                  disabled={!!progress}
                />
                <div className="flex items-center justify-end gap-3">
                  {!sheet && (
                    <p className="text-xs text-slate-400">
                      Hint: spreadsheet belum dimuat — langkah berikutnya tetap bisa dibuka.
                    </p>
                  )}
                  <Button onClick={() => setStep(1)}>
                    Lanjut ke foto
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Guide
                  steps={[
                    'Klik “Pilih folder”, lalu pilih folder yang berisi foto mentah (JPG/PNG).',
                    'Semua file di folder (termasuk subfolder) akan dipindai otomatis.',
                    'Perhatikan urutan file — urutan ini yang menentukan pasangan foto ↔ jam.',
                    'Foto bisa dipilih sebelum spreadsheet dimuat.',
                  ]}
                />
                <FolderSelector
                  selection={folder}
                  onPick={handlePickFolder}
                  unsupported={!folderSupported}
                  disabled={!!progress}
                />
                {folderError && <ErrorBanner message={folderError} />}
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep(0)}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  {photos.length === 0 && (
                    <p className="text-xs text-slate-400">
                      Hint: belum ada folder terpilih — crop butuh foto sebagai preview.
                    </p>
                  )}
                  <Button onClick={() => setStep(2)}>
                    Lanjut ke crop
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Guide
                  steps={[
                    'Pilih salah satu foto sebagai preview.',
                    'Geser kotak putih ke area yang diinginkan, tarik sudut kanan bawah untuk mengubah ukuran.',
                    'Klik “Confirm crop” — posisi disimpan proporsional dan dipakai ke semua foto.',
                  ]}
                />
                <CropEditor
                  photos={photos}
                  template={template}
                  onConfirm={(t) => {
                    setTemplate(t);
                    setStep(3);
                  }}
                  disabled={!!progress}
                />
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  {!template && (
                    <p className="text-xs text-slate-400">
                      Hint: konfirmasi crop dulu dengan tombol di panel atas.
                    </p>
                  )}
                  <Button onClick={() => setStep(3)}>
                    Lanjut ke tanggal
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <Guide
                  steps={[
                    'Pilih sumber tanggal: kolom spreadsheet (satu tanggal per baris) atau satu tanggal manual.',
                    'Mode kolom: pilih kolom yang berisi daftar tanggal — tiap baris punya tanggal sendiri.',
                    'Mode manual: ketik satu tanggal yang dipakai untuk semua foto.',
                    'Tanggal digabung dengan jam tiap foto menjadi timestamp akhir.',
                  ]}
                />
                <TimestampInput
                  sheet={sheet}
                  headerRow={selection.headerRow}
                  dateSource={selection.dateSource}
                  dateColumn={selection.dateColumn}
                  dateInput={dateInput}
                  onDateSource={(source) => setSelection({ ...selection, dateSource: source })}
                  onDateColumn={(column) => setSelection({ ...selection, dateColumn: column })}
                  onDateChange={setDateInput}
                  formatId={DEFAULT_FORMAT_ID}
                  disabled={!!progress}
                />
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  {!dateReady && (
                    <p className="text-xs text-slate-400">
                      Hint: {selection.dateSource === 'manual'
                        ? 'tanggal manual belum valid.'
                        : 'kolom tanggal belum dipilih.'}
                    </p>
                  )}
                  <Button onClick={() => setStep(4)}>
                    Lanjut ke kolom jam
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <Guide
                  steps={[
                    'Pilih worksheet (gid) jika data bukan di tab pertama.',
                    'Atur baris header dan baris awal data bila terdeteksi salah.',
                    'Pilih sumber jam: kolom spreadsheet (satu jam per baris) atau satu jam manual untuk semua foto.',
                    'Periksa tabel pasangan foto ↔ timestamp di bawah sebelum lanjut.',
                  ]}
                />
                {sheet ? (
                  <>
                    <ColumnSelector
                      sheet={sheet}
                      config={selection}
                      onConfig={setSelection}
                      gidSelection={gidSelection}
                      onWorksheet={handleWorksheet}
                      loadingWorksheet={worksheetLoading}
                      manualTime={timeInput}
                      onManualTime={setTimeInput}
                      disabled={!!progress}
                    />
                    {sheetError && <ErrorBanner message={sheetError} />}
                    {mapping && (
                      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm shadow-slate-900/5">
                        <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                          Review mapping sebelum proses
                        </h2>
                        <p className="mt-1 text-xs text-slate-500">
                          Foto diurutkan berdasarkan nama file lalu dipasangkan berurutan dengan
                          list timestamp. Periksa pasangan di bawah sebelum menjalankan proses.
                        </p>
                        <div className="mt-5">
                          <MappingPreview
                            mapping={mapping}
                            formatId={DEFAULT_FORMAT_ID}
                            onEditCell={handleEditCell}
                            editedRows={editedRowNumbers}
                            disabled={!!progress}
                          />
                        </div>
                      </div>
                    )}
                  </>
                ) : selection.timeSource === 'manual' ? (
                  <ColumnSelector
                    sheet={sheet}
                    config={selection}
                    onConfig={setSelection}
                    gidSelection={gidSelection}
                    onWorksheet={handleWorksheet}
                    loadingWorksheet={worksheetLoading}
                    manualTime={timeInput}
                    onManualTime={setTimeInput}
                    disabled={!!progress}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
                    <Icons.database className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      Spreadsheet belum dimuat
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                      Muat dulu spreadsheet di langkah 1 untuk memilih kolom jam. Kamu tetap bisa
                      mengatur langkah lain sambil menunggu.
                    </p>
                    <Button variant="secondary" className="mt-4" onClick={() => setStep(0)}>
                      <Icons.link className="h-4 w-4" />
                      Ke langkah List Jam
                    </Button>
                  </div>
                )}
                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => setStep(3)}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  <Button onClick={() => setStep(5)}>
                    Lanjut ke proses
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <Guide
                  steps={[
                    'Periksa checklist kesiapan — item yang kurang bisa langsung diklik untuk dilengkapi.',
                    'Klik tombol proses lalu pilih folder tujuan.',
                    'Aplikasi membuat subfolder “Processed …” dan menyimpan hasil di sana.',
                    'Foto tanpa pasangan jam ikut tersimpan apa adanya di subfolder “Tanpa jam”.',
                    'Pantau progres secara langsung; hasil akhir tampil di langkah 7.',
                  ]}
                />

                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/5">
                  <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/60 via-violet-50/60 to-transparent px-6 py-4">
                    <h2 className="text-sm font-semibold tracking-tight text-slate-900">
                      Kesiapan batch
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {missing.length === 0
                        ? 'Semua siap — klik tombol proses di bawah.'
                        : `${missing.length} hal masih perlu dilengkapi. Klik item untuk melengkapinya.`}
                    </p>
                  </div>
                  <ul className="divide-y divide-slate-100 px-6 py-1 text-sm">
                    {missing.map((item) => (
                      <li
                        key={item.label}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-slate-600">
                          <Icons.alert className="h-4 w-4 shrink-0 text-amber-500" />
                          {item.label}
                        </span>
                        <Button
                          variant="secondary"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => setStep(item.step)}
                        >
                          Buka langkah {item.step + 1}
                          <Icons.arrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                    {missing.length === 0 && mapping && (
                      <li className="flex items-center gap-2 py-2.5 font-medium text-emerald-700">
                        <Icons.check className="h-4 w-4 shrink-0" />
                        <span>
                          {mapping.entries.length} foto siap diproses dengan timestamp.
                          {mapping.extraPhotos.length > 0 && (
                            <span className="font-normal text-slate-500">
                              {' '}+ {mapping.extraPhotos.length} foto tanpa jam akan disalin apa
                              adanya ke subfolder “Tanpa jam”.
                            </span>
                          )}
                        </span>
                      </li>
                    )}
                  </ul>

                  {mapping && mapping.entries.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-4 text-xs">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 font-semibold text-violet-700 ring-1 ring-inset ring-violet-200/60">
                        <Icons.clipboard className="h-3.5 w-3.5" />
                        Tanggal:{' '}
                        {selection.dateSource === 'manual'
                          ? dateValid
                            ? formatTimestamp(dateInput.trim(), '00:00', DEFAULT_FORMAT_ID).replace(
                                ' 00:00',
                                '',
                              )
                            : '-'
                          : dateColumnLabel
                            ? `kolom “${dateColumnLabel}”`
                            : '-'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200/60">
                        <Icons.clipboard className="h-3.5 w-3.5" />
                        Jam:{' '}
                        {selection.timeSource === 'manual'
                          ? timeValid
                            ? timeInput.trim()
                            : '-'
                          : timeColumnLabel
                            ? `kolom “${timeColumnLabel}”`
                            : '-'}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/60">
                        <Icons.image className="h-3.5 w-3.5" />
                        {mapping.entries.length} foto siap
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/60">
                        <Icons.settings className="h-3.5 w-3.5" />
                        Crop template aktif
                      </span>
                      {mapping.counts.invalidRows > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-700 ring-1 ring-inset ring-red-200/60">
                          <Icons.alert className="h-3.5 w-3.5" />
                          {mapping.counts.invalidRows} baris jam invalid akan gagal
                        </span>
                      )}
                      {mapping.extraPhotos.length > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/60">
                          <Icons.download className="h-3.5 w-3.5" />
                          {mapping.extraPhotos.length} foto tanpa jam → disalin ke “Tanpa jam”
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {progress && <ProcessingProgress progress={progress} />}
                {batchError && <ErrorBanner message={batchError} />}

                <div className="flex justify-between">
                  <Button variant="secondary" onClick={() => setStep(4)} disabled={!!progress}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  <Button onClick={handleProcess} disabled={!canProcess}>
                    {progress ? (
                      <>
                        <Icons.refresh className="h-4 w-4 animate-spin" />
                        Memproses…
                      </>
                    ) : (
                      <>
                        <Icons.download className="h-4 w-4" />
                        {missing.length === 0 && mapping
                          ? `Pilih folder output & proses ${mapping.entries.length} foto`
                          : 'Proses batch'}
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {step === 6 && (
              <>
                <Guide
                  steps={[
                    'Lihat ringkasan: total, sukses, dan gagal beserta alasannya.',
                    'File hasil ada di subfolder “Processed …” yang tadi dibuat.',
                    'Klik “Mulai batch baru” untuk mengosongkan semua dan mulai lagi.',
                  ]}
                />
                {output ? (
                  <>
                    <ResultPanel output={output} />
                    <div className="flex justify-between">
                      <Button variant="secondary" onClick={() => setStep(5)}>
                        <Icons.arrowLeft className="h-4 w-4" />
                        Kembali ke proses
                      </Button>
                      <Button onClick={reset}>
                        <Icons.refresh className="h-4 w-4" />
                        Mulai batch baru
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
                    <Icons.file className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      Belum ada hasil batch
                    </p>
                    <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                      Jalankan proses dulu di langkah 6. Setelah selesai, ringkasan hasil akan
                      tampil di sini.
                    </p>
                    <Button variant="secondary" className="mt-4" onClick={() => setStep(5)}>
                      <Icons.refresh className="h-4 w-4" />
                      Ke langkah Proses
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
          Semua pemrosesan berjalan lokal di browser Anda — foto asli tidak pernah diubah.
        </footer>
      </div>
    </div>
  );
}
