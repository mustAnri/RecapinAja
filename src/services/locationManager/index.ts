/**
 * Location Manager Service
 * 
 * A singleton service that manages location data using forward and reverse geocoding.
 * Handles adding locations by area name, managing coordinates, and persistent storage
 * in localStorage.
 */

import type {
  Coordinates,
  Address,
  Location,
  GeocodingResult,
  ZoneFeaturePool,
} from '../../types/location';
import {
  isValidLocationGeometry,
  isValidStoredRadius,
  MAX_RADIUS_METERS,
  sanitizeRawAddress,
  validateLocationGeometry,
} from '../../utils/locationGeometry';
import { NominatimGeocodingProvider } from '../geocoder/nominatimProvider';

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Base error class for location-related errors
 */
export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocationError';
  }
}

/**
 * Error thrown when a location is not found
 */
export class LocationNotFoundError extends LocationError {
  constructor(locationId: string | number) {
    super(`Location with ID ${locationId} not found`);
    this.name = 'LocationNotFoundError';
  }
}

/**
 * Error thrown when geocoding fails
 */
export class GeocodingError extends LocationError {
  constructor(message: string, public readonly provider?: string) {
    super(message);
    this.name = 'GeocodingError';
  }
}

/**
 * Error thrown when localStorage is unavailable
 */
export class StorageError extends LocationError {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

// ============================================================================
// Types and Interfaces
// ============================================================================

interface StoredLocation {
  id: string;
  areaName: string;
  coordinates: Coordinates;
  address: Address;
  radiusMeters?: number;
  rawAddress?: Record<string, string>;
  zoneFeatures?: ZoneFeaturePool;
  updatedAt: string;
}

interface LocationStorage {
  locations: StoredLocation[];
  lastUpdated: string;
}

// Default storage key for localStorage
const STORAGE_KEY = 'rekap-test-drive-locations';

// ============================================================================
// Mock Geocoding Service (to be replaced with real implementation)
// ============================================================================

/**
 * Interface for a geocoding service provider
 */
export interface GeocodingProvider {
  /** Convert area name to coordinates (forward geocoding) */
  forwardGeocode(query: string): Promise<GeocodingResult>;

  /** Convert coordinates to address (reverse geocoding) */
  reverseGeocode(coords: Coordinates): Promise<{
    success: boolean;
    message?: string;
    address?: Address;
    formattedAddress?: string;
    error?: string;
  }>;
}

// ============================================================================
// LocationManager Singleton Class
// ============================================================================

/**
 * Singleton service for managing locations with geocoding support.
 * 
 * Features:
 * - Add locations by area name (forward geocoding)
 * - Add locations by coordinates (reverse geocoding)
 * - Store/load locations from localStorage
 * - Remove individual locations or clear all
 * - Get all locations
 * - Random location selection
 */
class LocationManager {
  private static instance: LocationManager;
  
  // Geocoding provider
  private geocoder: GeocodingProvider;
  
  // Internal storage (in-memory cache + localStorage persistence)
  private locations: Map<string | number, Location> = new Map();
  
  /** Private constructor for singleton pattern */
  private constructor(geocoder?: GeocodingProvider) {
    this.geocoder = geocoder || new NominatimGeocodingProvider();
  }
  
  /**
   * Get the singleton instance of LocationManager
   * @param geocoder Optional custom geocoding provider
   */
  static getInstance(geocoder?: GeocodingProvider): LocationManager {
    if (!LocationManager.instance) {
      LocationManager.instance = new LocationManager(geocoder);
    }
    return LocationManager.instance;
  }
  
