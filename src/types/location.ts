/**
 * Location Type Definitions
 * 
 * This file contains all TypeScript interfaces and types for the location feature.
 * It includes definitions for location data, coordinates, address information,
 * and related location-based entities.
 */

/**
 * Geographic coordinates with latitude and longitude
 */
export interface Coordinates {
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number;
  /** Longitude in decimal degrees (-180 to 180) */
  lng: number;
}

/**
 * Address components representing a structured Indonesian address
 */
export interface Address {
  /** Street name or building address */
  street: string;
  /** Sub-district (Kecamatan in Indonesian) */
  kecamatan: string;
  /** City/Regency (Kabupaten/Kota in Indonesian) */
  kabupaten: string;
  /** Province (Provinsi in Indonesian) */
  provinsi: string;
  /** Complete formatted address combining all components */
  fullAddress: string;
}

/**
 * A single street address extracted from an OSM address node (addr:street
 * plus, when present, addr:housenumber) inside a saved zone.
 */
export interface ZoneAddressEntry {
  /** Street name from the addr:street tag */
  street: string;
  /** House number from the addr:housenumber tag, when available */
  houseNumber?: string;
}

/**
 * Pool of OSM features detected inside a zone radius. At batch time the pool
 * is expanded into N unique per-photo addresses (one per processed photo).
 */
export interface ZoneFeaturePool {
  /** Real house-number+street pairs from OSM addr nodes */
  addresses: ZoneAddressEntry[];
  /** Named roads (street-only fallback) */
  roads: string[];
  /** Admin_level 8-10 names (kecamatan/kelurahan) */
  kecamatan: string[];
  /** Admin_level 5-7 names (kabupaten/kota) */
  kabupaten: string[];
  /** Admin_level 4 names (provinsi) */
  provinsi: string[];
}

/**
 * Location entity representing a physical place
 */
export interface Location {
  /** Unique identifier for the location */
  id: string | number;
  /** Display name of the area/place */
  areaName: string;
  /** Geographic coordinates of the location */
  coordinates: Coordinates;
  /** Structured address information */
  address: Address;
  /** Optional circular zone radius in meters; absent on legacy point records. */
  radiusMeters?: number;
  /** Original provider address fields, when available. */
  rawAddress?: Record<string, string>;
  /** OSM features detected inside the zone; expanded into unique per-photo addresses at batch time. */
  zoneFeatures?: ZoneFeaturePool;
  /** Optional timestamp when location was created or last updated */
  updatedAt?: Date | string;
}

/**
 * Input DTO for creating a new location
 */
export interface CreateLocationInput {
  areaName: string;
  coordinates: Coordinates;
  address: Omit<Address, 'fullAddress'>;
  radiusMeters?: number;
  rawAddress?: Record<string, string>;
}

/**
 * Input DTO for updating an existing location
 */
export interface UpdateLocationInput {
  areaName?: string;
  coordinates?: Coordinates;
  address?: Partial<Omit<Address, 'fullAddress'>>;
  radiusMeters?: number;
  rawAddress?: Record<string, string>;
}

/**
 * Response DTO returned after location creation
 */
export interface CreatedLocationResponse extends Location {
  /** Timestamp when the location was created */
  createdAt: Date | string;
}

/**
 * Query parameters for filtering and searching locations
 */
export interface LocationQueryParams {
  /** Search query matching areaName, street, or full address */
  search?: string;
  /** Filter by province */
  provinsi?: string;
  /** Filter by city/regency */
  kabupaten?: string;
  /** Filter by sub-district */
  kecamatan?: string;
  /** Pagination page number (1-indexed) */
  page?: number;
  /** Number of items per page */
  limit?: number;
  /** Sort field: 'areaName', 'createdAt', 'updatedAt' */
  sortBy?: 'areaName' | 'createdAt' | 'updatedAt';
  /** Sort order: 'asc' or 'desc' */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response containing locations and metadata
 */
export interface LocationListResponse {
  /** Array of location objects */
  data: Location[];
  /** Total number of locations matching the query */
  total: number;
  /** Current page number */
  currentPage: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of pages available */
  totalPages: number;
}

/**
 * Bounding box for geographic range queries
 */
export interface BoundingBox {
  /** Northwest corner latitude */
  north: number;
  /** Northwest corner longitude */
  west: number;
  /** Southeast corner latitude */
  south: number;
  /** Southeast corner longitude */
  east: number;
}

/**
 * Distance calculation result between two coordinates
 */
export interface DistanceResult {
  /** Distance in kilometers */
  distanceKm: number;
  /** Distance in meters */
  distanceMeters: number;
  /** Origin coordinates */
  from: Coordinates;
  /** Destination coordinates */
  to: Coordinates;
}

/**
 * Geocoding result converting address to coordinates
 */
export interface GeocodingResult {
  /** Whether geocoding was successful */
  success: boolean;
  /** Success message */
  message?: string;
  /** Converted coordinates if successful */
  coordinates?: Coordinates;
  /** Formatted address if successful */
  formattedAddress?: string;
  /** Error details if failed */
  error?: string;
}

/**
 * Validation rules for address fields
 */
export interface AddressValidationRules {
  /** Minimum length for street field */
  streetMinLength?: number;
  /** Maximum length for street field */
  streetMaxLength?: number;
  /** Minimum length for kecamatan field */
  kecamatanMinLength?: number;
  /** Maximum length for kecamatan field */
  kecamatanMaxLength?: number;
  /** Minimum length for kabupaten field */
  kabupatenMinLength?: number;
  /** Maximum length for kabupaten field */
  kabupatenMaxLength?: number;
  /** Minimum length for provinsi field */
  provinsiMinLength?: number;
  /** Maximum length for provinsi field */
  provinsiMaxLength?: number;
}

/**
 * Coordinate bounds validation
 */
export interface CoordinateBounds {
  /** Minimum allowed latitude */
  minLat: number;
  /** Maximum allowed latitude */
  maxLat: number;
  /** Minimum allowed longitude */
  minLng: number;
  /** Maximum allowed longitude */
  maxLng: number;
}
