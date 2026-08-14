/**
 * LocationInput Component
 * 
 * A reusable React component for location input with two modes:
 * 1. Area Name search (geocoding from address to coordinates)
 * 2. Direct Coordinates input (latitude/longitude)
 * 
 * Features:
 * - Forward geocoding via OpenStreetMap Nominatim API
 * - Address preview display from Nominatim response
 * - Loading states during API calls
 * - Error handling for API failures and invalid inputs
 * - Clear and fetch buttons for refreshing preview
 * - Add button to save selected location
 * 
 * @example
 * ```tsx
 * <LocationInput
 *   onSave={handleLocationSave}
 *   initialMode="area"
 * />
 * ```
 */

import { useState, useCallback, lazy, Suspense, useMemo } from 'react';
import { Card, Button, Icons, Field, ErrorBanner } from '../ui';
import { validateLocationGeometry } from '../../utils/locationGeometry';
import type { MapCircle, MapMarker } from '../ui/interactive-map';

// Lazy-load the heavy Leaflet stack — the map only renders in "map" mode,
// keeping it out of the initial bundle.
const AdvancedMap = lazy(() =>
  import('../ui/interactive-map').then((m) => ({ default: m.AdvancedMap })),
);

interface NominatimResult {
  place_id: number;
  licence: string;
  powered_by: string;
  boundingbox: string[];
  lat: string;
  lon: string;
  type: string;
  display_name: string;
  address: {
    [key: string]: string;
  };
}

export interface LocationData {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  displayName: string;
  /** Compatibility alias for existing consumers; equals displayName when emitted. */
  areaName?: string;
  address?: {
    [key: string]: string;
  };
}

export interface LocationInputProps {
  onSave: (location: LocationData) => void;
  initialMode?: 'area' | 'coordinates' | 'map';
  onError?: (message: string) => void;
  labelPrefix?: string;
  disabled?: boolean;
}

