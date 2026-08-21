import { useEffect, useMemo, useState } from 'react';
import type { CropTemplate, TimestampPosition } from '../../types/processing';
import { Badge, Button, Card, ErrorBanner, Field, Icons, InfoBanner, inputClasses } from '../ui';
import { CropBox } from '../CropBox/CropBox';

interface CropEditorProps {
  /** Sorted photos — the user picks one as the preview (§17). */
  photos: File[];
  /** Previously confirmed crop template, or null when crop is skipped. */
  template: CropTemplate | null;
  /** Confirm receives the crop template, or null when crop is turned off. */
  onConfirm: (template: CropTemplate | null) => void;
  /** Where the timestamp text is anchored on the final photo. */
  position: TimestampPosition;
  onPositionChange: (position: TimestampPosition) => void;
  disabled?: boolean;
}

interface LoadedPhoto {
  url: string;
  width: number;
  height: number;
}

interface CropRect {
  x: number;
  y: number;
  side: number;
}

function centerCrop(photo: LoadedPhoto): CropRect {
  const side = Math.max(MIN_SIDE_PX, Math.min(photo.width, photo.height));
  return { x: Math.round((photo.width - side) / 2), y: Math.round((photo.height - side) / 2), side };
}

/** The selectable anchors for the timestamp overlay. */
const POSITION_CHOICES: Array<{ id: TimestampPosition; label: string; short: string }> = [
  { id: 'top-left', label: 'Kiri atas', short: '↖' },
  { id: 'top-center', label: 'Tengah atas', short: '↑' },
  { id: 'top-right', label: 'Kanan atas', short: '↗' },
  { id: 'bottom-left', label: 'Kiri bawah', short: '↙' },
  { id: 'bottom-center', label: 'Tengah bawah', short: '↓' },
  { id: 'bottom-right', label: 'Kanan bawah', short: '↘' },
];

const MIN_SIDE_PX = 32;

/** Nearest common aspect ratio label for display (e.g. 9:16, 16:9, 1:1). */
function aspectLabel(width: number, height: number): string {
  const value = width / height;
  const ratios: Array<[string, number]> = [
    ['1:1', 1],
    ['4:5', 4 / 5],
    ['5:4', 5 / 4],
    ['3:4', 3 / 4],
    ['4:3', 4 / 3],
    ['2:3', 2 / 3],
    ['3:2', 3 / 2],
    ['9:16', 9 / 16],
    ['16:9', 16 / 9],
    ['21:9', 21 / 9],
  ];
  for (const [label, ratio] of ratios) {
    if (Math.abs(value - ratio) < 0.02) return label;
  }
  return `${value.toFixed(2)}:1`;
}

/**
 * "Atur Timestamp" step: pick where the timestamp lands on every photo and,
 * optionally, draw the manual 1:1 crop (§18). The confirmed rectangle is
 * saved as the crop template (§19) and applied proportionally to every
 * photo during the batch (§20); when crop is off the photos keep their
 * original framing.
 */
