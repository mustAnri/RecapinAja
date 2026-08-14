# Location Feature Implementation Plan 📍

## Overview
Add location data overlay to photos alongside timestamp, with random selection from user-defined locations per batch.

## User Flow

### 1. Add/Edit Locations (New Step in Workflow)
- **Manual input:** User enters area name or coordinates
- **Fetch addresses:** Call Nominatim API to get full address details
- **Preview:** Show formatted address preview
- **Save:** Store in JSON file or local storage
- **Edit/Delete:** Modify existing locations

### 2. Location Selection (Before Processing)
- Choose location source file (JSON/CSV with predefined locations)
- OR random pick from manually added locations
- Preview distribution of selected locations

### 3. Batch Processing
- For each photo: randomly select 1 location from available list
- Overlay format: `{Street}, {Kecamatan}, {Kabupaten/Kota}`
- Same styling as timestamp for consistency

## Technical Architecture

### Data Structure

```typescript
// src/types/location.ts
export interface Location {
  id: string;
  areaName: string;           // User-friendly name "Jakarta Selatan"
  latitude: number;
  longitude: number;
  street: string;             // Street name
  kecamatan: string;          // District
  kabupaten: string;          // Regency/City
  provinsi: string;           // Province
  fullAddress: string;        // Formatted complete address
}

export type LocationSource = 'manual' | 'file';

export interface LocationConfig {
  enabled: boolean;
  locations: Location[];
  source: LocationSource;
  sourceFile?: string;        // Path to uploaded file
  randomSeed?: number;        // Optional seed for reproducibility
}
```

### Service Layer

#### 1. Geocoding Service (`src/services/geocoder/nominatim.ts`)

```typescript
interface NominatimResponse {
  place_id: number;
  licence: string;
  boundingbox: string[];
  lat: string;
  lon: string;
  display_name: string;
  address: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state_district?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export async function reverseGeocode(
  lat: number,
  lon: number,
  limit: number = 1
): Promise<NominatimResponse[]> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    format: 'json',
    addressdetails: '1',
    limitedaddressdetails: '3',
    limit: limit.toString(),
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params}`
  );
  
  if (!response.ok) {
    throw new GeocodingError(`Nominatim API error: ${response.statusText}`);
  }

  return response.json();
}