  /**
    * Initialize the manager (load from localStorage)
    */
  async initialize(): Promise<void> {
    try {
      // Check if localStorage is available
      if (typeof localStorage === 'undefined') {
        throw new StorageError('localStorage is not available');
      }
      
      const storedData = localStorage.getItem(STORAGE_KEY);
      
      if (storedData) {
        const storage: LocationStorage = JSON.parse(storedData);
        
        // Restore locations from storage
        for (const storedLoc of storage.locations) {
          const location: Location = {
             ...storedLoc,
             id: storedLoc.id, // Already a string
             ...(isValidStoredRadius(storedLoc.radiusMeters)
               ? { radiusMeters: storedLoc.radiusMeters }
               : {}),
             ...(sanitizeRawAddress(storedLoc.rawAddress)
               ? { rawAddress: sanitizeRawAddress(storedLoc.rawAddress) }
               : {}),
             updatedAt: new Date(storedLoc.updatedAt),
           };
          
          this.locations.set(location.id, location);
        }
      }
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      // If parsing fails, continue with empty store
      console.warn('Failed to load locations from localStorage:', error);
    }
  }
  
  /**
   * Generate a unique ID for a location
   */
  private generateId(): string | number {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }
  
  /**
    * Save current state to localStorage
    */
  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      
      const storage: LocationStorage = {
        locations: Array.from(this.locations.values()).map((loc) => ({
          ...loc,
          id: String(loc.id), // Convert ID to string for storage
          updatedAt: loc.updatedAt instanceof Date 
            ? (loc.updatedAt as Date).toISOString() 
            : String(loc.updatedAt || new Date()),
        })),
        lastUpdated: new Date().toISOString(),
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      // Handle quota exceeded or other storage errors
      console.error('Failed to save locations to localStorage:', error);
      throw new StorageError(
        'Failed to save locations. Storage might be full or unavailable.'
      );
    }
  }
  
  /**
   * Add a location by area name using forward geocoding
   * @param areaName Name of the area/place to geocode
   * @returns The created location object
   */
  async addByAreaName(areaName: string): Promise<Location> {
    if (!areaName || typeof areaName !== 'string' || areaName.trim().length === 0) {
      throw new LocationError('Area name must be a non-empty string');
    }
    
    try {
      // Perform forward geocoding
      const result = await this.geocoder.forwardGeocode(areaName.trim());
      
      if (!result.success || !result.coordinates) {
        throw new GeocodingError(
          result.message || 'Forward geocoding failed',
          'Mock'
        );
      }
      
      // For now, we just use the coordinates - in production, you might want
      // to pass the formatted address to get more details
      return await this.addByCoordinates(result.coordinates, areaName);
      
    } catch (error) {
      if (
        error instanceof LocationError ||
        error instanceof GeocodingError
      ) {
        throw error;
      }
      throw new GeocodingError(
        'An unexpected error occurred during geocoding',
        'Mock'
      );
    }
  }
  
