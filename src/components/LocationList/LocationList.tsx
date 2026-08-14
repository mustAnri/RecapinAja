import { useState } from 'react';
import type { Location } from '../../types/location';
import { Badge, Button, Card, Icons } from '../ui';

/**
 * Props for the LocationList component
 */
interface LocationListProps {
  /** Array of saved locations to display */
  locations: Location[];
  /** IDs of currently selected locations */
  selectedIds: Set<string | number>;
  /** Maximum number of locations that can be selected (0 = no limit) */
  maxSelection?: number;
  /** Callback when a location is toggled (select/deselect) */
  onToggle: (locationId: string | number, isSelected: boolean) => void;
  /** Callback when a location is deleted */
  onDelete?: (locationId: string | number) => void;
  /** Whether the list is disabled */
  disabled?: boolean;
  /** Optional title for the card */
  title?: string;
  /** Optional subtitle for the card */
  subtitle?: string;
}

/**
 * Individual location item component
 */
function formatRadius(radiusMeters: number): string {
  if (radiusMeters >= 1000) {
    return `${(radiusMeters / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} km`;
  }

  return `${radiusMeters.toLocaleString('id-ID', { maximumFractionDigits: 0 })} m`;
}

function LocationItem({
  location,
  isSelected,
  maxSelection,
  hasReachedMax,
  onToggle,
  onDelete,
  disabled,
}: {
  location: Location;
  isSelected: boolean;
  maxSelection: number | undefined;
  hasReachedMax: boolean;
  onToggle: (locationId: string | number, isSelected: boolean) => void;
  onDelete?: (locationId: string | number) => void;
  disabled?: boolean;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleToggle = () => {
    if (disabled) return;
    if (isSelected) {
      onToggle(location.id, false);
    } else if (!hasReachedMax || !maxSelection) {
      onToggle(location.id, true);
    }
  };

  const handleDeleteClick = () => {
    if (disabled) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    onDelete?.(location.id);
    setShowDeleteConfirm(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border-2 transition-all duration-200 ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50/50 shadow-md shadow-indigo-500/10'
          : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
        !isSelected && !disabled ? 'hover:-translate-y-0.5' : ''
      }`}
      onClick={!disabled ? handleToggle : undefined}
      role="button"
      aria-pressed={isSelected}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleToggle();
        }
      }}
    >
      {/* Selection indicator badge */}
      {isSelected && (
        <div className="absolute right-3 top-3 z-10">
          <Badge tone="indigo">
            <Icons.check className="h-3 w-3" />
            Selected
          </Badge>
        </div>
      )}

      <div className="p-4">
        {/* Area name */}
        <div className="mb-2 flex items-start justify-between">
          <h4 className="text-base font-semibold text-slate-900 line-clamp-1">
            {location.areaName}
          </h4>
        </div>

        {/* Full address */}
        <div className="mb-3 space-y-1">
          <p className="flex items-start gap-2 text-sm text-slate-600">
            <Icons.file className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="line-clamp-2">{location.address.fullAddress}</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {location.address.kecamatan && (
              <Badge tone="slate">{location.address.kecamatan}</Badge>
            )}
            {location.address.kabupaten && (
              <Badge tone="slate">{location.address.kabupaten}</Badge>
            )}
            {location.address.provinsi && (
              <Badge tone="slate">{location.address.provinsi}</Badge>
            )}
            {location.radiusMeters !== undefined &&
              Number.isFinite(location.radiusMeters) &&
              location.radiusMeters > 0 && (
                <Badge tone="indigo">Zona radius: {formatRadius(location.radiusMeters)}</Badge>
              )}
          </div>
        </div>

        {/* Coordinates */}
        <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-mono font-medium text-slate-700">
            Lat: {location.coordinates.lat.toFixed(6)}°, Lng: {location.coordinates.lng.toFixed(6)}°
          </p>
        </div>

        {/* Delete button (only shown when not disabled) */}
        {onDelete && !disabled && (
          <div className="flex justify-end">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={handleDeleteCancel}
                  className="h-8 px-3 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDeleteConfirm}
                  className="h-8 px-3 text-xs"
                >
                  <Icons.x className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                onClick={handleDeleteClick}
                className="h-8 px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                aria-label={`Delete ${location.areaName}`}
              >
                <Icons.alert className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * LocationList Component
 * 
 * Displays a scrollable list of saved locations with selection functionality,
 * delete capability, and responsive card-style layout.
 * 
 * @param props - Component props
 * @returns JSX element
 */
export function LocationList({
  locations = [],
  selectedIds,
  maxSelection = 0,
  onToggle,
  onDelete,
  disabled = false,
  title = 'Saved Locations',
  subtitle,
}: LocationListProps) {
  const selectionCount = selectedIds.size;
  const hasReachedMax = maxSelection > 0 && selectionCount >= maxSelection;

  // Calculate remaining selection capacity
  const remainingCapacity = maxSelection > 0 && maxSelection > selectionCount
    ? maxSelection - selectionCount
    : null;

  return (
    <Card
      title={title}
      subtitle={subtitle ?? `${selectionCount} of ${locations.length} locations selected`}
      actions={
        maxSelection > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">
              {remainingCapacity !== null ? (
                <>
                  <span className={`${remainingCapacity === 1 ? 'text-amber-600' : 'text-slate-600'}`}>
                    {remainingCapacity}
                  </span>
                  <span className="text-xs text-slate-400">more available</span>
                </>
              ) : (
                <span className="text-emerald-600">Unlimited</span>
              )}
            </span>
            {(maxSelection <= 1) && (
              <Badge tone={maxSelection === 1 ? 'indigo' : 'slate'}>
                {maxSelection === 1 ? 'Single select' : 'Multi select'}
              </Badge>
            )}
          </div>
        )
      }
      padded={false}
    >
      {/* Empty state */}
      {locations.length === 0 ? (
        <div
          className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="mb-4 rounded-full bg-slate-100 p-4">
            <Icons.database className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">No locations available</h3>
          <p className="max-w-xs text-sm text-slate-500">
            Saved locations will appear here. Start by adding new locations to your collection.
          </p>
        </div>
      ) : (
        /* Scrollable container */
        <div
          className="max-h-[600px] overflow-y-auto p-4 sm:p-6"
          role="listbox"
          aria-label="Saved locations list"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((location) => (
              <LocationItem
                key={location.id}
                location={location}
                isSelected={selectedIds.has(location.id)}
                maxSelection={maxSelection}
                hasReachedMax={hasReachedMax}
                onToggle={onToggle}
                onDelete={onDelete}
                disabled={disabled}
              />
            ))}
          </div>

          {/* Capacity warning at bottom */}
          {hasReachedMax && maxSelection !== null && (
            <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-center text-sm text-amber-800">
              <div className="flex items-center justify-center gap-2">
                <Icons.alert className="h-4 w-4" />
                <span className="font-medium">
                  Maximum selection reached ({maxSelection} {maxSelection === 1 ? 'location' : 'locations'})
                </span>
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Deselect some locations to select others
              </p>
            </div>
          )}
        </div>
      )}

      {/* Status footer */}
      {!disabled && locations.length > 0 && (
        <footer className="border-t border-slate-100 px-6 py-4">
          <p className="text-xs text-slate-500">
            {hasReachedMax ? (
              <span className="flex items-center gap-1.5">
                <Icons.lock className="h-3.5 w-3.5" />
                <span className="font-medium text-amber-600">
                  Max selections ({maxSelection}) reached
                </span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Icons.sparkles className="h-3.5 w-3.5 text-indigo-500" />
                <span className="text-slate-600">
                  Click cards to toggle selection
                </span>
              </span>
            )}
          </p>
        </footer>
      )}
    </Card>
  );
}
