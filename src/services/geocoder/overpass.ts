const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_FEATURES = 300;
const MAX_RADIUS_METERS = 10_000;

export interface OverpassZoneCenter {
  lat: number;
  lng: number;
}

export interface OverpassRepresentativePoint {
  lat: number;
  lng: number;
}

export type OverpassZoneFeatureKind = 'road' | 'admin' | 'address';

export interface OverpassZoneFeature {
  id: `way/${number}` | `relation/${number}` | `node/${number}`;
  kind: OverpassZoneFeatureKind;
  name: string;
  adminLevel?: string;
  /** House number tag value; present only on address features. */
  houseNumber?: string;
  /** Street name from addr:street; present only on address features. */
  street?: string;
  representativePoint: OverpassRepresentativePoint;
  sourceTags: Readonly<Record<string, string>>;
}

export interface OverpassZoneFeatureResult {
  features: OverpassZoneFeature[];
  discardedCount: number;
}

export interface OverpassRequestOptions {
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  maxFeatures?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type OverpassErrorCode =
  | 'INVALID_INPUT'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'REQUEST_FAILED';

export class OverpassError extends Error {
  public readonly code: OverpassErrorCode;
  public readonly status?: number;

  constructor(message: string, code: OverpassErrorCode, cause?: unknown, status?: number) {
    super(message, { cause });
    this.name = 'OverpassError';
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
    Object.setPrototypeOf(this, OverpassError.prototype);
  }
}

interface RawOverpassElement {
  type: string;
  id: number;
  tags?: unknown;
  center?: unknown;
  geometry?: unknown;
  lat?: number;
  lon?: number;
}

interface RawOverpassResponse {
  elements: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidPoint(value: unknown): value is { lat: number; lon: number } {
  if (!isRecord(value) || !isFiniteNumber(value.lat) || !isFiniteNumber(value.lon)) {
    return false;
  }

  return value.lat >= -90 && value.lat <= 90 && value.lon >= -180 && value.lon <= 180;
}

function pointFromElement(element: RawOverpassElement): OverpassRepresentativePoint | null {
  // Nodes carry top-level lat/lon instead of center or geometry.
  if (
    element.lat !== undefined &&
    element.lon !== undefined &&
    isValidPoint({ lat: element.lat, lon: element.lon })
  ) {
    return { lat: element.lat, lng: element.lon };
  }

  if (isValidPoint(element.center)) {
    return { lat: element.center.lat, lng: element.center.lon };
  }

  if (!Array.isArray(element.geometry)) {
    return null;
  }

  for (const point of element.geometry) {
    if (isValidPoint(point)) {
      return { lat: point.lat, lng: point.lon };
    }
  }

  return null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function sourceTagsFrom(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const tags: Record<string, string> = {};
  for (const [key, tagValue] of Object.entries(value)) {
    if (typeof tagValue === 'string') {
      tags[key] = tagValue;
    }
  }
  return tags;
}

function rawElementFrom(value: unknown): RawOverpassElement | null {
  if (
    !isRecord(value) ||
    (value.type !== 'way' && value.type !== 'relation' && value.type !== 'node') ||
    !isFiniteNumber(value.id) ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0
  ) {
    return null;
  }

  const element: RawOverpassElement = {
    type: value.type,
    id: value.id,
    tags: value.tags,
    center: value.center,
    geometry: value.geometry,
  };

  // Nodes have no center/geometry; capture their top-level coordinates.
  if (isFiniteNumber(value.lat)) {
    element.lat = value.lat;
  }
  if (isFiniteNumber(value.lon)) {
    element.lon = value.lon;
  }

  return element;
}

function normalizeElement(value: unknown): OverpassZoneFeature | null {
  const element = rawElementFrom(value);
  if (element === null) {
    return null;
  }

  const tags = sourceTagsFrom(element.tags);
  if (tags === null) {
    return null;
  }

  const name = nonEmptyString(tags.name);
  const highway = nonEmptyString(tags.highway);
  const boundary = nonEmptyString(tags.boundary);
  const addrStreet = nonEmptyString(tags['addr:street']);
  const addrHouseNumber = nonEmptyString(tags['addr:housenumber']);
  const isAdmin = boundary === 'administrative' && name !== null;
  const isRoad = element.type === 'way' && highway !== null && name !== null;
  const isAddress = element.type === 'node' && addrStreet !== null && addrHouseNumber !== null;

  if (!isAddress && !isAdmin && !isRoad) {
    return null;
  }

  const representativePoint = pointFromElement(element);
  if (representativePoint === null) {
    return null;
  }

  // An element matches at most one kind; address takes priority.
  if (isAddress && addrStreet !== null && addrHouseNumber !== null) {
    return {
      id: `node/${element.id}`,
      kind: 'address',
      name: addrStreet,
      street: addrStreet,
      houseNumber: addrHouseNumber,
      representativePoint,
      sourceTags: tags,
    };
  }

  // Remaining candidates are admin/road features; both require a name.
  if (name === null) {
    return null;
  }

  const feature: OverpassZoneFeature = {
    id: `${element.type}/${element.id}` as OverpassZoneFeature['id'],
    kind: isAdmin ? 'admin' : 'road',
    name,
    representativePoint,
    sourceTags: tags,
  };

  const adminLevel = nonEmptyString(tags.admin_level);
  if (adminLevel !== null) {
    feature.adminLevel = adminLevel;
  }

  return feature;
}

function validateInput(
  center: unknown,
  radiusMeters: unknown,
  options: OverpassRequestOptions | undefined,
): {
  center: OverpassZoneCenter;
  radiusMeters: number;
  endpoint: string;
  maxFeatures: number;
  timeoutMs: number;
} {
  if (
    !isRecord(center) ||
    !isFiniteNumber(center.lat) ||
    !isFiniteNumber(center.lng) ||
    center.lat < -90 ||
    center.lat > 90 ||
    center.lng < -180 ||
    center.lng > 180
  ) {
    throw new OverpassError(
      'Center must contain finite latitude and longitude values within geographic bounds.',
      'INVALID_INPUT',
    );
  }

  if (!isFiniteNumber(radiusMeters) || radiusMeters <= 0 || radiusMeters > MAX_RADIUS_METERS) {
    throw new OverpassError(
      `Radius must be greater than 0 and no larger than ${MAX_RADIUS_METERS} meters.`,
      'INVALID_INPUT',
    );
  }

  const endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch (error: unknown) {
    throw new OverpassError('Overpass endpoint must be a valid URL.', 'INVALID_INPUT', error);
  }
  if (endpointUrl.protocol !== 'http:' && endpointUrl.protocol !== 'https:') {
    throw new OverpassError('Overpass endpoint must use HTTP or HTTPS.', 'INVALID_INPUT');
  }

  const maxFeatures = options?.maxFeatures ?? DEFAULT_MAX_FEATURES;
  if (!isFiniteNumber(maxFeatures) || !Number.isSafeInteger(maxFeatures) || maxFeatures <= 0) {
    throw new OverpassError('maxFeatures must be a positive integer.', 'INVALID_INPUT');
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!isFiniteNumber(timeoutMs) || timeoutMs <= 0) {
    throw new OverpassError('timeoutMs must be a positive finite number.', 'INVALID_INPUT');
  }

  return {
    center: { lat: center.lat, lng: center.lng },
    radiusMeters,
    endpoint: endpointUrl.toString(),
    maxFeatures,
    timeoutMs,
  };
}

function responseFrom(value: unknown): RawOverpassResponse {
  if (!isRecord(value) || !Array.isArray(value.elements)) {
    throw new OverpassError(
      'Overpass returned a malformed response; expected an object with an elements array.',
      'INVALID_RESPONSE',
    );
  }
  return { elements: value.elements };
}

function sortFeatures(features: OverpassZoneFeature[]): OverpassZoneFeature[] {
  return [...features].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'road' ? -1 : 1;
    }

    const nameOrder = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
  });
}

function requestSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortExternal = (): void => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortExternal, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      externalSignal?.removeEventListener('abort', abortExternal);
    },
  };
}

export async function detectZoneFeatures(
  center: OverpassZoneCenter,
  radiusMeters: number,
  options?: OverpassRequestOptions,
): Promise<OverpassZoneFeatureResult> {
  const input = validateInput(center, radiusMeters, options);
  const query = `[out:json][timeout:15];(way(around:${input.radiusMeters},${input.center.lat},${input.center.lng})["highway"]["name"];way(around:${input.radiusMeters},${input.center.lat},${input.center.lng})["boundary"="administrative"]["name"];relation(around:${input.radiusMeters},${input.center.lat},${input.center.lng})["boundary"="administrative"]["name"];node(around:${input.radiusMeters},${input.center.lat},${input.center.lng})["addr:street"]["addr:housenumber"];);out tags center;`;
  const request = requestSignal(options?.signal, input.timeoutMs);
  const fetchImpl = options?.fetch ?? globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    request.cleanup();
    throw new OverpassError('Browser fetch is unavailable.', 'REQUEST_FAILED');
  }

  try {
    const response = await fetchImpl(input.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      body: query,
      signal: request.signal,
    });

    if (!response.ok) {
      throw new OverpassError(
        `Overpass request failed with HTTP status ${response.status}.`,
        'HTTP_ERROR',
        undefined,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error: unknown) {
      throw new OverpassError('Overpass returned invalid JSON.', 'INVALID_RESPONSE', error);
    }

    const parsed = responseFrom(payload);
    const features: OverpassZoneFeature[] = [];
    let discardedCount = 0;
    const seenIds = new Set<string>();

    for (const element of parsed.elements) {
      const feature = normalizeElement(element);
      if (feature === null) {
        discardedCount += 1;
        continue;
      }
      if (seenIds.has(feature.id)) {
        continue;
      }
      seenIds.add(feature.id);
      features.push(feature);
    }

    return {
      features: sortFeatures(features).slice(0, input.maxFeatures),
      discardedCount,
    };
  } catch (error: unknown) {
    if (request.timedOut()) {
      throw new OverpassError('Overpass request timed out.', 'TIMEOUT', error);
    }
    if (options?.signal?.aborted) {
      throw new OverpassError('Overpass request was aborted.', 'ABORTED', error);
    }
    if (error instanceof OverpassError) {
      throw error;
    }

    throw new OverpassError('Overpass request could not be completed.', 'REQUEST_FAILED', error);
  } finally {
    request.cleanup();
  }
}