export async function forwardGeocode(
  query: string,
  countryCodes?: string
): Promise<NominatimResponse[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    countrycodes: countryCodes || 'id',  // Indonesia by default
    limit: '5',
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`
  );
  
  if (!response.ok) {
    throw new GeocodingError(`Nominatim API error: ${response.statusText}`);
  }

  return response.json();
}

// Format address into Indonesian structure
export function formatIndonesianAddress(address: NominatimResponse['address']): string {
  const parts = [];
  
  // Street (jalan/road)
  if (address.road) {
    parts.push(address.road);
  }
  
  // Kecamatan (suburb/neighbourhood/city_district)
  const kecamatan = address.suburb || address.neighbourhood || address.city;
  if (kecamatan) {
    parts.push(kecamatan);
  }
  
  // Kabupaten/Kota (city/town/village)
  const kota = address.city || address.town || address.village;
  if (kota) {
    parts.push(kota);
  }
  
  // Provinsi
  if (address.state) {
    parts.push(address.state);
  }

  return parts.join(', ');
}
```

#### 2. Location Manager (`src/services/locationManager/index.ts`)

```typescript
import type { Location } from '@/types/location';

class LocationManager {
  private locations: Location[] = [];
  
  async addLocationByArea(areaName: string): Promise<Location> {
    // Search for area to get coordinates
    const results = await reverseGeocodeQuery(areaName);
    
    if (results.length === 0) {
      throw new LocationError(`Area not found: ${areaName}`);
    }
    
    const bestMatch = results[0];
    const coords = {
      lat: parseFloat(bestMatch.lat),
      lon: parseFloat(bestMatch.lon),
    };
    
    // Get detailed address via reverse geocode
    const details = await reverseGeocode(coords.lat, coords.lon);
    
    const location: Location = {
      id: crypto.randomUUID(),
      areaName,
      ...coords,
      kecamatan: details.address.suburb || details.address.city || '',
      kabupaten: details.address.city || details.address.town || '',
      provinsi: details.address.state || '',
      street: details.address.road || '',
      fullAddress: formatIndonesianAddress(details.address),
    };
    
    this.locations.push(location);
    return location;
  }
  
  async addLocationByCoordinates(lat: number, lon: number): Promise<Location> {
    const details = await reverseGeocode(lat, lon);
    
    const location: Location = {
      id: crypto.randomUUID(),
      areaName: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      latitude: lat,
      longitude: lon,
      kecamatan: details.address.suburb || details.address.city || '',
      kabupaten: details.address.city || details.address.town || '',
      provinsi: details.address.state || '',
      street: details.address.road || '',
      fullAddress: formatIndonesianAddress(details.address),
    };
    
    this.locations.push(location);
    return location;
  }
  
  saveToStorage(): void {
    localStorage.setItem('locations', JSON.stringify(this.locations));
  }
  
  loadFromStorage(): void {
    const stored = localStorage.getItem('locations');
    if (stored) {
      this.locations = JSON.parse(stored);
    }
  }
  
  removeFromStorage(id: string): void {
    this.locations = this.locations.filter(loc => loc.id !== id);
    this.saveToStorage();
  }
  
  clearAll(): void {
    this.locations = [];
    this.saveToStorage();
  }
  
  getAvailableLocations(): Location[] {
    return [...this.locations];
  }
  
  getRandomLocation(): Location | null {
    if (this.locations.length === 0) return null;
    const index = Math.floor(Math.random() * this.locations.length);
    return this.locations[index];
  }
}

export const locationManager = new LocationManager();
```

#### 3. Random Selector Utility (`src/utils/locationSelector.ts`)

```typescript
import type { Location } from '@/types/location';

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Select random locations without replacement (each location used at most once)
 */
export function selectRandomLocationsWithoutReplacement(
  locations: Location[],
  count: number
): Location[] {
  const shuffled = shuffleArray(locations);
  return shuffled.slice(0, Math.min(count, locations.length));
}

/**
 * Select random locations with replacement (can reuse same location multiple times)
 */
export function selectRandomLocationsWithReplacement(
  locations: Location[],
  count: number
): Location[] {
  if (locations.length === 0) return [];
  
  const selected: Location[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * locations.length);
    selected.push(locations[index]);
  }
  return selected;
}

/**
 * Weighted random selection (e.g., prefer certain areas)
 */
export function weightedRandomSelection(
  locations: Array<{location: Location; weight: number}>,
  count: number
): Location[] {
  if (locations.length === 0) return [];
  
  const totalWeight = locations.reduce((sum, item) => sum + item.weight, 0);
  const selected: Location[] = [];
  
  for (let i = 0; i < count; i++) {
    let random = Math.random() * totalWeight;
    for (const item of locations) {
      if (random < item.weight) {
        selected.push(item.location);
        break;
      }
      random -= item.weight;
    }
  }
  
  return selected;
}
```

## Component Implementation

### New Components

#### 1. LocationInput (`src/components/LocationInput/LocationInput.tsx`)

```tsx
import { useState } from 'react';
import { locationManager } from '@/services/locationManager';

interface LocationInputProps {
  onAdd: (location: Location) => void;
  loading?: boolean;
}

export function LocationInput({ onAdd, loading }: LocationInputProps) {
  const [inputType, setInputType] = useState<'area' | 'coordinates'>('area');
  const [query, setQuery] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setError(null);
    setPreview(null);

    try {
      let result;
      
      if (inputType === 'area') {
        result = await forwardGeocode(query);
      } else {
        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        
        if (isNaN(lat) || isNaN(lon)) {
          setError('Invalid coordinates');
          return;
        }
        
        result = await reverseGeocode(lat, lon);
      }
      
      if (result.length === 0) {
        setError('Location not found');
        return;
      }
      
      const address = formatIndonesianAddress(result[0].address);
      setPreview(address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch location');
    }
  }

  async function handleAdd() {
    if (!preview) return;

    try {
      let location: Location;
      
      if (inputType === 'area') {
        location = await locationManager.addLocationByArea(query);
      } else {
        location = await locationManager.addLocationByCoordinates(
          parseFloat(latitude),
          parseFloat(longitude)
        );
      }
      
      onAdd(location);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add location');
    }
  }

  function resetForm() {
    setQuery('');
    setLatitude('');
    setLongitude('');
    setPreview(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      {/* Input Type Toggle */}
      <div className="flex space-x-2">
        <button
          onClick={() => setInputType('area')}
          className={`px-4 py-2 rounded ${inputType === 'area' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          Area Name
        </button>
        <button
          onClick={() => setInputType('coordinates')}
          className={`px-4 py-2 rounded ${inputType === 'coordinates' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          Coordinates
        </button>
      </div>

      {/* Input Fields */}
      {inputType === 'area' ? (
        <input
          type="text"
          placeholder="Enter area name (e.g., 'Jakarta Selatan')"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full p-2 border rounded"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="any"
            placeholder="Latitude"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            className="p-2 border rounded"
          />
          <input
            type="number"
            step="any"
            placeholder="Longitude"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            className="p-2 border rounded"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex space-x-2">
        <button
          onClick={handlePreview}
          disabled={loading || !query && !latitude}
          className="px-4 py-2 bg-yellow-500 text-white rounded disabled:opacity-50"
        >
          Preview
        </button>
        <button
          onClick={handleAdd}
          disabled={loading || !preview}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          Add Location
        </button>
      </div>

      {/* Preview */}
      {preview && (
        <div className="p-3 bg-blue-50 rounded border">
          <p className="font-semibold">Preview:</p>
          <p className="text-sm">{preview}</p>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
```

#### 2. LocationList (`src/components/LocationList/LocationList.tsx`)

```tsx
import type { Location } from '@/types/location';

interface LocationListProps {
  locations: Location[];
  onSelect: (location: Location) => void;
  onDelete?: (id: string) => void;
  maxSelect?: number;
}

export function LocationList({ 
  locations, 
  onSelect, 
  onDelete,
  maxSelect 
}: LocationListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    const newSelected = new Set(selectedIds);
    
    if (maxSelect && newSelected.size >= maxSelect && !newSelected.has(id)) {
      alert(`Maximum ${maxSelect} locations allowed`);
      return;
    }

    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    
    setSelectedIds(newSelected);
    
    // Trigger parent callback
    const selectedLocations = locations.filter(l => newSelected.has(l.id));
    onSelect(selectedLocations[0] || selectedLocations[selectedLocations.length - 1]);
  }

  return (
    <div className="space-y-2">
      {locations.length === 0 ? (
        <p className="text-gray-500 text-center">No locations yet</p>
      ) : (
        locations.map((loc) => (
          <div
            key={loc.id}
            className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
              selectedIds.has(loc.id) ? 'bg-blue-50 border-blue-500' : ''
            }`}
            onClick={() => toggleSelect(loc.id)}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold">{loc.areaName}</p>
                <p className="text-sm text-gray-600">{loc.fullAddress}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </p>
              </div>
              
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(loc.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))
      )}
      
      <p className="text-xs text-gray-500 text-center">
        {selectedIds.size} of {locations.length} locations selected
        {maxSelect && ` (max ${maxSelect})`}
      </p>
    </div>
  );
}
```

#### 3. LocationOverlayRenderer (`src/services/imageProcessor/locationOverlay.ts`)

```typescript
import type { Location } from '@/types/location';

