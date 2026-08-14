import { describe, expect, it, vi } from 'vitest';
import { detectZoneFeatures, type OverpassRequestOptions } from './overpass';

function response(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('detectZoneFeatures', () => {
  it('validates the center and radius before making a request', async () => {
    const fetchMock = vi.fn();

    await expect(
      detectZoneFeatures({ lat: 91, lng: 0 }, 100, { fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      detectZoneFeatures({ lat: 0, lng: 0 }, 10_001, { fetch: fetchMock }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries once, normalizes, deduplicates, sorts, and reports discarded elements', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        elements: [
          {
            type: 'relation',
            id: 9,
            tags: { boundary: 'administrative', name: 'Central', admin_level: '6' },
            center: { lat: 1, lon: 2 },
          },
          {
            type: 'way',
            id: 4,
            tags: { highway: 'primary', name: 'Beta Road', surface: 'asphalt' },
            center: { lat: 1.1, lon: 2.1 },
          },
          {
            type: 'way',
            id: 3,
            tags: { highway: 'residential', name: 'Alpha Road' },
            geometry: [{ lat: 1.2, lon: 2.2 }],
          },
          {
            type: 'way',
            id: 4,
            tags: { highway: 'primary', name: 'Beta Road' },
            center: { lat: 1.1, lon: 2.1 },
          },
          { type: 'node', id: 10, tags: { name: 'Not supported' } },
          { type: 'way', id: 12, tags: { highway: 'service' } },
        ],
      }),
    );
    const options: OverpassRequestOptions = { fetch: fetchMock, maxFeatures: 10 };

    const result = await detectZoneFeatures({ lat: 1, lng: 2 }, 250, options);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(request?.method).toBe('POST');
    expect(request?.body).toBe(
      '[out:json][timeout:15];(way(around:250,1,2)["highway"]["name"];way(around:250,1,2)["boundary"="administrative"]["name"];relation(around:250,1,2)["boundary"="administrative"]["name"];node(around:250,1,2)["addr:street"]["addr:housenumber"];);out tags center;',
    );
    expect(result).toEqual({
      features: [
        {
          id: 'way/3',
          kind: 'road',
          name: 'Alpha Road',
          representativePoint: { lat: 1.2, lng: 2.2 },
          sourceTags: { highway: 'residential', name: 'Alpha Road' },
        },
        {
          id: 'way/4',
          kind: 'road',
          name: 'Beta Road',
          representativePoint: { lat: 1.1, lng: 2.1 },
          sourceTags: { highway: 'primary', name: 'Beta Road', surface: 'asphalt' },
        },
        {
          id: 'relation/9',
          kind: 'admin',
          name: 'Central',
          adminLevel: '6',
          representativePoint: { lat: 1, lng: 2 },
          sourceTags: { boundary: 'administrative', name: 'Central', admin_level: '6' },
        },
      ],
      discardedCount: 2,
    });
  });

  it('normalizes address nodes into kind "address" with street and houseNumber', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        elements: [
          {
            type: 'node',
            id: 21,
            tags: { 'addr:street': 'Jalan Sinarmas Boulevard', 'addr:housenumber': '215' },
            lat: -6.25,
            lon: 106.6,
          },
          // Missing addr:housenumber — not an address feature.
          {
            type: 'node',
            id: 22,
            tags: { 'addr:street': 'Jalan Tanpa Nomor' },
            lat: -6.26,
            lon: 106.61,
          },
        ],
      }),
    );

    const result = await detectZoneFeatures({ lat: -6.25, lng: 106.6 }, 500, {
      fetch: fetchMock,
    });

    expect(result).toEqual({
      features: [
        {
          id: 'node/21',
          kind: 'address',
          name: 'Jalan Sinarmas Boulevard',
          street: 'Jalan Sinarmas Boulevard',
          houseNumber: '215',
          representativePoint: { lat: -6.25, lng: 106.6 },
          sourceTags: { 'addr:street': 'Jalan Sinarmas Boulevard', 'addr:housenumber': '215' },
        },
      ],
      discardedCount: 1,
    });
  });

  it('caps normalized features', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        elements: [
          { type: 'way', id: 1, tags: { highway: 'primary', name: 'A' }, center: { lat: 0, lon: 0 } },
          { type: 'way', id: 2, tags: { highway: 'primary', name: 'B' }, center: { lat: 0, lon: 0 } },
        ],
      }),
    );

    const result = await detectZoneFeatures({ lat: 0, lng: 0 }, 1, {
      fetch: fetchMock,
      maxFeatures: 1,
    });

    expect(result.features).toHaveLength(1);
    expect(result.features[0]?.id).toBe('way/1');
  });

  it('maps malformed roots and HTTP failures to typed errors', async () => {
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ elements: {} }));
    const httpFetch = vi.fn<typeof fetch>().mockResolvedValue(response({}, { status: 503 }));

    await expect(
      detectZoneFeatures({ lat: 0, lng: 0 }, 1, { fetch: malformedFetch }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(
      detectZoneFeatures({ lat: 0, lng: 0 }, 1, { fetch: httpFetch }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 503 });
  });

  it('distinguishes timeout and caller abort', async () => {
    const timeoutFetch = vi.fn().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const rejectAborted = (): void => reject(new DOMException('Aborted', 'AbortError'));
          if (init?.signal?.aborted) {
            rejectAborted();
            return;
          }
          init?.signal?.addEventListener('abort', rejectAborted, { once: true });
        }),
    );
    await expect(
      detectZoneFeatures({ lat: 0, lng: 0 }, 1, { fetch: timeoutFetch, timeoutMs: 1 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    const controller = new AbortController();
    controller.abort();
    await expect(
      detectZoneFeatures({ lat: 0, lng: 0 }, 1, { fetch: timeoutFetch, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});
