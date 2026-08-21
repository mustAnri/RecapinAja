/**
 * App shell — SaaS-style layout: dark workflow sidebar + sticky header with
 * step context, driving the eight-step flow:
 *
 *   1. List Jam      — paste the Google Spreadsheet link (source of the times)
 *   2. Foto          — pick the local folder with the raw photos
 *   3. Atur Lokasi   — choose location zones for randomization
 *   4. Atur Timestamp — choose timestamp position and optional crop
 *   5. Tanggal       — date from a spreadsheet column or one manual value
 *   6. Kolom Jam     — worksheet / rows / time source + review mapping
 *   7. Proses        — run the batch into a chosen output folder
 *   8. Hasil         — summary of what was saved
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import type { ImportedSheet, RowSelection } from './types/spreadsheet';
import { EMPTY_SELECTION } from './types/spreadsheet';
import type {
  BatchOutput,
  BatchProgress,
  BatchResult,
  CropTemplate,
  TimestampPosition,
} from './types/processing';
import {
  PickerCancelledError,
  createSubfolder,
  pickInputFolder,
  pickOutputParent,
  supportsFolderAccess,
  type FolderSelection,
  type OutputFolder,
} from './services/filesystem';
import { loadSpreadsheet } from './services/spreadsheet';
import { parseDelimitedText } from './services/spreadsheet/csvParser';
import {
  applyRowOverrides,
  extractTimestampRows,
  guessDateColumn,
  guessNameColumn,
  guessTimeColumn,
  parseSheetValues,
  rowHeaders,
  type RowOverrides,
} from './services/spreadsheet/parse';
import { applyManualPairs, buildAutoPairs, mappingFromPairs } from './services/mapping';
import { expandLocationsForBatch } from './services/batchProcessor';
import { DEFAULT_FORMAT_ID, parseDateCell, parseTimeCell } from './utils/dateFormatter';
import { sortPhotosByFilename } from './utils/imageOrdering';
import { Button, ErrorBanner, Guide, Icons, Tilt3D } from './components/ui';
import { Background3D } from './components/Background3D/Background3D';
import { FolderSelector } from './components/FolderSelector/FolderSelector';
import { SpreadsheetUrlInput } from './components/SpreadsheetUrlInput/SpreadsheetUrlInput';
import { ColumnSelector } from './components/ColumnSelector/ColumnSelector';
import { CropEditor } from './components/CropEditor/CropEditor';
import { TimestampInput } from './components/TimestampInput/TimestampInput';
import { ResultPanel } from './components/ResultPanel/ResultPanel';
import { LocationInput } from './components/LocationInput/LocationInput';
import { PositionPicker } from './components/PositionPicker/PositionPicker';
import type { LocationData } from './components/LocationInput/LocationInput';
import { LocationList } from './components/LocationList/LocationList';
import type { Address, Location, ZoneAddressEntry, ZoneFeaturePool } from './types/location';
import { getLocationManager } from './services/locationManager';
import { detectZoneFeatures } from './services/geocoder/overpass';
import type { OverpassZoneFeature } from './services/geocoder/overpass';
import { ReviewStation } from './components/ReviewStation/ReviewStation';

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
    title: 'Atur Lokasi',
    subtitle: 'Tentukan zone area untuk random lokasi',
    icon: Icons.mapPin,
  },
  {
    title: 'Atur Timestamp',
    subtitle: 'Posisi timestamp + crop 1:1 opsional untuk semua foto',
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
    title: 'Review',
    subtitle: 'Cek tiap foto satu-satu — approve, edit, skip, atau tandai sebagai unsure',
    icon: Icons.eye,
  },
  {
    title: 'Hasil',
    subtitle: 'Ringkasan file yang tersimpan',
    icon: Icons.check,
  },
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

function runStamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
}

/**
 * Map Overpass zone features into the app's Address shape (best-effort).
 * Indonesian OSM admin levels vary; the mapping below covers the common ones:
 * 4 = provinsi, 5-7 = kabupaten/kota, 8-10 = kecamatan/kelurahan.
 */
