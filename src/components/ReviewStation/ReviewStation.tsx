import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpreadsheetRow } from '../../types/spreadsheet';
import type {
  BatchResult,
  CropTemplate,
  TimestampPosition,
} from '../../types/processing';
import type { Location } from '../../types/location';
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Icons,
  inputClasses,
} from '../ui';
import { CropBox } from '../CropBox/CropBox';
import { formatTimestamp, parseDateCell, parseTimeCell } from '../../utils/dateFormatter';
import { processSingleEntry } from '../../services/batchProcessor';
import type { OutputFolder } from '../../services/filesystem';
import { prepareAddressLines } from '../../services/imageProcessor/locationOverlay';

export type ItemStatus = 'pending' | 'approved' | 'skipped' | 'unsure' | 'failed';

export interface ReviewCompletion {
  approved: number;
  skipped: number;
  unsure: number;
  failed: number;
}

interface ReviewStationProps {
  photos: File[];
  rows: SpreadsheetRow[];
  /** Final pairing: photo filename → row index. */
  pairIndexes: Map<string, number>;
  formatId: string;
  defaultCrop: CropTemplate | null;
  position: TimestampPosition;
  locationPosition: TimestampPosition;
  locations: Location[];
  locationEnabled: boolean;
  onEditCell: (sheetRowNumber: number, field: 'date' | 'time', value: string) => void;
  onAssignRow: (filename: string, rowIndex: number | null) => void;
  onPickOutputFolder: () => Promise<OutputFolder | null>;
  outputFolder: OutputFolder | null;
  onProcessed: (filename: string, result: BatchResult) => void;
  onSkip: (filename: string) => void;
  onUnsure: (filename: string) => void;
  onComplete?: (summary: ReviewCompletion) => void;
}

interface LoadedPhoto {
  url: string;
  width: number;
  height: number;
}

