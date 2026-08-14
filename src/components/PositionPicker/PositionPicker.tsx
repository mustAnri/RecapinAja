/**
 * PositionPicker
 *
 * Reusable 6-corner position picker (same visual language as the timestamp
 * position control in CropEditor). Used wherever an overlay position must be
 * chosen — timestamp and location overlays.
 */

import type { TimestampPosition } from '../../types/processing';

const POSITION_CHOICES: Array<{ id: TimestampPosition; label: string; short: string }> = [
  { id: 'top-left', label: 'Kiri atas', short: '↖' },
  { id: 'top-center', label: 'Tengah atas', short: '↑' },
  { id: 'top-right', label: 'Kanan atas', short: '↗' },
  { id: 'bottom-left', label: 'Kiri bawah', short: '↙' },
  { id: 'bottom-center', label: 'Tengah bawah', short: '↓' },
  { id: 'bottom-right', label: 'Kanan bawah', short: '↘' },
];

export interface PositionPickerProps {
  value: TimestampPosition;
  onChange: (position: TimestampPosition) => void;
  /** Header label shown above the picker. */
  label: string;
  /** Optional helper text shown below the picker. */
  hint?: string;
  disabled?: boolean;
}

export function PositionPicker({
  value,
  onChange,
  label,
  hint,
  disabled = false,
}: PositionPickerProps) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div role="radiogroup" aria-label={label} className="grid w-fit grid-cols-3 gap-1">
        {POSITION_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={value === choice.id}
            title={choice.label}
            disabled={disabled}
            onClick={() => onChange(choice.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-all duration-200 ${
              value === choice.id
                ? 'scale-105 border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'border-slate-300 bg-white text-slate-400 hover:border-indigo-300 hover:text-indigo-500'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {choice.short}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