function zoneFeaturesToAddress(
  features: OverpassZoneFeature[],
  fallbackFullAddress: string,
): Address {
  const road = features.find((f) => f.kind === 'road');
  const adminByLevels = (levels: string[]): string =>
    features.find(
      (f) => f.kind === 'admin' && f.adminLevel !== undefined && levels.includes(f.adminLevel),
    )?.name ?? '';

  const street = road?.name ?? '';
  const kecamatan = adminByLevels(['8', '9', '10']);
  const kabupaten = adminByLevels(['5', '6', '7']);
  const provinsi = adminByLevels(['4']);
  const parts = [street, kecamatan, kabupaten, provinsi].filter((p) => p.trim().length > 0);

  return {
    street,
    kecamatan,
    kabupaten,
    provinsi,
    fullAddress: parts.length > 0 ? parts.join(', ') : fallbackFullAddress,
  };
}

/** Collect matching feature names, trimmed, deduplicated, empties dropped. */
function uniqueFeatureNames(
  features: OverpassZoneFeature[],
  matches: (feature: OverpassZoneFeature) => boolean,
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const feature of features) {
    if (!matches(feature)) continue;
    const name = feature.name.trim();
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/**
 * Group detected Overpass features into a pool that the batch processor
 * expands into one unique address per photo. Indonesian admin levels:
 * 4 = provinsi, 5-7 = kabupaten/kota, 8-10 = kecamatan/kelurahan.
 */
function zoneFeaturePoolFrom(features: OverpassZoneFeature[]): ZoneFeaturePool {
  const addresses: ZoneAddressEntry[] = [];
  const seenAddresses = new Set<string>();
  for (const feature of features) {
    if (feature.kind !== 'address') continue;
    const street = (feature.street ?? feature.name).trim();
    if (street === '') continue;
    const houseNumber = feature.houseNumber?.trim() ?? '';
    const key = `${houseNumber}|${street}`;
    if (seenAddresses.has(key)) continue;
    seenAddresses.add(key);
    const entry: ZoneAddressEntry = { street };
    if (houseNumber !== '') entry.houseNumber = houseNumber;
    addresses.push(entry);
  }

  const adminAt = (levels: string[]) => (feature: OverpassZoneFeature) =>
    feature.kind === 'admin' && feature.adminLevel !== undefined && levels.includes(feature.adminLevel);

  return {
    addresses,
    roads: uniqueFeatureNames(features, (feature) => feature.kind === 'road'),
    kecamatan: uniqueFeatureNames(features, adminAt(['8', '9', '10'])),
    kabupaten: uniqueFeatureNames(features, adminAt(['5', '6', '7'])),
    provinsi: uniqueFeatureNames(features, adminAt(['4'])),
  };
}

/**
 * Core zone enrichment (module-level so hooks can call it without dependency
 * churn): detect OSM features inside the zone radius, then rebuild the stored
 * address and feature pool. Returns the updated location, or null for
 * radius-less point locations.
 */
async function enrichZoneAddressCore(
  manager: { update: (id: string | number, updates: Partial<Location>) => Location },
  location: Location,
): Promise<Location | null> {
  if (location.radiusMeters === undefined) return null;
  // The Overpass service caps detection radius at 10 km.
  const radius = Math.min(location.radiusMeters, 10000);
  const { features } = await detectZoneFeatures(
    { lat: location.coordinates.lat, lng: location.coordinates.lng },
    radius,
  );
  const address = zoneFeaturesToAddress(features, location.address.fullAddress);
  const zoneFeatures = zoneFeaturePoolFrom(features);
  return manager.update(location.id, { address, zoneFeatures });
}

/** Replace one location in the state list by id. */
function mergeUpdatedLocation(prev: Location[], updated: Location): Location[] {
  return prev.map((loc) => (loc.id === updated.id ? updated : loc));
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
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-indigo-500/40 ring-1 ring-white/20">
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
    <Tilt3D maxTilt={4} glare={false} className="anim-fade-up">
      <div key={title} className="flex items-start gap-4">
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
    </Tilt3D>
  );
}