/** Load an image File into a preview URL with its natural dimensions. */
function loadPhoto(file: File): Promise<LoadedPhoto> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => resolve({ url, width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Foto ${file.name} tidak bisa dimuat.`));
    };
    probe.src = url;
  });
}

/**
 * Review Station — labeling-tool style per-photo review. The user checks
 * every photo one by one: approve (process immediately), skip, or mark as
 * unsure. Keyboard: ← → prev/next, Enter approve, S skip, R unsure.
 */
export function ReviewStation({
  photos,
  rows,
  pairIndexes,
  formatId,
  defaultCrop,
  position,
  locationPosition,
  locations,
  locationEnabled,
  onEditCell,
  onAssignRow,
  onPickOutputFolder,
  outputFolder,
  onProcessed,
  onSkip,
  onUnsure,
  onComplete,
}: ReviewStationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState<Map<string, ItemStatus>>(new Map());
  const [cropOverrides, setCropOverrides] = useState<Map<string, CropTemplate | null>>(new Map());
  const [addressOverrides, setAddressOverrides] = useState<
    Map<string, Partial<Location['address']>>
  >(new Map());
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderRef = useRef<OutputFolder | null>(outputFolder);

  const currentFile = photos[currentIndex] ?? null;
  const currentRowIndex = currentFile ? (pairIndexes.get(currentFile.name) ?? null) : null;
  const currentRow =
    currentRowIndex !== null && currentRowIndex < rows.length ? rows[currentRowIndex] : null;

  /** Per-photo location from the expanded pool (index = photo order). */
  const effectiveLocation = useMemo(
    () => (locationEnabled ? (locations[currentIndex] ?? undefined) : undefined),
    [locationEnabled, locations, currentIndex],
  );

  const effectiveAddress = useMemo(() => {
    const override = currentFile ? addressOverrides.get(currentFile.name) : undefined;
    return { ...(effectiveLocation?.address ?? {}), ...override };
  }, [currentFile, addressOverrides, effectiveLocation]);

  const effectiveCrop = useMemo(() => {
    if (!currentFile) return null;
    if (cropOverrides.has(currentFile.name)) return cropOverrides.get(currentFile.name) ?? null;
    return defaultCrop;
  }, [currentFile, cropOverrides, defaultCrop]);

  /* Load the current preview photo. */
  useEffect(() => {
    if (!currentFile) return;
    let cancelled = false;
    loadPhoto(currentFile)
      .then((loaded) => {
        if (cancelled) {
          URL.revokeObjectURL(loaded.url);
          return;
        }
        setPhoto(loaded);
        setPhotoError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPhotoError(err instanceof Error ? err.message : 'Preview gagal dimuat.');
      });
    return () => {
      cancelled = true;
    };
  }, [currentFile]);

  /* Revoke the object URL when the photo changes or the component unmounts. */
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  const advance = useCallback(() => {
    setCurrentIndex((index) => Math.min(index + 1, photos.length - 1));
    setError(null);
  }, [photos.length]);

  const approve = useCallback(async () => {
    if (processing || !currentFile) return;
    if (!currentRow) {
      setError('Foto ini tidak punya baris jam. Pilih baris data atau skip.');
      return;
    }
    if (!parseDateCell(currentRow.date) || !parseTimeCell(currentRow.time)) {
      setError('Tanggal/jam belum valid — perbaiki sebelum approve.');
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      let folder = folderRef.current ?? outputFolder;
      if (!folder) {
        folder = await onPickOutputFolder();
        if (!folder) {
          setError('Pemilihan folder output dibatalkan.');
          return;
        }
        folderRef.current = folder;
      }

      const crop = cropOverrides.has(currentFile.name)
        ? (cropOverrides.get(currentFile.name) ?? null)
        : defaultCrop;

      const override = addressOverrides.get(currentFile.name);
      const location = effectiveLocation
        ? { ...effectiveLocation, address: { ...effectiveLocation.address, ...override } }
        : undefined;

      const result = await processSingleEntry(
        { file: currentFile, filename: currentFile.name, row: currentRow },
        {
          crop,
          formatId,
          position,
          outputFolder: folder,
          location,
          locationPosition,
          locationEnabled: location !== undefined,
        },
      );

      setStatuses((prev) =>
        new Map(prev).set(currentFile.name, result.status === 'success' ? 'approved' : 'failed'),
      );
      onProcessed(currentFile.name, result);
      if (result.status !== 'success') {
        setError(result.error ?? 'Pemrosesan gagal.');
      } else {
        advance();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pemrosesan gagal.');
    } finally {
      setProcessing(false);
    }
  }, [
    processing, currentFile, currentRow, outputFolder, onPickOutputFolder,
    cropOverrides, defaultCrop, addressOverrides, effectiveLocation,
    formatId, position, locationPosition, onProcessed, advance,
  ]);

  const skip = useCallback(() => {
    if (!currentFile) return;
    setStatuses((prev) => new Map(prev).set(currentFile.name, 'skipped'));
    onSkip(currentFile.name);
    advance();
  }, [currentFile, onSkip, advance]);

  const unsure = useCallback(() => {
    if (!currentFile) return;
    setStatuses((prev) => new Map(prev).set(currentFile.name, 'unsure'));
    onUnsure(currentFile.name);
    advance();
  }, [currentFile, onUnsure, advance]);

  /* Keyboard navigation — ignored while typing in inputs. */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (processing) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setCurrentIndex((index) => Math.min(index + 1, photos.length - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentIndex((index) => Math.max(index - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          void approve();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          skip();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          unsure();
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [approve, skip, unsure, processing, photos.length]);

  /* Report completion once every photo has been reviewed. */
  const reviewedCount = useMemo(
    () => Array.from(statuses.values()).filter((s) => s !== 'pending').length,
    [statuses],
  );
  useEffect(() => {
    if (photos.length === 0 || reviewedCount < photos.length) return;
    const counts = { approved: 0, skipped: 0, unsure: 0, failed: 0 };
    for (const status of statuses.values()) {
      if (status === 'approved') counts.approved += 1;
      else if (status === 'skipped') counts.skipped += 1;
      else if (status === 'unsure') counts.unsure += 1;
      else if (status === 'failed') counts.failed += 1;
    }
    onComplete?.(counts);
  }, [reviewedCount, photos.length, statuses, onComplete]);

  const handleCropChange = useCallback(
    (crop: { x: number; y: number; side: number } | null) => {
      if (!currentFile || !photo) return;
      if (!crop) {
        setCropOverrides((prev) => {
          const next = new Map(prev);
          next.delete(currentFile.name);
          return next;
        });
        return;
      }
      setCropOverrides((prev) =>
        new Map(prev).set(currentFile.name, {
          xFraction: crop.x / photo.width,
          yFraction: crop.y / photo.height,
          sizeFraction: crop.side / Math.min(photo.width, photo.height),
          sourceWidth: photo.width,
          sourceHeight: photo.height,
        }),
      );
    },
    [currentFile, photo],
  );

  const handleAddressChange = useCallback(
    (field: 'street' | 'kecamatan' | 'kabupaten' | 'provinsi', value: string) => {
      if (!currentFile) return;
      setAddressOverrides((prev) => {
        const existing = prev.get(currentFile.name) ?? {};
        return new Map(prev).set(currentFile.name, { ...existing, [field]: value });
      });
    },
    [currentFile],
  );

  const getStatusBadge = (status: ItemStatus) => {
    switch (status) {
      case 'approved':
        return <Badge tone="emerald">Approved</Badge>;
      case 'skipped':
        return <Badge tone="amber">Skipped</Badge>;
      case 'unsure':
        return <Badge tone="indigo">Unsure</Badge>;
      case 'failed':
        return <Badge tone="red">Failed</Badge>;
      default:
        return <Badge tone="slate">Pending</Badge>;
    }
  };

  const dateValid = currentRow ? parseDateCell(currentRow.date) !== null : false;
  const timeValid = currentRow ? parseTimeCell(currentRow.time) !== null : false;
  const approveDisabled =
    processing || !currentRow || !dateValid || !timeValid;

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
        <Icons.image className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-3 text-sm font-semibold text-slate-700">Belum ada foto untuk direview</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
          Pilih folder foto dulu di langkah sebelumnya.
        </p>
      </div>
    );
  }

  return (
    <Card
      title="Review Foto"
      subtitle="Cek tiap foto satu-satu — approve untuk proses, edit, skip, atau tandai unsure. Keyboard: ← → nav, Enter approve, S skip, R unsure."
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="slate">
            {currentIndex + 1} / {photos.length}
          </Badge>
          {currentFile && getStatusBadge(statuses.get(currentFile.name) ?? 'pending')}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Thumbnail strip */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Antrean Foto ({reviewedCount}/{photos.length} direview)
          </p>
          <div className="flex gap-2 overflow-x-auto py-2">
            {photos.map((file, index) => {
              const status = statuses.get(file.name) ?? 'pending';
              return (
                <button
                  key={file.name}
                  type="button"
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`Buka foto ${file.name}`}
                  className={`flex h-9 shrink-0 items-center justify-center rounded-lg border px-2 text-[11px] font-semibold transition-colors ${
                    index === currentIndex
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : status === 'pending'
                        ? 'border-slate-200 text-slate-500 hover:border-slate-300'
                        : status === 'approved'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : status === 'skipped'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : status === 'unsure'
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                              : 'border-red-200 bg-red-50 text-red-700'
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Preview */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Preview Foto
              </p>
              <div className="flex items-center justify-center">
                {photoError ? (
                  <ErrorBanner message={photoError} />
                ) : photo ? (
                  <div className="w-full max-w-2xl">
                    <CropBox
                      url={photo.url}
                      width={photo.width}
                      height={photo.height}
                      crop={
                        effectiveCrop
                          ? {
                              x: Math.round(effectiveCrop.xFraction * photo.width),
                              y: Math.round(effectiveCrop.yFraction * photo.height),
                              side: Math.round(
                                effectiveCrop.sizeFraction * Math.min(photo.width, photo.height),
                              ),
                            }
                          : null
                      }
                      position={position}
                      locationPosition={locationPosition}
                      onCropChange={handleCropChange}
                      disabled={processing}
                    />
                  </div>
                ) : (
                  <p className="py-12 text-xs text-slate-400">Memuat preview…</p>
                )}
              </div>
              {photo && currentFile && (
                <p className="mt-2 text-center text-[11px] text-slate-400">
                  {currentFile.name} — {photo.width} × {photo.height} px
                </p>
              )}
            </div>

            {error && <ErrorBanner message={error} />}
          </div>

          {/* Data panel */}
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data Terpasang
              </p>
              {currentRow ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tanggal" hint="DD/MM/YYYY, DD-MM-YYYY, atau DD.MM.YYYY">
                    <input
                      type="text"
                      className={inputClasses}
                      value={currentRow.date}
                      disabled={processing}
                      onChange={(e) => onEditCell(currentRow.sheetRowNumber, 'date', e.target.value)}
                    />
                  </Field>
                  <Field label="Jam" hint="HH:mm — titik juga diterima, contoh 21.22">
                    <input
                      type="text"
                      className={inputClasses}
                      value={currentRow.time}
                      disabled={processing}
                      onChange={(e) => onEditCell(currentRow.sheetRowNumber, 'time', e.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                  Tidak ada baris jam untuk foto ini — foto akan disalin apa adanya.
                </p>
              )}
              {currentRow && !dateValid && (
                <div className="mt-2">
                  <ErrorBanner message={`Tanggal tidak valid: ${currentRow.date}`} />
                </div>
              )}
              {currentRow && !timeValid && (
                <div className="mt-2">
                  <ErrorBanner message={`Jam tidak valid: ${currentRow.time}`} />
                </div>
              )}
              {currentRow && (
                <p className="mt-2 text-sm font-medium text-slate-700">
                  Preview: {formatTimestamp(currentRow.date, currentRow.time, formatId)}
                </p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Baris Data
              </p>
              <select
                value={currentRowIndex ?? -1}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  onAssignRow(currentFile!.name, value === -1 ? null : value);
                }}
                className={inputClasses}
                disabled={processing}
              >
                <option value={-1}>Tanpa jam — salin apa adanya</option>
                {rows.map((row, index) => (
                  <option key={index} value={index}>
                    Baris {row.sheetRowNumber}: {row.date} {row.time}
                  </option>
                ))}
              </select>
            </div>

            {/* Crop toggle per photo */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Crop 1:1 foto ini</p>
                  <p className="text-[11px] text-slate-500">
                    Override per-foto — default: {defaultCrop ? 'aktif' : 'tanpa crop'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={effectiveCrop !== null}
                  aria-label="Aktifkan crop 1:1 untuk foto ini"
                  disabled={processing}
                  onClick={() => {
                    if (!currentFile) return;
                    if (effectiveCrop) {
                      setCropOverrides((prev) =>
                        new Map(prev).set(currentFile.name, null),
                      );
                    } else if (defaultCrop) {
                      setCropOverrides((prev) => {
                        const next = new Map(prev);
                        next.delete(currentFile.name);
                        return next;
                      });
                    } else {
                      // No global template: start from a centered square once loaded.
                      setCropOverrides((prev) =>
                        new Map(prev).set(currentFile.name, {
                          xFraction: 0.5,
                          yFraction: 0.5,
                          sizeFraction: 1,
                          sourceWidth: photo?.width ?? 0,
                          sourceHeight: photo?.height ?? 0,
                        }),
                      );
                    }
                  }}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                    effectiveCrop ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      effectiveCrop ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Seret kotak pada preview untuk mengatur crop khusus foto ini.
              </p>
            </div>

            {/* Location overlay per photo */}
            {locationEnabled && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Lokasi Overlay
                </p>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Jalan" hint="Alamat jalan">
                      <input
                        type="text"
                        className={inputClasses}
                        value={effectiveAddress.street ?? ''}
                        disabled={processing}
                        onChange={(e) => handleAddressChange('street', e.target.value)}
                      />
                    </Field>
                    <Field label="Kecamatan" hint="Kecamatan">
                      <input
                        type="text"
                        className={inputClasses}
                        value={effectiveAddress.kecamatan ?? ''}
                        disabled={processing}
                        onChange={(e) => handleAddressChange('kecamatan', e.target.value)}
                      />
                    </Field>
                    <Field label="Kabupaten" hint="Kabupaten/Kota">
                      <input
                        type="text"
                        className={inputClasses}
                        value={effectiveAddress.kabupaten ?? ''}
                        disabled={processing}
                        onChange={(e) => handleAddressChange('kabupaten', e.target.value)}
                      />
                    </Field>
                    <Field label="Provinsi" hint="Provinsi">
                      <input
                        type="text"
                        className={inputClasses}
                        value={effectiveAddress.provinsi ?? ''}
                        disabled={processing}
                        onChange={(e) => handleAddressChange('provinsi', e.target.value)}
                      />
                    </Field>
                  </div>

                  {effectiveLocation && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-slate-700">Preview lokasi:</p>
                      {prepareAddressLines(
                        effectiveLocation.address,
                        4,
                      ).map((line, i) => (
                        <Badge key={i} tone="indigo">
                          {line}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={() => void approve()} disabled={approveDisabled}>
                {processing ? (
                  <>
                    <Icons.refresh className="h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Icons.check className="h-4 w-4" />
                    Approve &amp; Proses
                  </>
                )}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
                  disabled={currentIndex === 0 || processing}
                >
                  <Icons.arrowLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={advance}
                  disabled={currentIndex >= photos.length - 1 || processing}
                >
                  Next
                  <Icons.arrowRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={skip} disabled={processing}>
                  <Icons.x className="h-4 w-4" />
                  Skip (S)
                </Button>
                <Button variant="secondary" className="flex-1" onClick={unsure} disabled={processing}>
                  <Icons.alert className="h-4 w-4" />
                  Unsure (R)
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Keyboard Shortcuts
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-slate-200 px-2 py-1 text-slate-700">←</kbd>
                  <span>Prev</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-slate-200 px-2 py-1 text-slate-700">→</kbd>
                  <span>Next</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-slate-200 px-2 py-1 text-slate-700">Enter</kbd>
                  <span>Approve</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-slate-200 px-2 py-1 text-slate-700">S</kbd>
                  <span>Skip</span>
                </div>
                <div className="flex items-center gap-2">
                  <kbd className="rounded bg-slate-200 px-2 py-1 text-slate-700">R</kbd>
                  <span>Unsure</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