export interface LocationOverlayOptions {
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  backgroundColor?: string;
  padding?: number;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  opacity?: number;
}

export function renderLocationOverlay(
  canvas: HTMLCanvasElement,
  location: Location,
  options: LocationOverlayOptions = {}
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const opts = {
    fontSize: 24,
    fontFamily: 'Inter, Arial, sans-serif',
    textColor: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    position: 'bottom-left',
    opacity: 1.0,
    ...options,
  };

  const lines = location.fullAddress.split(',').filter(Boolean);
  
  // Calculate text size
  ctx.font = `bold ${opts.fontSize}px ${opts.fontFamily}`;
  const maxWidth = lines.reduce((max, line) => {
    const metrics = ctx.measureText(line);
    return Math.max(max, metrics.width);
  }, 0);

  const lineHeight = opts.fontSize * 1.4;
  const totalHeight = lines.length * lineHeight;
  const boxWidth = maxWidth + opts.padding * 2;
  const boxHeight = totalHeight + opts.padding * 2;

  // Position calculation
  let x: number, y: number;
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  switch (opts.position) {
    case 'top-left':
      x = opts.padding;
      y = opts.padding;
      break;
    case 'top-right':
      x = canvasWidth - boxWidth - opts.padding;
      y = opts.padding;
      break;
    case 'bottom-right':
      x = canvasWidth - boxWidth - opts.padding;
      y = canvasHeight - boxHeight - opts.padding;
      break;
    case 'bottom-left':
    default:
      x = opts.padding;
      y = canvasHeight - boxHeight - opts.padding;
      break;
  }

  // Draw background
  ctx.globalAlpha = opts.opacity;
  ctx.fillStyle = opts.backgroundColor;
  ctx.fillRect(x, y, boxWidth, boxHeight);

  // Draw text
  ctx.textBaseline = 'top';
  let currentY = y + opts.padding;

  for (const line of lines) {
    ctx.fillStyle = opts.textColor;
    ctx.fillText(line.trim(), x + opts.padding, currentY);
    currentY += lineHeight;
  }

  ctx.globalAlpha = 1.0;
}
```

## Integration Points

### Main App Flow Integration

Add location step between **Kolom Jam** and **Proses**:

```tsx
// src/App.tsx

