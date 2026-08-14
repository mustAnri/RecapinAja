import { describe, expect, it } from 'vitest';
import { buildStreetLine, sampleZoneAddresses } from './zoneAddressSampler';
import type { ZoneFeaturePool } from '../types/location';

function makePool(overrides?: Partial<ZoneFeaturePool>): ZoneFeaturePool {
  return {
    addresses: [],
    roads: [],
    kecamatan: ['Kecamatan Pagedangan'],
    kabupaten: ['Kabupaten Tangerang'],
    provinsi: ['Banten'],
    ...overrides,
  };
}

describe('buildStreetLine', () => {
  it('prepends the house number when it is present', () => {
    expect(buildStreetLine({ street: 'Jalan Sinarmas Boulevard', houseNumber: '215' })).toBe(
      '215 Jalan Sinarmas Boulevard',
    );
  });

  it('returns only the street when the house number is absent or blank', () => {
    expect(buildStreetLine({ street: ' Jalan Alpha ' })).toBe('Jalan Alpha');
    expect(buildStreetLine({ street: 'Jalan Alpha', houseNumber: '   ' })).toBe('Jalan Alpha');
  });

  it('still returns the house number when the street is empty', () => {
    expect(buildStreetLine({ street: '', houseNumber: '12' })).toBe('12');
  });
});

describe('sampleZoneAddresses', () => {
  it('returns exactly count addresses', () => {
    const pool = makePool({ roads: ['Jalan A', 'Jalan B', 'Jalan C'] });
    expect(sampleZoneAddresses(pool, 10)).toHaveLength(10);
  });

  it('assigns distinct streets when the pool has at least count streets', () => {
    const pool = makePool({ roads: ['Jalan A', 'Jalan B', 'Jalan C', 'Jalan D', 'Jalan E'] });
    const results = sampleZoneAddresses(pool, 5);
    const streets = new Set(results.map((result) => result.street));
    expect(streets.size).toBe(5);
  });

  it('composes street lines from real house-number address entries', () => {
    const pool = makePool({
      addresses: [{ street: 'Jalan Sinarmas Boulevard', houseNumber: '215' }],
      roads: ['Jalan Fallback'],
    });
    const results = sampleZoneAddresses(pool, 8);
    const streetLines = new Set(results.map((result) => result.street));
    expect(streetLines.has('215 Jalan Sinarmas Boulevard')).toBe(true);
    expect(streetLines.has('Jalan Fallback')).toBe(true);
  });

  it('returns a non-empty fullAddress joined from non-empty parts', () => {
    const pool = makePool({ roads: ['Jalan A', 'Jalan B'] });
    const results = sampleZoneAddresses(pool, 6);
    for (const address of results) {
      expect(address.fullAddress.trim().length).toBeGreaterThan(0);
      expect(address.fullAddress.split(', ').length).toBeGreaterThan(0);
    }
  });

  it('returns count items when only admin names are available', () => {
    const pool = makePool({ kecamatan: ['Kecamatan X', 'Kecamatan Y'] });
    const results = sampleZoneAddresses(pool, 4);
    expect(results).toHaveLength(4);
    for (const address of results) {
      expect(address.street).toBe('');
      expect(address.fullAddress.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns an empty array for an empty pool', () => {
    const empty: ZoneFeaturePool = {
      addresses: [],
      roads: [],
      kecamatan: [],
      kabupaten: [],
      provinsi: [],
    };
    expect(sampleZoneAddresses(empty, 5)).toEqual([]);
  });

  it('returns an empty array when count is zero or negative', () => {
    const pool = makePool({ roads: ['Jalan A'] });
    expect(sampleZoneAddresses(pool, 0)).toEqual([]);
    expect(sampleZoneAddresses(pool, -3)).toEqual([]);
  });
});