export function LocationInput({
  onSave,
  initialMode = 'area',
  onError,
  labelPrefix = '',
  disabled = false,
}: LocationInputProps): React.JSX.Element {
  const [mode, setMode] = useState<'area' | 'coordinates' | 'map'>(initialMode);
  const [areaQuery, setAreaQuery] = useState<string>('');
  const [lat, setLat] = useState<string>('');
  const [lon, setLon] = useState<string>('');
  const [radius, setRadius] = useState<string>('100');
  const [preview, setPreview] = useState<LocationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const focusLatitude = preview?.latitude;
   const focusLongitude = preview?.longitude;
   const focusTarget = useMemo(() => {
     if (focusLatitude === undefined || focusLongitude === undefined) return undefined;
     return [focusLatitude, focusLongitude] as [number, number];
   }, [focusLatitude, focusLongitude]);

  const formatCoordinates = (lat: number, lon: number): string => {
    return `${lat.toFixed(6)}°, ${lon.toFixed(6)}°`;
  };

  const setPreviewForCoordinates = useCallback(
     (latitude: number, longitude: number, displayName: string, address?: Record<string, string>) => {
       const radiusMeters = Number(radius);
       const validationError = validateLocationGeometry({ latitude, longitude, radiusMeters });
       if (validationError) {
         setError(validationError);
         return;
       }
       setError(null);
       setPreview({ latitude, longitude, radiusMeters, displayName, address, areaName: displayName });
     },
     [radius],
   );

   const fetchLocationFromArea = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) {
      setError('Please enter an area name');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreview(null);

    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data: NominatimResult[] = await response.json();

      if (!data || data.length === 0) {
        setError('No locations found. Please try a different search term.');
        return;
      }

      const result = data[0];
      
       setPreviewForCoordinates(
         parseFloat(result.lat),
         parseFloat(result.lon),
         result.display_name,
         result.address,
       );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch location';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsLoading(false);
    }
   }, [onError, setPreviewForCoordinates]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && areaQuery.trim()) {
      fetchLocationFromArea(areaQuery);
    }
  }, [areaQuery, fetchLocationFromArea]);

  const handleAreaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAreaQuery(e.target.value);
  }, []);



  const handleRadiusChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRadius(value);

    if (!preview) return;

    const radiusMeters = Number(value);
    const validationError = validateLocationGeometry({
      latitude: preview.latitude,
      longitude: preview.longitude,
      radiusMeters,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setPreview({ ...preview, radiusMeters });
  }, [preview]);

  const handleClear = useCallback(() => {
    setAreaQuery('');
    setLat('');
    setLon('');
    setRadius('100');
    setPreview(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!preview) {
      if (onError) onError('Please select a location first');
      return;
    }

    const validationError = validateLocationGeometry({
      latitude: preview.latitude,
      longitude: preview.longitude,
      radiusMeters: preview.radiusMeters,
    });
    if (validationError) {
      setError(validationError);
      onError?.(validationError);
      return;
    }

    try {
      onSave(preview);
      handleClear();
      setMode(initialMode);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save location';
      if (onError) onError(errorMessage);
      throw err;
    }
  }, [preview, onSave, initialMode, onError, handleClear]);

  return (
    <Card title={`Add New Location${labelPrefix ? ` (${labelPrefix})` : ''}`} subtitle="">
      {/* Mode Selection Tabs */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setMode('area')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            mode === 'area'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          📍 Area
        </button>
        
        <button
          type="button"
          onClick={() => setMode('coordinates')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            mode === 'coordinates'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🔢 Coords
        </button>
        
        <button
          type="button"
          onClick={() => setMode('map')}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            mode === 'map'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          🗺️ Map
        </button>
      </div>
      
      <div className="mt-4">
        <Field label="Zone radius (meters)" hint="Distance from the center point that still counts as this location">
          <input
            type="number"
            min="1"
            step="any"
            value={radius}
            onChange={handleRadiusChange}
            disabled={disabled}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          />
        </Field>
      </div>

      {preview && (
        <Card>
          <div className="mt-4 rounded-xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-xs text-sky-900">
            <strong>Display Name:</strong><br />
            {preview.displayName}<br />
            
            <strong className="mt-1 block">Coordinates:</strong>
             {formatCoordinates(preview.latitude, preview.longitude)}<br />
             <strong>Zone radius:</strong> {preview.radiusMeters.toLocaleString()} m
             {preview.address && (
               <>
                 <br /><strong>Address:</strong> {Object.values(preview.address).join(', ')}
               </>
             )}
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={disabled}
              className="flex-1"
            >
              ✓ Add Location
            </Button>
            
            <Button
              variant="secondary"
              onClick={handleClear}
              disabled={disabled}
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Map Mode */}
      {mode === 'map' && (
        <div className="space-y-4">
          <Suspense
            fallback={
              <div className="flex h-[380px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-500">
                <Icons.refresh className="mr-2 h-4 w-4 animate-spin" />
                Memuat peta...
              </div>
            }
          >
            <AdvancedMap
               enableSearch
               enableControls
               disabled={disabled}
               style={{ height: '380px', width: '100%' }}
               focus={focusTarget}
               markers={preview && focusTarget ? [{ position: focusTarget } satisfies MapMarker] : []}
               circles={preview && focusTarget ? [{
                 center: focusTarget,
                 radius: preview.radiusMeters,
               } satisfies MapCircle] : []}
               onMapClick={(coords) => {
                 const name =
                   areaQuery.trim() || `Selected (${formatCoordinates(coords.lat, coords.lng)})`;
                 setPreviewForCoordinates(coords.lat, coords.lng, name);
               }}
               onSearchResult={(result) => {
                 setPreviewForCoordinates(result.latLng[0], result.latLng[1], result.name);
               }}
            />
          </Suspense>

          <Field
            label="Location Name (Optional)"
            hint="Give this location a meaningful name"
          >
            <input
              type="text"
              value={areaQuery}
              onChange={(e) => setAreaQuery(e.target.value)}
              placeholder="e.g., Office, Meeting Point, Store"
              disabled={disabled}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
          </Field>
        </div>
      )}

      {/* Area Input Mode */}
      {mode === 'area' && (
        <div className="space-y-4">
          <Field
            label={`${labelPrefix}Area Name`}
            hint="Search for an area to get its coordinates"
          >
            <input
              type="text"
              value={areaQuery}
              onChange={handleAreaChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || isLoading}
              placeholder="e.g., Central Park, Tokyo Tower, Mall ABC"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            />
          </Field>

          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={() => fetchLocationFromArea(areaQuery)}
              disabled={disabled || isLoading || !areaQuery}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Icons.refresh className="h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                '🔍 Search Area'
              )}
            </Button>
            
            <Button
              variant="ghost"
              onClick={handleClear}
              disabled={disabled || isLoading}
              className="px-4"
            >
              <Icons.x className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Coordinates Input Mode */}
      {mode === 'coordinates' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Latitude"
              hint="Between -90 and 90"
            >
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                disabled={disabled || isLoading}
                placeholder="-90 to 90"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              />
            </Field>
            
            <Field
              label="Longitude"
              hint="Between -180 and 180"
            >
              <input
                type="number"
                step="any"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                disabled={disabled || isLoading}
                placeholder="-180 to 180"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm shadow-slate-900/5 transition focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              />
            </Field>
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={() => {
                 const latNum = parseFloat(lat);
                 const lonNum = parseFloat(lon);
                 setPreviewForCoordinates(latNum, lonNum, formatCoordinates(latNum, lonNum));
               }}
              disabled={disabled || isLoading || !lat || !lon}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Icons.refresh className="h-4 w-4 animate-spin" />
                  Fetching...
                </>
              ) : (
                'Fetch Location'
              )}
            </Button>
            
            <Button
              variant="ghost"
              onClick={handleClear}
              disabled={disabled || isLoading}
              className="px-4"
            >
              <Icons.x className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <Icons.refresh className="h-4 w-4 animate-spin text-indigo-600" />
          <span className="text-sm text-slate-600">Fetching location data...</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <ErrorBanner message={error} />
      )}
    </Card>
  );
}
