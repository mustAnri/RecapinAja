import { useEffect, useMemo, useRef, useState } from 'react';
import type { TimestampPosition } from '../../types/processing';

/** Where each anchor places the overlay box, as fractions of the photo. */
const ANCHORS: Record<TimestampPosition, { x: number; y: number }> = {
  'top-left': { x: 0.04, y: 0.06 },
  'top-center': { x: 0.5, y: 0.06 },
  'top-right': { x: 0.96, y: 0.06 },
  'bottom-left': { x: 0.04, y: 0.94 },
  'bottom-center': { x: 0.5, y: 0.94 },
  'bottom-right': { x: 0.96, y: 0.94 },
};

interface CropBoxProps {
  url: string;
  width: number;
  height: number;
  crop?: { x: number; y: number; side: number } | null;
  position?: TimestampPosition;
  locationPosition?: TimestampPosition;
  onCropChange?: (crop: { x: number; y: number; side: number } | null) => void;
  disabled?: boolean;
  maxHeight?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function CropBox({
  url,
  width,
  height,
  crop = null,
  position = 'bottom-right',
  locationPosition,
  onCropChange,
  disabled = false,
  maxHeight = 480,
}: CropBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragRef, setDragRef] = useState<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origin: { x: number; y: number; side: number };
  } | null>(null);
  const [dragCrop, setDragCrop] = useState<{ x: number; y: number; side: number } | null>(null);

  // Track container size for responsive fitting
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => setContainerWidth(element.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Derived during render: fit dimensions and the effective crop rect.
  const fitted = useMemo(() => {
    if (!containerWidth || !width || !height) return null;
    const ratio = Math.min(containerWidth / width, maxHeight / height, 1);
    return {
      width: Math.max(1, Math.floor(width * ratio)),
      height: Math.max(1, Math.floor(height * ratio)),
      scale: ratio,
    };
  }, [containerWidth, width, height, maxHeight]);

  // While dragging, dragCrop wins; otherwise the controlled prop is shown.
  const currentCrop = dragRef ? dragCrop : crop;

  const beginDrag = (event: React.PointerEvent, mode: 'move' | 'resize') => {
    if (!currentCrop || disabled) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDragCrop(currentCrop);
    setDragRef({
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: currentCrop,
    });
  };

  const onDragMove = (event: React.PointerEvent) => {
    const drag = dragRef;
    if (!drag || !fitted || !currentCrop) return;

    const dx = (event.clientX - drag.startX) / fitted.scale;
    const dy = (event.clientY - drag.startY) / fitted.scale;
    const maxSide = Math.max(32, Math.min(width, height));

    if (drag.mode === 'move') {
      const newX = clamp(drag.origin.x + dx, 0, width - drag.origin.side);
      const newY = clamp(drag.origin.y + dy, 0, height - drag.origin.side);

      const newCrop = { ...drag.origin, x: Math.round(newX), y: Math.round(newY) };
      setDragCrop(newCrop);
      onCropChange?.(newCrop);
    } else {
      const side = Math.round(
        clamp(
          drag.origin.side + Math.max(dx, dy),
          32,
          Math.min(maxSide, width - drag.origin.x, height - drag.origin.y)
        )
      );

      const newCrop = { ...drag.origin, side };
      setDragCrop(newCrop);
      onCropChange?.(newCrop);
    }
  };

  const endDrag = () => {
    setDragRef(null);
  };

  // Position marker based on crop and anchor
  const getMarkerPosition = (anchorPosition: TimestampPosition, cropRect: { x: number; y: number; side: number }) => {
    const anchor = ANCHORS[anchorPosition];
    const left = cropRect.x + anchor.x * cropRect.side;
    const top = cropRect.y + anchor.y * cropRect.side;
    return { left, top };
  };

  const marker = currentCrop ? getMarkerPosition(position, currentCrop) : null;
  const locationMarker = locationPosition && currentCrop ? getMarkerPosition(locationPosition, currentCrop) : null;

  return (
    <div ref={containerRef} className="relative select-none overflow-hidden rounded-lg bg-slate-900">
      {fitted ? (
        <div
          className="relative"
          style={{ width: fitted.width, height: fitted.height }}
        >
          <img
            src={url}
            alt="Preview"
            draggable={false}
            className="block"
            style={{ width: fitted.width, height: fitted.height }}
          />
          {currentCrop && (
            <div
              role="button"
              aria-label="Crop area — drag to move"
              onPointerDown={(event) => beginDrag(event, 'move')}
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
              className="absolute cursor-move touch-none border-2 border-white/90"
              style={{
                left: currentCrop.x * fitted.scale,
                top: currentCrop.y * fitted.scale,
                width: currentCrop.side * fitted.scale,
                height: currentCrop.side * fitted.scale,
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)',
              }}
            >
              <div
                aria-label="Resize handle"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  beginDrag(event, 'resize');
                }}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize touch-none rounded-sm border-2 border-white bg-indigo-600"
              />
            </div>
          )}
          {marker && (
            <div
              aria-label="Timestamp position"
              className="pointer-events-none absolute whitespace-nowrap rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/40"
              style={{
                left: marker.left * fitted.scale,
                top: marker.top * fitted.scale,
                transform: `translate(${-ANCHORS[position].x * 100}%, ${-ANCHORS[position].y * 100}%)`,
              }}
            >
              timestamp
            </div>
          )}
          {locationMarker && locationPosition && (
            <div
              aria-label="Location position"
              className="pointer-events-none absolute whitespace-nowrap rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/40"
              style={{
                left: locationMarker.left * fitted.scale,
                top: locationMarker.top * fitted.scale,
                transform: `translate(${-ANCHORS[locationPosition].x * 100}%, ${-ANCHORS[locationPosition].y * 100}%)`,
              }}
            >
              lokasi
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
          Memuat preview…
        </div>
      )}
    </div>
  );
}