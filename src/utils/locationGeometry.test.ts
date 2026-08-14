import { describe, expect, it } from 'vitest';
import {
  MAX_RADIUS_METERS,
  isValidLocationGeometry,
  validateLocationGeometry,
} from './locationGeometry';

describe('location geometry validation', () => {
  it('accepts finite coordinates and a positive radius', () => {
    expect(isValidLocationGeometry({ latitude: -6.2, longitude: 106.8, radiusMeters: 250 })).toBe(true);
  });

  it('rejects non-finite or out-of-range coordinates', () => {
    expect(validateLocationGeometry({ latitude: Number.NaN, longitude: 0, radiusMeters: 1 })).toContain('Latitude');
    expect(validateLocationGeometry({ latitude: 91, longitude: 0, radiusMeters: 1 })).toContain('Latitude');
    expect(validateLocationGeometry({ latitude: 0, longitude: Number.POSITIVE_INFINITY, radiusMeters: 1 })).toContain('Longitude');
  });

  it('rejects non-positive and excessive radii', () => {
    expect(isValidLocationGeometry({ latitude: 0, longitude: 0, radiusMeters: 0 })).toBe(false);
    expect(isValidLocationGeometry({ latitude: 0, longitude: 0, radiusMeters: MAX_RADIUS_METERS + 1 })).toBe(false);
  });
});
