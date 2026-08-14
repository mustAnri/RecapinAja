export const MAX_RADIUS_METERS = 100_000;

export interface LocationGeometryInput {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

/** Returns a user-facing validation message, or null for valid geometry. */
export function validateLocationGeometry({
  latitude,
  longitude,
  radiusMeters,
}: LocationGeometryInput): string | null {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return 'Latitude must be a finite number between -90 and 90';
  }

  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return 'Longitude must be a finite number between -180 and 180';
  }

  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > MAX_RADIUS_METERS) {
    return `Radius must be greater than 0 and no more than ${MAX_RADIUS_METERS.toLocaleString()} meters`;
  }

  return null;
}

export function isValidLocationGeometry(input: LocationGeometryInput): boolean {
  return validateLocationGeometry(input) === null;
}

/** Returns true only for finite, positive radii that fit the supported zone contract. */
export function isValidStoredRadius(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_RADIUS_METERS
  );
}

/** Returns a cleaned copy of provider address fields, keeping only string values. */
export function sanitizeRawAddress(
  value: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const cleaned: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      cleaned[key] = entry;
    }
  }

  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}
