/**
 * Zone address sampling utilities.
 *
 * Expands a pool of OSM features detected inside one or more circular zones
 * into N unique structured addresses (one per processed photo). Street lines
 * prefer real house-number + street pairs from OSM address nodes and fall
 * back to bare road names; kecamatan/kabupaten/provinsi are sampled from the
 * detected administrative areas.
 */

import type { Address, ZoneFeaturePool } from '../types/location';
import { shuffleArray } from './locationSelector';

/** Maximum retries when a generated street/admin combination was used before. */
const MAX_COMBO_RETRIES = 8;

/**
 * Compose the display street line for one address entry.
 * Returns "houseNumber street" when a house number exists, else the street.
 */
export function buildStreetLine(entry: { street: string; houseNumber?: string }): string {
  const houseNumber = entry.houseNumber?.trim() ?? '';
  const street = entry.street.trim();
  if (houseNumber === '') {
    return street;
  }
  return `${houseNumber} ${street}`.trim();
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function randomOf(options: string[]): string {
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Sample `count` unique addresses from a zone feature pool.
 *
 * Streets cycle through a shuffled option list, so when the pool holds at
 * least `count` street options the first `count` photos all get distinct
 * streets. Admin components are picked randomly per slot; duplicate
 * full combinations are retried (bounded) before being accepted best-effort.
 *
 * Returns [] when count <= 0 or when the pool carries no usable data —
 * the caller then decides on a fallback.
 */
export function sampleZoneAddresses(pool: ZoneFeaturePool, count: number): Address[] {
  if (count <= 0) {
    return [];
  }

  const streetOptions = uniqueNonEmpty([
    ...pool.addresses.map((entry) => buildStreetLine(entry)),
    ...pool.roads,
  ]);

  if (
    streetOptions.length === 0 &&
    pool.kecamatan.length === 0 &&
    pool.kabupaten.length === 0 &&
    pool.provinsi.length === 0
  ) {
    return [];
  }

  const kecamatanOptions = pool.kecamatan.length > 0 ? pool.kecamatan : [''];
  const kabupatenOptions = pool.kabupaten.length > 0 ? pool.kabupaten : [''];
  const provinsiOptions = pool.provinsi.length > 0 ? pool.provinsi : [''];

  const shuffledStreets = shuffleArray(streetOptions);
  const usedCombos = new Set<string>();
  const results: Address[] = [];

  for (let index = 0; index < count; index += 1) {
    const street =
      shuffledStreets.length > 0 ? shuffledStreets[index % shuffledStreets.length] : '';

    let kecamatan = randomOf(kecamatanOptions);
    let kabupaten = randomOf(kabupatenOptions);
    let provinsi = randomOf(provinsiOptions);
    let combo = [street, kecamatan, kabupaten, provinsi].join('\u0000');

    let attempts = 0;
    while (usedCombos.has(combo) && attempts < MAX_COMBO_RETRIES) {
      kecamatan = randomOf(kecamatanOptions);
      kabupaten = randomOf(kabupatenOptions);
      provinsi = randomOf(provinsiOptions);
      combo = [street, kecamatan, kabupaten, provinsi].join('\u0000');
      attempts += 1;
    }
    usedCombos.add(combo);

    const parts = [street, kecamatan, kabupaten, provinsi].filter((part) => part.trim() !== '');
    results.push({
      street,
      kecamatan,
      kabupaten,
      provinsi,
      fullAddress: parts.join(', '),
    });
  }

  return results;
}