export function CropEditor({
  photos,
  template,
  onConfirm,
  position,
  onPositionChange,
  disabled = false,
}: CropEditorProps) {
  const [selectedName, setSelectedName] = useState<string>(photos[0]?.name ?? '');
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [cropEnabled, setCropEnabled] = useState(template !== null);

  /** Falls back to the first photo when the saved name is stale (new folder). */
  const validName = photos.some((file) => file.name === selectedName)
    ? selectedName
    : (photos[0]?.name ?? '');
  const selectedPhoto = useMemo(
    () => photos.find((file) => file.name === validName) ?? null,
    [photos, validName],
  );

  // Load the selected preview photo.
  useEffect(() => {
    if (!selectedPhoto) return; // photos always present when this step renders
    const url = URL.createObjectURL(selectedPhoto);
    const probe = new Image();
    let cancelled = false;
    probe.onload = () => {
      if (cancelled) return;
      const width = probe.naturalWidth;
      const height = probe.naturalHeight;
      const loaded = { url, width, height };
      setLoadError(null);
      setPhoto(loaded);
      if (template && template.sourceWidth === width && template.sourceHeight === height) {
        setCrop({
          x: Math.round(template.xFraction * width),
          y: Math.round(template.yFraction * height),
          side: Math.round(template.sizeFraction * Math.min(width, height)),
        });
      } else {
        setCrop(centerCrop(loaded));
      }
    };
    probe.onerror = () => {
      if (cancelled) return;
      URL.revokeObjectURL(url);
      setLoadError('This photo could not be loaded — try another preview photo.');
      setPhoto(null);
      setCrop(null);
    };
    probe.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [selectedPhoto, template]);

  const confirmCrop = () => {
    if (!photo || !crop) return;
    onConfirm({
      xFraction: crop.x / photo.width,
      yFraction: crop.y / photo.height,
      sizeFraction: crop.side / Math.min(photo.width, photo.height),
      sourceWidth: photo.width,
      sourceHeight: photo.height,
    });
  };

  const toggleCrop = () => {
    if (disabled) return;
    const next = !cropEnabled;
    setCropEnabled(next);
    if (!next) onConfirm(null); // turning crop off clears the saved template
  };

  const handleCropChange = (newCrop: CropRect | null) => {
    setCrop(newCrop);
  };

  return (
    <Card
      title="Atur Timestamp"
      subtitle="Pilih posisi timestamp untuk semua foto — crop 1:1 opsional"
      actions={
        cropEnabled ? (
          template ? (
            <Badge tone="emerald">
              <Icons.check className="h-3.5 w-3.5" />
              Crop tersimpan
            </Badge>
          ) : (
            <Badge tone="amber">Crop aktif — belum dikonfirmasi</Badge>
          )
        ) : (
          <Badge tone="slate">Tanpa crop — foto asli</Badge>
        )
      }
    >
      {photos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
          <Icons.image className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Belum ada foto untuk preview</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Pilih folder foto dulu di langkah sebelumnya — preview membutuhkan minimal satu foto.
          </p>
        </div>
      ) : (
        <Field label="Foto preview" hint="Foto mana saja dari folder — pengaturan dipakai ke semua foto">
          <select
            value={validName}
            disabled={disabled}
            onChange={(event) => setSelectedName(event.target.value)}
            className={inputClasses}
          >
            {photos.map((file) => (
              <option key={file.name} value={file.name}>
                {file.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {loadError && (
        <div className="mt-4">
          <ErrorBanner message={loadError} />
        </div>
      )}

      {photo && crop && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="min-w-0">
            <CropBox
              url={photo.url}
              width={photo.width}
              height={photo.height}
              crop={crop}
              position={position}
              onCropChange={handleCropChange}
              disabled={disabled}
            />
          </div>

          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Posisi timestamp
              </p>
              <div
                role="radiogroup"
                aria-label="Posisi timestamp"
                className="grid w-fit grid-cols-3 gap-1"
              >
                {POSITION_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={position === choice.id}
                    title={choice.label}
                    disabled={disabled}
                    onClick={() => onPositionChange(choice.id)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-all duration-200 ${
                      position === choice.id
                        ? 'scale-105 border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'border-slate-300 bg-white text-slate-400 hover:border-indigo-300 hover:text-indigo-500'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {choice.short}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Kotak “timestamp” pada preview menunjukkan letak teks di hasil akhir.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Crop 1:1</p>
                  <p className="text-[11px] text-slate-500">Opsional — nonaktif = foto asli</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cropEnabled}
                  aria-label="Aktifkan crop 1:1"
                  disabled={disabled}
                  onClick={toggleCrop}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                    cropEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      cropEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {cropEnabled ? (
                <dl className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Aspect ratio</dt>
                    <dd className="font-semibold text-slate-900">1:1</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">X</dt>
                    <dd className="tabular-nums">{Math.round(crop.x)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Y</dt>
                    <dd className="tabular-nums">{Math.round(crop.y)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Width / Height</dt>
                    <dd className="tabular-nums">{Math.round(crop.side)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Photo size</dt>
                    <dd className="tabular-nums">
                      {photo.width} × {photo.height}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Aspect ratio foto</dt>
                    <dd className="tabular-nums">{aspectLabel(photo.width, photo.height)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500">
                  Foto diproses dengan framing aslinya (tanpa crop) dan hanya diberi timestamp.
                </p>
              )}
            </div>

            {cropEnabled ? (
              <Button onClick={confirmCrop} disabled={disabled} className="w-full">
                <Icons.check className="h-4 w-4" />
                Confirm crop
              </Button>
            ) : (
              <InfoBanner message="Tanpa crop — posisi timestamp dihitung dari foto penuh." />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
