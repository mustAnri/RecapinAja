/**
 * Mode Cepat — a dedicated simplified flow with four tabs:
 *
 *   Atur Jam → Upload Foto → Proses (batch/manual) → Save
 *
 * No spreadsheet is needed: the timestamp comes from manual input — either
 * one date+time applied to every photo (manual) or a typed list of times,
 * one per line, paired with photos in filename order (batch).
 */
import { useMemo, useRef, useState } from 'react';
import type { BatchOutput, BatchProgress, CropTemplate, TimestampPosition } from '../../types/processing';
import {
  FilesystemError,
  PickerCancelledError,
  createSubfolder,
  pickInputFolder,
  pickOutputParent,
  supportsFolderAccess,
  type FolderSelection,
} from '../../services/filesystem';
import { processBatch } from '../../services/batchProcessor';
import { buildSequentialMapping } from '../../services/mapping';
import { buildTimeListRows } from '../../services/spreadsheet/parse';
import { sortPhotosByFilename } from '../../utils/imageOrdering';
import {
  DEFAULT_FORMAT_ID,
  MONTHS_ID,
  parseDateCell,
  parseTimeCell,
} from '../../utils/dateFormatter';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Guide,
  Icons,
  Tabs,
  Tilt3D,
  inputClasses,
} from '../ui';
import { FolderSelector } from '../FolderSelector/FolderSelector';
import { CropEditor } from '../CropEditor/CropEditor';
import { MappingPreview } from '../MappingPreview/MappingPreview';
import { ProcessingProgress } from '../ProcessingProgress/ProcessingProgress';
import { ResultPanel } from '../ResultPanel/ResultPanel';

export type QuickTab = 'jam' | 'foto' | 'proses' | 'save';
type TimeMode = 'single' | 'list';

function runStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
}

const QUICK_TABS: { id: QuickTab; label: string }[] = [
  { id: 'jam', label: '1 · Atur Jam' },
  { id: 'foto', label: '2 · Upload Foto' },
  { id: 'proses', label: '3 · Proses' },
  { id: 'save', label: '4 · Save' },
];