function App() {
  const [step, setStep] = useState<number>(1);
  const [locationConfig, setLocationConfig] = useState<LocationConfig>({
    enabled: false,
    locations: [],
    source: 'manual',
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-100 to-pink-100">
      {/* Progress Steps */}
      <ol className="steps steps-vertical lg:steps-horizontal">
        <Step title="Spreadsheet URL" active={step >= 1} completed={step > 1} />
        <Step title="Foto" active={step >= 2} completed={step > 2} />
        <Step title="Crop 1:1" active={step >= 3} completed={step > 3} />
        <Step title="Tanggal" active={step >= 4} completed={step > 4} />
        <Step title="Kolom Jam" active={step >= 5} completed={step > 5} />
        <Step title="📍 Lokasi" active={step >= 6} completed={step > 6} />
        <Step title="Mapping Preview" active={step >= 7} completed={step > 7} />
        <Step title="Proses" active={step >= 8} completed={step > 8} />
        <Step title="Hasil" active={step === 9} />
      </ol>

      {/* Step Content */}
      <main className="container mx-auto p-6">
        {step === 6 && (
          <LocationStep
            locationConfig={locationConfig}
            onConfigChange={setLocationConfig}
            onNext={() => setStep(7)}
            onPrev={() => setStep(5)}
          />
        )}
        
        {/* Other steps... */}
      </main>
    </div>
  );
}
```

### Processing Pipeline Integration

Update `batchProcessor.ts` to include location:

```typescript
// src/services/batchProcessor.ts

interface ProcessOptions {
  date: string;
  timestamps: TimestampParts[];
  cropTemplate?: CropTemplate;
  locationConfig?: LocationConfig;
  outputFormat?: 'jpg' | 'png';
  quality?: number;
}

async function processPhotoBatch(
  photos: File[],
  options: ProcessOptions
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  const concurrency = 3; // bounded concurrency
  
  // Prepare locations
  let locations: Location[] = [];
  if (options.locationConfig?.enabled) {
    locations = selectRandomLocationsWithoutReplacement(
      options.locationConfig.locations,
      photos.length
    );
  }

  const workerPool = createWorkerPool(concurrency, async (photoIndex: number) => {
    const photo = photos[photoIndex];
    
    // Load image
    const imageBitmap = await createImageBitmap(photo);
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(imageBitmap.width, MAX_OUTPUT_SIZE);
    canvas.height = Math.min(imageBitmap.height, MAX_OUTPUT_SIZE);
    const ctx = canvas.getContext('2d')!;
    
    // Draw image
    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    
    // Apply crop if template provided
    if (options.cropTemplate) {
      applyCropTemplate(canvas, options.cropTemplate);
    }
    
    // Add timestamp if available
    if (options.timestamps[photoIndex]) {
      renderTimestampOverlay(canvas, options.date, options.timestamps[photoIndex]);
    }
    
    // Add location if configured
    if (options.locationConfig?.enabled && locations[photoIndex]) {
      renderLocationOverlay(canvas, locations[photoIndex]);
    }
    
    // Save result
    const blob = await canvas.toBlob(undefined, options.outputFormat ?? 'jpg', 0.92);
    const outputName = generateOutputFileName(photo.name);
    
    return {
      original: photo.name,
      output: outputName,
      success: true,
      blob,
    };
  });

  // Execute batch
  await Promise.all(photos.map((_, i) => workerPool.enqueue(i)));
  
  return results;
}
```

## Dependencies Needed

```jsonc
// package.json
{
  "devDependencies": {
    // Already installed
    "vitest": "^4.1.10",
    "@testing-library/react": "^16.3.0",
    
    // Optional: For CSV upload support
    // "papaparse": "^5.4.1"
  }
}
```

## Testing Strategy

```typescript
// src/services/geocoder/nominatim.test.ts

import { describe, expect, it, vi } from 'vitest';
import { reverseGeocode, formatIndonesianAddress } from './nominatim';

vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

describe('formatIndonesianAddress', () => {
  it('formats complete Indonesian address', () => {
    const address = {
      road: 'Jl. Sudirman No. 123',
      suburb: 'Melawai',
      city: 'Jakarta Selatan',
      state: 'DKI Jakarta',
    };
    
    const result = formatIndonesianAddress(address);
    
    expect(result).toBe('Jl. Sudirman No. 123, Melawai, Jakarta Selatan, DKI Jakarta');
  });
  
  it('handles missing fields gracefully', () => {
    const address = {
      city: 'Bandung',
      state: 'Jawa Barat',
    };
    
    const result = formatIndonesianAddress(address);
    
    expect(result).toBe('Bandung, Jawa Barat');
  });
});

describe('selectRandomLocationsWithoutReplacement', () => {
  it('returns unique locations up to count', () => {
    const locations = [
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ];
    
    const result = selectRandomLocationsWithoutReplacement(locations, 2);
    
    expect(result.length).toBe(2);
    expect(new Set(result.map(l => l.id)).size).toBe(2); // No duplicates
  });
});
```

## Edge Cases & Error Handling

1. **API Rate Limiting**: Nominatim allows ~1 request/sec without rate limiting
   - Implement request queue with delay
   - Add retry logic with exponential backoff
   
2. **Network Failures**: Graceful degradation when offline
   - Cache last successful geocode results
   - Allow manual coordinate entry as fallback
   
3. **Incomplete Address Data**: Some locations may lack street info
   - Handle optional fields gracefully
   - Display what's available

4. **Large Lists**: Performance with 100+ locations
   - Virtual scrolling for long lists
   - Lazy loading if needed

## Next Steps Checklist

- [ ] Create `Location` type definition
- [ ] Implement Nominatim service
- [ ] Build LocationManager class
- [ ] Create LocationInput component
- [ ] Create LocationList component
- [ ] Build LocationOverlayRenderer
- [ ] Add location step to App flow
- [ ] Update batch processor to include location overlay
- [ ] Add tests for all components/services
- [ ] Add UI for enabling/disabling location feature
- [ ] Test end-to-end flow with real locations
- [ ] Add documentation with examples

## Resources

- [OpenStreetMap Nominatim Documentation](https://nominatim.org/release-docs/latest/api/)
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Reverse Geocoding Example](https://nominatim.org/release-docs/latest/api/Reverse/)

---

Ready to implement, sayang? 💕 Let me know if you want me to start coding or if you have questions first! 🚀✨