  /**
   * Add a location by coordinates using reverse geocoding
   * @param coords Geographic coordinates
   * @param areaName Optional display name for the location
   * @returns The created location object
   */
  async addByCoordinates(
    coords: Coordinates,
    areaName?: string,
    radiusMeters?: number,
    rawAddress?: Record<string, string>
  ): Promise<Location> {
    if (
      !isValidLocationGeometry({
        latitude: coords.lat,
        longitude: coords.lng,
        radiusMeters: radiusMeters ?? 1,
      })
    ) {
      throw new LocationError(
        `Invalid coordinates or radius. Radius must be greater than 0 and no more than ${MAX_RADIUS_METERS} meters`,
      );
    }
    
    try {
      // Perform reverse geocoding to get address
      const result = await this.geocoder.reverseGeocode(coords);
      
      if (!result.success || !result.address) {
        throw new GeocodingError(
          result.message || result.error || 'Reverse geocoding failed',
          'Nominatim'
        );
      }
      
      // Generate unique ID
      const id = this.generateId();
      
      // Create location object
      const location: Location = {
        id,
        areaName: areaName || result.formattedAddress || `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
        coordinates: { ...coords },
        address: { ...result.address },
        ...(radiusMeters === undefined ? {} : { radiusMeters }),
        ...(rawAddress === undefined ? {} : { rawAddress: { ...rawAddress } }),
        updatedAt: new Date(),
      };
      
      // Add to internal storage
      this.locations.set(id, location);
      
      // Persist to localStorage
      this.saveToStorage();
      
      return location;
      
    } catch (error) {
      if (
        error instanceof LocationError ||
        error instanceof GeocodingError
      ) {
        throw error;
      }
      throw new GeocodingError(
        'An unexpected error occurred during reverse geocoding',
        'Nominatim'
      );
    }
  }
  
  /**
   * Remove a location by ID
   * @param id The location ID
   * @returns true if removed, false if not found
   */
  remove(id: string | number): boolean {
    const existed = this.locations.has(id);
    
    if (existed) {
      this.locations.delete(id);
      this.saveToStorage();
    }
    
    return existed;
  }
  
  /**
   * Remove multiple locations by IDs
   * @param ids Array of location IDs
   * @returns Number of locations removed
   */
  removeMany(ids: Array<string | number>): number {
    let count = 0;
    
    for (const id of ids) {
      if (this.locations.has(id)) {
        this.locations.delete(id);
        count++;
      }
    }
    
    if (count > 0) {
      this.saveToStorage();
    }
    
    return count;
  }
  
  /**
   * Clear all locations
   */
  clear(): void {
    this.locations.clear();
    
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      throw new StorageError('Failed to clear stored locations');
    }
  }
  
  /**
   * Get all locations
   * @returns Array of all locations
   */
  getAll(): Location[] {
    return Array.from(this.locations.values());
  }
  
  /**
   * Get a specific location by ID
   * @param id The location ID
   * @throws LocationNotFoundError if not found
   */
  getById(id: string | number): Location {
    const location = this.locations.get(id);
    
    if (!location) {
      throw new LocationNotFoundError(id);
    }
    
    return location;
  }
  
  /**
   * Search locations by area name or address components
   * @param query Search query string
   * @returns Array of matching locations
   */
  search(query: string): Location[] {
    const normalizedQuery = query.toLowerCase().trim();
    
    return this.getAll().filter((location) => {
      const areaMatch = location.areaName.toLowerCase().includes(normalizedQuery);
      const streetMatch = location.address.street.toLowerCase().includes(normalizedQuery);
      const kecamatanMatch = location.address.kecamatan.toLowerCase().includes(normalizedQuery);
      const kabupatenMatch = location.address.kabupaten.toLowerCase().includes(normalizedQuery);
      const provinsiMatch = location.address.provinsi.toLowerCase().includes(normalizedQuery);
      
      return areaMatch || streetMatch || kecamatanMatch || kabupatenMatch || provinsiMatch;
    });
  }
  
  /**
   * Filter locations by province
   * @param provinsi Province name to filter by
   * @returns Array of locations in the specified province
   */
  filterByProvince(provinsi: string): Location[] {
    const normalizedProvinsi = provinsi.toLowerCase().trim();
    
    return this.getAll().filter(
      (location) =>
        location.address.provinsi.toLowerCase().includes(normalizedProvinsi)
    );
  }
  
  /**
   * Filter locations by city/regency
   * @param kabupaten City or regency name to filter by
   * @returns Array of locations in the specified city/regency
   */
  filterByCity(kabupaten: string): Location[] {
    const normalizedKabupaten = kabupaten.toLowerCase().trim();
    
    return this.getAll().filter(
      (location) =>
        location.address.kabupaten.toLowerCase().includes(normalizedKabupaten)
    );
  }
  
  /**
   * Get a random location
   * @returns A random location, or null if no locations exist
   */
  getRandom(): Location | null {
    const locations = this.getAll();
    
    if (locations.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * locations.length);
    return locations[randomIndex];
  }
  
  /**
   * Get the total number of locations
   * @returns Count of locations
   */
  getCount(): number {
    return this.locations.size;
  }
  
  /**
   * Check if a location with given ID exists
   * @param id The location ID to check
   * @returns true if exists, false otherwise
   */
  hasLocation(id: string | number): boolean {
    return this.locations.has(id);
  }
  
  /**
   * Export all locations as JSON string
   * @returns JSON string of all locations
   */
  exportToJson(): string {
    return JSON.stringify(
      this.getAll().map((loc) => ({
        ...loc,
        updatedAt: loc.updatedAt instanceof Date 
          ? (loc.updatedAt as Date).toISOString() 
          : loc.updatedAt,
      })),
      null,
      2
    );
  }
  
  /**
    * Import locations from JSON string
    * @param jsonString JSON string of locations
    * @throws StorageError if JSON is invalid or storage is unavailable
    */
  importFromJson(jsonString: string): number {
    try {
      const importedLocations: Array<Partial<StoredLocation>> = JSON.parse(jsonString);
      
      if (!Array.isArray(importedLocations)) {
        throw new StorageError('Invalid JSON format: expected an array');
      }
      
      let importedCount = 0;
      
      for (const importedLoc of importedLocations) {
        // Validate required fields
        if (
          !importedLoc.id ||
          !importedLoc.areaName ||
          !importedLoc.coordinates ||
          !importedLoc.address
        ) {
          console.warn('Skipping invalid location import:', importedLoc);
          continue;
        }
        
        // Validate coordinates
        if (
          typeof importedLoc.coordinates.lat !== 'number' ||
          typeof importedLoc.coordinates.lng !== 'number' ||
          importedLoc.coordinates.lat < -90 ||
          importedLoc.coordinates.lat > 90 ||
          importedLoc.coordinates.lng < -180 ||
          importedLoc.coordinates.lng > 180
        ) {
          console.warn('Skipping location with invalid coordinates:', importedLoc);
          continue;
        }
        
        // Add location (use existing ID or generate new one)
        const id = String(importedLoc.id || this.generateId());
        const location: Location = {
           ...importedLoc,
           id,
           updatedAt: importedLoc.updatedAt 
             ? new Date(importedLoc.updatedAt)
             : new Date(),
           areaName: importedLoc.areaName || '',
           coordinates: importedLoc.coordinates || { lat: 0, lng: 0 },
           address: importedLoc.address || {
             street: '',
             kecamatan: '',
             kabupaten: '',
             provinsi: '',
             fullAddress: '',
           },
           ...(isValidStoredRadius(importedLoc.radiusMeters)
             ? { radiusMeters: importedLoc.radiusMeters }
             : {}),
           ...(sanitizeRawAddress(importedLoc.rawAddress)
             ? { rawAddress: sanitizeRawAddress(importedLoc.rawAddress) }
             : {}),
         };
        
        this.locations.set(id, location);
        importedCount++;
      }
      
      // Persist to localStorage
      this.saveToStorage();
      
      return importedCount;
      
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Invalid JSON format: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
  
  /**
   * Update an existing location
   * @param id The location ID to update
   * @param updates Partial location data to update
   * @returns Updated location
   * @throws LocationNotFoundError if ID doesn't exist
   */
  update(id: string | number, updates: Partial<Location>): Location {
    const existing = this.getById(id);
    
    const updated: Location = {
      ...existing,
      ...updates,
      id: existing.id, // Ensure ID remains unchanged
      updatedAt: new Date(), // Always update timestamp
    };
    
    if (updates.coordinates || updates.radiusMeters !== undefined) {
      const validationError = validateLocationGeometry({
        latitude: updates.coordinates?.lat ?? updated.coordinates.lat,
        longitude: updates.coordinates?.lng ?? updated.coordinates.lng,
        radiusMeters: updates.radiusMeters ?? updated.radiusMeters ?? 1,
      });
      if (validationError) {
        throw new LocationError(validationError);
      }
    }
    
    this.locations.set(id, updated);
    this.saveToStorage();
    
    return updated;
  }
  
  /**
    * Close the manager (clear resources)
    * Note: Does not clear localStorage
    */
  close(): void {
    // Don't clear data here - it should persist across sessions
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

/**
 * Get the global LocationManager instance
 * Must be called after initializing (typically on app startup)
 */
export function getLocationManager(): LocationManager {
  return LocationManager.getInstance();
}
