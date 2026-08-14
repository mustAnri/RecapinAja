/**
 * Nominatim-backed geocoding provider for the LocationManager.
 *
 * Replaces the former mock provider so every saved location carries a real
 * OpenStreetMap address — nothing generated locally.
 */

import type { Address, Coordinates, GeocodingResult } from '../../types/location';
import type { GeocodingProvider } from '../locationManager';
import { forwardGeocode, reverseGeocodeStructured } from './nominatim';
import type { NominatimReverseResponse } from './nominatim';

/** Map Nominatim address parts (Indonesian coverage) to the app Address shape. */
function addressFromReverseResponse(response: NominatimReverseResponse): Address {
  const parts = response.address;

  const houseNumber = (parts.house_number ?? '').trim();
  const road = (parts.road ?? '').trim();
  const street = houseNumber !== '' && road !== '' ? `${houseNumber} ${road}` : road;

  // Indonesian mapping: kecamatan ≈ suburb/city_district, kabupaten/kota ≈
  // city/town/county, provinsi ≈ state.
  const kecamatan = ((parts.suburb ?? parts.city_district ?? parts.quarter ?? parts.neighbourhood) ?? '').trim();
  const kabupaten = ((parts.city ?? parts.town ?? parts.county) ?? '').trim();
  const provinsi = (parts.state ?? '').trim();

  const components = [street, kecamatan, kabupaten, provinsi].filter((value) => value !== '');

  return {
    street,
    kecamatan,
    kabupaten,
    provinsi,
    fullAddress: components.length > 0 ? components.join(', ') : response.display_name,
  };
}

export class NominatimGeocodingProvider implements GeocodingProvider {
  async forwardGeocode(query: string): Promise<GeocodingResult> {
    try {
      const result = await forwardGeocode(query, { limit: 1 });
      return {
        success: true,
        message: 'Geocoding successful',
        coordinates: { lat: parseFloat(result.lat), lng: parseFloat(result.lon) },
        formattedAddress: result.display_name,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Forward geocoding failed',
      };
    }
  }

  async reverseGeocode(coords: Coordinates): Promise<{
    success: boolean;
    message?: string;
    address?: Address;
    formattedAddress?: string;
    error?: string;
  }> {
    try {
      const response = await reverseGeocodeStructured(coords.lat, coords.lng);
      const address = addressFromReverseResponse(response);
      return {
        success: true,
        message: 'Reverse geocoding successful',
        address,
        formattedAddress: response.display_name,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Reverse geocoding failed',
      };
    }
  }
}