export function QuickMode() {
  const [tab, setTab] = useState<QuickTab>('jam');
  const [timeMode, setTimeMode] = useState<TimeMode>('single');
  const [dateInput, setDateInput] = useState('');
  const [timeInput, setTimeInput] = useState('');
  const [timeListText, setTimeListText] = useState('');
  /** Single fixed display format — no user-facing format choice. */
  const formatId = DEFAULT_FORMAT_ID;
  /** Where the timestamp text is anchored on the final (cropped) photo. */
  const [position, setPosition] = useState<TimestampPosition>('bottom-right');

  const [folder, setFolder] = useState<FolderSelection | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [template, setTemplate] = useState<CropTemplate | null>(null);

  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [output, setOutput] = useState<BatchOutput | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  const folderSupported = supportsFolderAccess();
  const photos = useMemo(() => (folder ? sortPhotosByFilename(folder.photos) : []), [folder]);

  /* ------------------------------ timestamp ------------------------------ */

  const dateTrimmed = dateInput.trim();
  const dateParts = dateTrimmed ? parseDateCell(dateTrimmed) : null;
  const datePreview = dateParts
    ? `${String(dateParts.day).padStart(2, '0')} ${MONTHS_ID[dateParts.month - 1]} ${dateParts.year}`
    : null;

  /** One line of time input per row; single mode replicates the one value. */
  const timeLines = useMemo(() => {
    if (timeMode === 'single') {
      return photos.length > 0 ? Array.from({ length: photos.length }, () => timeInput) : [];
    }
    return timeListText.split(/\r?\n/);
  }, [timeMode, timeInput, timeListText, photos.length]);

  const rows = useMemo(() => buildTimeListRows(dateInput, timeLines), [dateInput, timeLines]);
  const mapping = useMemo(() => buildSequentialMapping(photos, rows), [photos, rows]);

  const timeValid = timeInput.trim() !== '' && parseTimeCell(timeInput.trim()) !== null;
  const listStats = useMemo(() => {
    if (timeMode !== 'list') return null;
    const lines = timeListText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const valid = lines.filter((line) => parseTimeCell(line)).length;
    return { total: lines.length, valid, invalid: lines.length - valid };
  }, [timeMode, timeListText]);

  /** The time side is usable: manual needs a valid value, list needs ≥1 row. */
  const timeReady =
    timeMode === 'single' ? timeValid : (listStats?.total ?? 0) > 0 && dateParts !== null;
  const jamReady = dateParts !== null && timeReady;

  /* -------------------------------- photos ------------------------------- */

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

  /* -------------------------------- process ------------------------------ */

  const canProcess =
    photos.length > 0 &&
    mapping.entries.length > 0 &&
    jamReady &&
    !progress;

  const handleProcess = async () => {
    if (!canProcess) return;
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
        formatId,
        position,
        outputFolder,
        extraPhotos: mapping.extraPhotos,
        onProgress: (p) => {
          if (runIdRef.current === runId) setProgress(p);
        },
      });
      if (runIdRef.current !== runId) return;
      setOutput(result);
      setProgress(null);
      setTab('save');
    } catch (error) {
      setProgress(null);
      setBatchError(
        error instanceof FilesystemError
          ? error.message
          : 'Processing stopped unexpectedly — completed photos were already saved.',
      );
    }
  };

  const resetAll = () => {
    runIdRef.current += 1;
    setTab('jam');
    setTimeMode('single');
    setDateInput('');
    setTimeInput('');
    setTimeListText('');
    setPosition('bottom-right');
    setFolder(null);
    setTemplate(null);
    setProgress(null);
    setOutput(null);
    setBatchError(null);
    setFolderError(null);
  };

  /* --------------------------------- ui ---------------------------------- */

  const navButtons = (prev: QuickTab | null, next: QuickTab | null, nextLabel?: string) => (
    <div className="flex items-center justify-between gap-3">
      {prev ? (
        <Button variant="secondary" onClick={() => setTab(prev)}>
          <Icons.arrowLeft className="h-4 w-4" />
          Kembali
        </Button>
      ) : (
        <span />
      )}
      {next && (
        <Button onClick={() => setTab(next)}>
          {nextLabel ?? 'Lanjut'}
          <Icons.arrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={QUICK_TABS} active={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={jamReady ? 'emerald' : 'slate'}>
            {jamReady ? <Icons.check className="h-3 w-3" /> : <Icons.alert className="h-3 w-3" />}
            Jam {jamReady ? 'siap' : 'belum lengkap'}
          </Badge>
          <Badge tone={photos.length > 0 ? 'emerald' : 'slate'}>
            <Icons.image className="h-3 w-3" />
            {photos.length} foto
          </Badge>
          <Badge tone={template ? 'emerald' : 'slate'}>
            <Icons.settings className="h-3 w-3" />
            {template ? 'Crop 1:1 aktif' : 'Tanpa crop'}
          </Badge>
        </div>
      </div>

      {/* ------------------------------ 1 · Atur Jam ------------------------- */}
      <div key={tab} className="anim-step space-y-6">
      {tab === 'jam' && (
        <>
          <Guide
            steps={[
              'Isi tanggal — dipakai untuk semua foto (contoh: 20/05/2022 atau 20.05.2022).',
              'Mode “Satu jam untuk semua”: satu jam dipakai untuk setiap foto.',
              'Mode “List jam (batch)”: ketik satu jam per baris; baris ke-N dipasangkan dengan foto ke-N (urutan nama file).',
              'Jam boleh memakai titik dua atau titik — “21.22” dibaca sebagai 21:22.',
            ]}
          />

          <Card
            title="Tanggal"
            subtitle="Satu tanggal untuk semua foto"
            actions={
              dateTrimmed === '' ? undefined : dateParts ? (
                <Badge tone="emerald">
                  <Icons.check className="h-3.5 w-3.5" />
                  {datePreview}
                </Badge>
              ) : (
                <Badge tone="red">
                  <Icons.alert className="h-3.5 w-3.5" />
                  Format tidak dikenali
                </Badge>
              )
            }
          >
            <Field label="Tanggal" hint="DD/MM/YYYY, DD-MM-YYYY, atau DD.MM.YYYY">
              <input
                type="text"
                className={inputClasses}
                value={dateInput}
                placeholder="20/05/2022"
                disabled={!!progress}
                onChange={(event) => setDateInput(event.target.value)}
              />
            </Field>
          </Card>

          <Card
            title="Jam"
            subtitle={
              timeMode === 'single'
                ? 'Satu jam dipakai untuk semua foto (mode manual)'
                : 'Satu jam per baris, dipasangkan berurutan dengan foto (mode batch)'
            }
            actions={
              <Tabs
                tabs={[
                  { id: 'single', label: 'Satu jam untuk semua' },
                  { id: 'list', label: 'List jam (batch)' },
                ]}
                active={timeMode}
                onChange={(mode) => setTimeMode(mode)}
              />
            }
          >
            {timeMode === 'single' ? (
              <div className="max-w-xs space-y-2">
                <Field label="Jam" hint="HH:mm — titik juga diterima, contoh 21.22">
                  <input
                    type="text"
                    className={inputClasses}
                    value={timeInput}
                    placeholder="14:09"
                    disabled={!!progress}
                    onChange={(event) => setTimeInput(event.target.value)}
                  />
                </Field>
                {timeInput.trim() !== '' &&
                  (timeValid ? (
                    <Badge tone="emerald">
                      <Icons.check className="h-3.5 w-3.5" />
                      Jam valid
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      <Icons.alert className="h-3.5 w-3.5" />
                      Jam tidak valid
                    </Badge>
                  ))}
              </div>
            ) : (
              <div className="space-y-3">
                <Field
                  label="Daftar jam — satu per baris"
                  hint="Baris kosong dilewati. Urutan baris = urutan foto berdasarkan nama file."
                >
                  <textarea
                    className={`${inputClasses} min-h-40 font-mono text-xs leading-relaxed`}
                    value={timeListText}
                    placeholder={'08:15\n09:30\n10.45\n13:20'}
                    disabled={!!progress}
                    onChange={(event) => setTimeListText(event.target.value)}
                  />
                </Field>
                {listStats && listStats.total > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="slate">{listStats.total} baris terisi</Badge>
                    <Badge tone={listStats.valid > 0 ? 'emerald' : 'slate'}>
                      <Icons.check className="h-3.5 w-3.5" />
                      {listStats.valid} jam valid
                    </Badge>
                    {listStats.invalid > 0 && (
                      <Badge tone="red">
                        <Icons.alert className="h-3.5 w-3.5" />
                        {listStats.invalid} jam invalid — akan gagal, tidak ditebak
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {navButtons(null, 'foto', 'Lanjut ke upload foto')}
        </>
      )}

      {/* ----------------------------- 2 · Upload Foto ----------------------- */}
      {tab === 'foto' && (
        <>
          <Guide
            steps={[
              'Klik “Pilih folder”, lalu pilih folder berisi foto mentah (JPG/PNG).',
              'Foto diurutkan berdasarkan nama file — urutan ini yang dipasangkan dengan daftar jam.',
              timeMode === 'list'
                ? 'Jumlah baris jam yang terisi menentukan berapa foto yang mendapat timestamp.'
                : 'Semua foto mendapat jam yang sama.',
            ]}
          />
          <FolderSelector
            selection={folder}
            onPick={handlePickFolder}
            unsupported={!folderSupported}
            disabled={!!progress}
          />
          {folderError && <ErrorBanner message={folderError} />}
          {navButtons('jam', 'proses', 'Lanjut ke proses')}
        </>
      )}

      {/* ------------------------------- 3 · Proses -------------------------- */}
      {tab === 'proses' && (
        <>
          <Guide
            steps={[
              'Pilih posisi timestamp — crop 1:1 opsional (aktifkan toggle bila perlu).',
              'Periksa pasangan foto ↔ timestamp di tabel preview.',
              'Klik proses lalu pilih folder tujuan; hasil disimpan di subfolder “Processed …”.',
              'Foto tanpa pasangan jam disalin apa adanya ke subfolder “Tanpa jam”.',
            ]}
          />

          {photos.length > 0 ? (
            <CropEditor
              photos={photos}
              template={template}
              onConfirm={setTemplate}
              position={position}
              onPositionChange={setPosition}
              disabled={!!progress}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
              <Icons.image className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Belum ada foto</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Pilih folder foto dulu di tab “2 · Upload Foto”.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => setTab('foto')}>
                <Icons.image className="h-4 w-4" />
                Ke Upload Foto
              </Button>
            </div>
          )}

          {mapping.entries.length > 0 && (
            <Card
              title="Preview pasangan foto ↔ timestamp"
              subtitle="Periksa sebelum proses — jam yang invalid akan gagal, tidak pernah ditebak"
            >
              <MappingPreview mapping={mapping} formatId={formatId} disabled={!!progress} />
            </Card>
          )}

          {progress && <ProcessingProgress progress={progress} />}
          {batchError && <ErrorBanner message={batchError} />}

          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => setTab('foto')} disabled={!!progress}>
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
                  {canProcess
                    ? `Pilih folder output & proses ${mapping.entries.length} foto`
                    : 'Proses'}
                </>
              )}
            </Button>
          </div>
        </>
      )}

      {/* -------------------------------- 4 · Save --------------------------- */}
      {tab === 'save' && (
        <>
          {output ? (
            <>
              <ResultPanel output={output} />
              <div className="flex items-center justify-between gap-3">
                <Button variant="secondary" onClick={() => setTab('proses')}>
                  <Icons.arrowLeft className="h-4 w-4" />
                  Kembali ke proses
                </Button>
                <Button onClick={resetAll}>
                  <Icons.refresh className="h-4 w-4" />
                  Mulai batch baru
                </Button>
              </div>
            </>
          ) : (
            <Tilt3D maxTilt={3} glare={false}>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
                <Icons.file className="anim-float mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">Belum ada hasil</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                  Jalankan proses dulu di tab “3 · Proses”. Setelah selesai, ringkasan hasil tampil
                  di sini.
                </p>
                <Button variant="secondary" className="mt-4" onClick={() => setTab('proses')}>
                  <Icons.refresh className="h-4 w-4" />
                  Ke Proses
                </Button>
              </div>
            </Tilt3D>
          )}
        </>
      )}
      </div>
    </div>
  );
}