export default function App() {
  const [step, setStep] = useState<StepIndex>(0);
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

  // Step 3 — location zones for random area selection
  const [locationManager] = useState(() => getLocationManager());
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string | number>>(new Set());
  const [randomLocation, setRandomLocation] = useState<Location | null>(null);

  // Step 3 — crop template
  const [template, setTemplate] = useState<CropTemplate | null>(null);

  // Step 4 — manual date (used when dateSource is "manual")
  const [dateInput, setDateInput] = useState('');

  // Step 5 — column selection + manual time (used when timeSource is "manual")
  const [selection, setSelection] = useState<RowSelection>(EMPTY_SELECTION);
  const [timeInput, setTimeInput] = useState('');


  /** Per-row manual edits made in the mapping preview (replace/edit cells). */
  const [overrides, setOverrides] = useState<RowOverrides>({});

  /**
   * Manual photo → row assignments made in the mapping preview:
   * filename → row index into the extracted rows, or `null` when the user
   * explicitly un-paired a photo (copied as-is, no timestamp).
   */
  const [manualPairs, setManualPairs] = useState<Map<string, number | null>>(new Map());

  /** Single fixed display format — no user-facing format choice. */
  const formatId = DEFAULT_FORMAT_ID;
  /** Where the timestamp text is anchored on the final (cropped) photo. */
  const [position, setPosition] = useState<TimestampPosition>('bottom-right');
  /** Where the location overlay is anchored on the final photo. */
  const [locationPosition, setLocationPosition] = useState<TimestampPosition>('top-left');

  // Steps 6/7 — batch run
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [output, setOutput] = useState<BatchOutput | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  /** Ensures the location-manager init effect runs only once. */
  const locationsInitializedRef = useRef(false);

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

  /** Auto-strategy pairs (filename → row index) for the chosen match mode. */
  const autoPairs = useMemo(
    () => (extracted ? buildAutoPairs(selection.matchMode, photos, extracted.rows) : null),
    [photos, extracted, selection.matchMode],
  );

  /** Final pairs after the user's manual assignments are layered on top. */
  const finalPairs = useMemo(() => {
    if (!extracted || !autoPairs) return new Map<string, number>();
    return applyManualPairs(photos, extracted.rows, autoPairs, manualPairs);
  }, [photos, extracted, autoPairs, manualPairs]);

  const mapping = useMemo(() => {
    if (!extracted || !autoPairs) return null;
    return mappingFromPairs(photos, extracted.rows, finalPairs);
  }, [photos, extracted, autoPairs, finalPairs]);

  /** Selected location zones expanded into one address per photo. */
  const expandedLocations = useMemo(() => {
    const selected = locations.filter((location) => selectedLocationIds.has(location.id));
    if (selected.length === 0) return [];
    return expandLocationsForBatch(selected, photos.length);
  }, [locations, selectedLocationIds, photos.length]);

  /* ------------------------- step 1: spreadsheet ------------------------- */

  const applyLoadedSheet = (loaded: ImportedSheet) => {
    setSheet(loaded);
    setGidSelection(loaded.gid);
    setOutput(null);
    setOverrides({}); // new data — old manual edits no longer apply
    setManualPairs(new Map()); // new data — old row assignments no longer apply
    const headers = rowHeaders(loaded, 1);
    setSelection((prev) => ({
      ...prev,
      timeColumn: guessTimeColumn(headers),
      dateColumn: guessDateColumn(headers),
      nameColumn: guessNameColumn(headers),
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

  /** Local CSV/TSV import — the file is parsed entirely in the browser. */
  const handleImportCsv = async (file: File) => {
    setSheetLoading(true);
    setSheetError(null);
    try {
      const text = await file.text();
      const { headers, rows } = parseSheetValues(parseDelimitedText(text));
      if (rows.length < 2) {
        throw new Error('File CSV tidak berisi baris data — hanya header yang ditemukan.');
      }
      applyLoadedSheet({
        sourceTitle: file.name,
        spreadsheetId: null,
        gid: 0,
        headers,
        rows,
      });
      setStep((s) => (s === 0 ? 1 : s));
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : 'Unable to read that CSV file.');
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

  /** Manual assignment from the mapping preview: pair a photo with a row. */
  const handleAssignRow = (filename: string, rowIndex: number | null) => {
    setManualPairs((prev) => {
      const next = new Map(prev);
      next.set(filename, rowIndex);
      return next;
    });
    setOutput(null); // the previous run no longer reflects this mapping
  };

  /* --------------------------- step 2: photos ---------------------------- */

  const handlePickFolder = async () => {
    setFolderError(null);
    try {
      const picked = await pickInputFolder();
      setFolder(picked);
      setTemplate(null); // crop depends on the photo set
      setOutput(null);
      setManualPairs(new Map()); // new photo set — old assignments no longer apply
    } catch (error) {
      if (error instanceof PickerCancelledError) return;
      setFolderError(error instanceof Error ? error.message : 'Unable to open that folder.');
    }
  };

  /* ----------------------------- step 6: review ----------------------------- */

  const [outputFolder, setOutputFolder] = useState<OutputFolder | null>(null);
  /** Results accumulated as each photo is approved and processed. */
  const [reviewResults, setReviewResults] = useState<BatchResult[]>([]);

  const handlePickOutputFolder = async (): Promise<OutputFolder | null> => {
    try {
      const parent = await pickOutputParent();
      const folder = await createSubfolder(parent, `Processed ${runStamp()}`);
      setOutputFolder(folder);
      return folder;
    } catch (error) {
      if (error instanceof PickerCancelledError) return null;
      setBatchError(
        error instanceof Error ? error.message : 'Unable to prepare the output folder.',
      );
      return null;
    }
  };

  const handleProcessed = (filename: string, result: BatchResult) => {
    setReviewResults((prev) => [...prev, result]);
    if (result.status !== 'success') {
      setBatchError(`Foto ${filename}: ${result.error ?? 'pemrosesan gagal.'}`);
    }
  };

  const handleReviewSkip = (filename: string) => {
    setReviewResults((prev) => [
      ...prev,
      { filename, status: 'failed', error: 'Dilewati saat review.' },
    ]);
  };

  const handleReviewUnsure = (filename: string) => {
    setReviewResults((prev) => [
      ...prev,
      { filename, status: 'failed', error: 'Ditandai unsure — belum diproses.' },
    ]);
  };

  /** Review finished — build the summary and move to the results step. */
  const handleReviewComplete = (summary: { approved: number; skipped: number; unsure: number; failed: number }) => {
    const results = reviewResults;
    setOutput({
      results,
      summary: {
        total: results.length,
        successful: summary.approved,
        failed: summary.failed,
        copied: 0,
        skipped: summary.skipped,
        unsure: summary.unsure,
      },
      outputFolderName: outputFolder?.name ?? '—',
    });
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
    setManualPairs(new Map());
    setProgress(null);
    setOutput(null);
    setOutputFolder(null);
    setReviewResults([]);
    setBatchError(null);
    setSheetError(null);
    setFolderError(null);
  };

  /* -------------------------------- render ------------------------------- */

  /* Checklist of what is still needed before processing (no lock — informational). */
  const missing: { label: string; step: StepIndex }[] = [];
  if (!sheet) missing.push({ label: 'Spreadsheet belum dimuat', step: 0 });
  if (photos.length === 0) missing.push({ label: 'Folder foto belum dipilih', step: 1 });
  if (selectedLocationIds.size === 0) missing.push({ label: 'Belum ada zone lokasi yang dipilih', step: 2 });
   if (selection.dateSource === 'sheet') {
     if (selection.dateColumn === null)
       missing.push({ label: 'Kolom tanggal belum dipilih', step: 4 });
   } else if (!dateValid) {
     missing.push({ label: 'Tanggal manual belum diisi / tidak valid', step: 4 });
   }
   if (selection.timeSource === 'sheet') {
     if (selection.timeColumn === null)
       missing.push({ label: 'Kolom jam belum dipilih', step: 5 });
   } else if (!timeValid) {
     missing.push({ label: 'Jam manual belum diisi / tidak valid', step: 5 });
   }
   if (selection.matchMode === 'byName' && selection.nameColumn === null)
     missing.push({ label: 'Kolom nama belum dipilih', step: 5 });
   if (sheet && photos.length > 0 && (!mapping || mapping.entries.length === 0))
     missing.push({ label: 'Belum ada pasangan foto ↔ jam', step: 5 });

  /* ------------------------- step 3: location zones --------------------- */

  const handleSaveLocation = (locationData: LocationData) => {
    (async () => {
      try {
        const displayName = locationData.displayName.trim();
        const location = await locationManager.addByCoordinates(
          { lat: locationData.latitude, lng: locationData.longitude },
          displayName || locationData.areaName,
          locationData.radiusMeters,
          locationData.address,
        );
        setLocations((prev) => [...prev, location]);
        await enrichZoneAddress(location);
      } catch (error) {
        console.error('Failed to save location:', error);
      }
    })();
  };

  /**
   * Best-effort enrichment: after a zone is saved, detect named roads and
   * administrative areas inside the circle via Overpass and replace the
   * stored address with real data. Failures keep the existing address.
   */
  const enrichZoneAddress = async (location: Location): Promise<void> => {
    try {
      const updated = await enrichZoneAddressCore(locationManager, location);
      if (updated !== null) {
        setLocations((prev) => mergeUpdatedLocation(prev, updated));
      }
    } catch (error) {
      console.warn('Zone feature detection failed; keeping the saved address.', error);
    }
  };

  // Initialize location manager once on mount, then re-enrich zones saved
  // before feature-pool support existed so they can still expand into unique
  // per-photo addresses.
  useEffect(() => {
    if (locationsInitializedRef.current) return;
    locationsInitializedRef.current = true;
    (async () => {
      try {
        await locationManager.initialize();
        const loaded = locationManager.getAll();
        setLocations(loaded);
        for (const location of loaded) {
          if (location.radiusMeters !== undefined && !location.zoneFeatures) {
            try {
              const updated = await enrichZoneAddressCore(locationManager, location);
              if (updated !== null) {
                setLocations((prev) => mergeUpdatedLocation(prev, updated));
              }
            } catch (error) {
              console.warn('Zone re-enrichment failed; keeping the saved address.', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to initialize location manager:', error);
      }
    })();
  }, [locationManager]);

  const handleToggleLocationSelection = (id: string | number, isSelected: boolean) => {
    setSelectedLocationIds(prev => {
      const next = new Set(prev);
      if (isSelected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleDeleteLocation = (id: string | number) => {
    locationManager.remove(id);
    setLocations(prev => prev.filter(loc => loc.id !== id));
    setSelectedLocationIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (randomLocation?.id === id) {
      setRandomLocation(null);
    }
  };

  const handleRandomize = () => {
    if (selectedLocationIds.size === 0 || locations.length === 0) return;
    
    const selected = locations.filter(loc => selectedLocationIds.has(loc.id));
    if (selected.length === 0) return;
    
    const randomIndex = Math.floor(Math.random() * selected.length);
    setRandomLocation(selected[randomIndex]);
  };

  const stepDone = (index: StepIndex): boolean => {
    switch (index) {
      case 0:
        return !!sheet;
      case 1:
        return photos.length > 0;
      case 2:
        return selectedLocationIds.size > 0; // At least one location selected
      case 3:
        return true; // posisi timestamp selalu siap; crop opsional
      case 4:
        return dateReady;
      case 5:
        return timeReady && !!mapping && mapping.entries.length > 0;
      case 6:
        return photos.length > 0 && !!extracted?.rows && !!autoPairs;
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





  return (
    <div className="min-h-screen">
      <Background3D />
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

        <nav aria-label="Workflow steps" className="sidebar-scroll flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {STEPS.map((stepMeta, index) => {
            const isActive = index === step;
            const done = stepDone(index as StepIndex);
            const Icon = stepMeta.icon;
            return (
              <button
                key={stepMeta.title}
                type="button"
                onClick={() => setStep(index as StepIndex)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:translate-x-0.5 ${
                  isActive ? 'bg-white/10 shadow-lg shadow-indigo-950/40 ring-1 ring-inset ring-white/15' : 'hover:bg-white/5'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all duration-300 ${
                    done
                      ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/30'
                      : isActive
                        ? 'glow-pulse bg-white/10 text-white ring-1 ring-inset ring-white/20'
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

        <Tilt3D className="mx-3 mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Icons.lock className="h-4 w-4 text-emerald-400" />
            100% client-side
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Crop, timestamp, dan penyimpanan berjalan di browser. Foto tidak pernah diunggah ke
            server mana pun.
          </p>
        </Tilt3D>
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
              className="shimmer h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-all duration-500"
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
               badge={step === 7 ? 'Batch selesai' : undefined}
            />

            <div key={step} className="anim-step space-y-6">
            {step === 0 && (
              <>
                <Guide
                  steps={[
                    'Punya link Google Sheets? Pastikan dibagikan “Anyone with the link”, tempel URL, lalu klik “Muat spreadsheet”.',
                    'Punya file CSV (mis. export Google Forms)? Klik “Unggah file CSV” — file dibaca lokal, tidak diunggah ke mana pun.',
                    'Kolom tanggal, jam, dan nama diprediksi otomatis dari header — bisa dikoreksi di langkah 4 & 5.',
                    'Setelah data dimuat, lanjut ke langkah berikutnya.',
                  ]}
                />
                <SpreadsheetUrlInput
                  url={sheetUrl}
                  onUrl={setSheetUrl}
                  onLoad={handleLoadUrl}
                  onImportCsv={handleImportCsv}
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
                     Lanjut ke lokasi
                     <Icons.arrowRight className="h-4 w-4" />
                   </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Guide
                  steps={[
                    'Tambahkan area/zone yang akan digunakan untuk random lokasi.',
                    'Klik "Simpan Lokasi" setelah memasukkan nama area atau koordinat.',
                    'Centang zone yang ingin digunakan untuk randomisasi.',
                    'Klik "Random Zone" untuk mendapatkan lokasi acak dari zone yang dipilih.',
                    'Lokasi random akan ditampilkan dan siap digunakan di proses selanjutnya.',
                  ]}
                />
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <LocationInput onSave={handleSaveLocation} initialMode="area" disabled={!!progress} />
                  
                  <LocationList
                    locations={locations}
                    selectedIds={selectedLocationIds}
                    onToggle={handleToggleLocationSelection}
                    onDelete={handleDeleteLocation}
                    maxSelection={0} // unlimited selection
                    title="Zone Area"
                    subtitle="Pilih zone yang akan digunakan untuk random"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/5">
                  <PositionPicker
                    label="Posisi lokasi di foto"
                    value={locationPosition}
                    onChange={setLocationPosition}
                    disabled={!!progress}
                    hint={
                      locationPosition === position
                        ? 'Posisi sama dengan timestamp — keduanya digabung jadi satu blok: timestamp dulu, lalu lokasi di bawahnya.'
                        : 'Pilih sudut tempat teks lokasi ditempel pada tiap foto.'
                    }
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-indigo-900">
                      Random Lokasi Terpilih
                    </p>
                    {randomLocation ? (
                      <div className="mt-2 flex items-start gap-3">
                        <Icons.mapPin className="h-5 w-5 shrink-0 text-indigo-600 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-indigo-900">{randomLocation.areaName}</p>
                          <p className="text-xs text-indigo-600">
                            {randomLocation.coordinates.lat.toFixed(6)}, {randomLocation.coordinates.lng.toFixed(6)}
                          </p>
                          <p className="text-xs text-indigo-500 mt-1">
                            {randomLocation.address.fullAddress}
                          </p>
                        </div>
                        <button
                          className="ml-auto px-3 py-1 text-xs rounded-lg bg-white hover:bg-slate-50 text-slate-600 font-medium border border-slate-200"
                          type="button"
                          onClick={() => setRandomLocation(null)}
                          disabled={!!progress}
                        >
                          Reset
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-indigo-600 mt-2">
                        Belum ada zone yang dipilih — centang zone di daftar untuk memulai random.
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleRandomize}
                    disabled={selectedLocationIds.size === 0 || !!progress}
                  >
                    🎲 Random Zone
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep(1)}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  <Button onClick={() => setStep(3)}>
                    Lanjut ke crop
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <Guide
                  steps={[
                    'Pilih posisi timestamp (6 titik) — kotak "timestamp" di preview menunjukkan letaknya.',
                    'Crop 1:1 opsional: aktifkan toggle bila ingin semua foto dipotong persegi.',
                    'Geser kotak putih ke area yang diinginkan, tarik sudut kanan bawah untuk mengubah ukuran.',
                    'Klik "Confirm crop" bila memakai crop — tanpa crop pun langkah ini langsung siap.',
                  ]}
                />
                <CropEditor
                  photos={photos}
                  template={template}
                  onConfirm={(t) => {
                    setTemplate(t);
                    setStep(4);
                  }}
                  position={position}
                  onPositionChange={setPosition}
                  disabled={!!progress}
                />
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep(2)}>
                    <Icons.arrowLeft className="h-4 w-4" />
                    Kembali
                  </Button>
                  {!template && (
                    <p className="text-xs text-slate-400">
                      Hint: crop opsional — klik lanjut jika sudah siap.
                    </p>
                  )}
                  <Button onClick={() => setStep(4)}>
                    Lanjut ke tanggal
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
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
                  formatId={formatId}
                  disabled={!!progress}
                />
                <div className="flex items-center justify-between gap-3">
                  <Button variant="secondary" onClick={() => setStep(3)}>
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
                  <Button onClick={() => setStep(5)}>
                    Lanjut ke kolom jam
                    <Icons.arrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

{step === 5 && (
        <>
          <Guide
            steps={[
              'Pilih worksheet (gid) jika data bukan di tab pertama.',
              'Atur baris header dan baris awal data bila terdeteksi salah.',
              'Pilih sumber jam: kolom spreadsheet (satu jam per baris) atau satu jam manual untuk semua foto.',
              'Pilih cara memasangkan foto ↔ baris: berurutan, atau berdasarkan nama file ↔ kolom nama.',
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
              {mapping && mapping.entries.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-900/5">
                  <Icons.check className="h-5 w-5 text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {mapping.entries.length} pasangan foto ↔ jam siap
                    </p>
                    <p className="text-xs text-slate-500">
                      Pasangan lengkap bisa diperiksa dan diubah per-foto di langkah Review berikutnya.
                    </p>
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
            <Button variant="secondary" onClick={() => setStep(4)}>
              <Icons.arrowLeft className="h-4 w-4" />
              Kembali
            </Button>
            <Button onClick={() => setStep(6)}>
              Lanjut ke review
              <Icons.arrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

{step === 6 && (
        <>
          <Guide
            steps={[
              'Cek tiap foto satu-satu — approve, edit, skip, atau tandai sebagai unsure.',
              'Gunakan keyboard shortcuts: ← → prev/next, Enter approve, S skip, R unsure.',
              'Setiap foto yang di-approve akan segera diproses dan disimpan ke folder output.',
              'Edit tanggal/jam atau ganti pasangan baris spreadsheet jika diperlukan.',
              'Atur crop per-foto dan overlay lokasi sesuai kebutuhan.',
            ]}
          />

          {batchError && <ErrorBanner message={batchError} />}

          {/* Review Station */}
          {photos.length > 0 && extracted?.rows && autoPairs && (
            <ReviewStation
              photos={photos}
              rows={extracted.rows}
              pairIndexes={finalPairs}
              formatId={formatId}
              defaultCrop={template}
              position={position}
              locationPosition={locationPosition}
              locations={expandedLocations}
              locationEnabled={expandedLocations.length > 0}
              onEditCell={handleEditCell}
              onAssignRow={handleAssignRow}
              onPickOutputFolder={handlePickOutputFolder}
              outputFolder={outputFolder}
              onProcessed={handleProcessed}
              onSkip={handleReviewSkip}
              onUnsure={handleReviewUnsure}
              onComplete={handleReviewComplete}
            />
          )}
          
          {!photos.length || !extracted?.rows || !autoPairs && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
              <Icons.database className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                Belum siap untuk review
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                Pastikan Anda telah memuat spreadsheet, memilih folder foto, dan mengatur kolom tanggal/jam.
              </p>
            </div>
          )}
        </>
      )}

{step === 7 && (
        <>
          <Guide
            steps={[
              'Lihat ringkasan: total, sukses, dan gagal beserta alasannya.',
              'File hasil ada di subfolder "Processed …" yang tadi dibuat.',
              'Klik "Mulai batch baru" untuk mengosongkan semua dan mulai lagi.',
            ]}
          />
          {output ? (
            <>
              <ResultPanel output={output} />
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(6)}>
                  <Icons.arrowLeft className="h-4 w-4" />
                  Kembali ke review
                </Button>
                <Button onClick={reset}>
                  <Icons.refresh className="h-4 w-4" />
                  Mulai batch baru
                </Button>
              </div>
            </>
          ) : (
            <Tilt3D maxTilt={3} glare={false}>
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
                <Icons.file className="anim-float mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Belum ada hasil batch
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                  Jalankan proses dulu di langkah 7. Setelah selesai, ringkasan hasil akan
                  tampil di sini.
                </p>
                <Button variant="secondary" className="mt-4" onClick={() => setStep(6)}>
                  <Icons.refresh className="h-4 w-4" />
                  Ke langkah Review
                </Button>
              </div>
            </Tilt3D>
          )}
        </>
      )}


            </div>
          </div>
        </main>

        <footer className="mx-auto w-full max-w-5xl px-4 pb-8 text-center text-xs text-slate-400 sm:px-6">
          Semua pemrosesan berjalan lokal di browser Anda — foto asli tidak pernah diubah.
        </footer>
      </div>
    </div>
  );
}
