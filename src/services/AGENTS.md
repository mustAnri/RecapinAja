# SERVICES KNOWLEDGE BASE — Core Business Logic

**Generated:** 2026-01-02  
**Purpose:** Domain logic for spreadsheet parsing, mapping, image processing, file system access

## OVERVIEW

Pure TypeScript service modules handling the full batch pipeline: URL→CSV→mapping→canvas→filesystem. No React dependencies; all async operations bounded with concurrency limits. Heavy test coverage (100+ unit tests) on parsers, mappers, and formatters.

## STRUCTURE

```
services/
├── filesystem/       # File System Access API wrappers (folder pickers, writes)
├── geocoder/         # External map APIs (Nominatim/OpenStreetMap integration)
├── imageProcessor/   # Canvas-based cropping + timestamp overlay rendering
├── locationManager/  # CRUD + localStorage persistence for saved locations
├── mapping/          # Sequential/name-based photo↔row pairing algorithms
├── spreadsheet/      # Google Sheets URL parsing + CSV extraction (RFC 4180)
└── batchProcessor.ts # Concurrent orchestration engine (worker pool)
```

## WHERE TO LOOK

| Service | Purpose | Key Exports |
|---------|---------|-------------|
| `filesystem/index.ts` | FS Access API | `pickInputFolder()`, `pickOutputFolder()`, `writeFile()` |
| `geocoder/index.ts` | Geocoding APIs | `searchArea()`, `getAddressPreview()` |
| `geocoder/nominatim.ts` | Nominatim client | Rate-limiting, error handling, coordinate conversion |
| `geocoder/overpass.ts` | Zone feature detection (Overpass) | `detectZoneFeatures()` — roads/admin/address nodes inside a radius |
| `imageProcessor/index.ts` | Canvas processing | `applyCropTemplate()`, `stampTimestamp()`, `centerSquareTemplate()` |
| `locationManager/index.ts` | Location storage | `addLocation()`, `getLocations()`, `deleteLocation()` |
| `mapping/index.ts` | Photo↔row pairing | `buildSequentialMapping()`, `buildNameMapping()`, `applyManualPairs()` |
| `spreadsheet/url.ts` | Link parsing | `parseGoogleSheetsUrl()`, `csvEndpointsFor()` |
| `spreadsheet/csvParser.ts` | CSV parsing | `parseDelimitedText()`, `detectDelimiter()`, `stripBom()` |
| `spreadsheet/parse.ts` | Row extraction | `parseSheetValues()`, `extractTimestampRows()`, `guessTimeColumn()` |
| `batchProcessor.ts` | Orchestration | `processBatch()`, `processBatchStream()`, `expandLocationsForBatch()` |

## CONVENTIONS

**Error classes (custom, domain-specific):**
```typescript
export class SpreadsheetLoadError extends Error {}
export class InvalidTimeError extends Error {}
export class ImageProcessingError extends Error {}
export class BatchProcessingError extends Error {}
```

**Async patterns:**
- Use `try-catch` with typed error catching: `catch (error: unknown)`
- Narrow via `instanceof` checks before accessing properties
- User-facing messages wrap technical details; stack traces preserved internally

**Testing requirements:**
- All pure functions must have test cases covering edge cases
- Invalid inputs return `null`/`false`/empty arrays — never throw from parser
- Validated by Vitest in Node environment (no browser APIs mocked)

**Import hygiene:**
- No React imports in service layer
- Cross-service imports explicit path (`../mapping/index` not `./index`)

## ANTI-PATTERNS

- **NEVER** upload photos or use external APIs beyond Nominatim geocoding
- **DO NOT** modify original files — outputs always to new directory
- **AVOID** blocking I/O — all filesystem operations async with bounded concurrency
- **NEVER** assume valid input — validate URLs, dates, times before processing
- **DO NOT** use `any` type — prefer `unknown` + narrowing or generics
- **AVOID** global state — instantiate services where needed, no singletons

## UNIQUE STYLES

**Nominatim rate limiting:**
```typescript
// Requests max 1/sec to comply with OSM usage policy
const MIN_INTERVAL_MS = 1000;
let lastRequest = 0;

function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequest));
  return new Promise(resolve => setTimeout(() => resolve(fetch(url)), wait));
}
```

**Crop template proportionality:**
```typescript
// Fractions stored as ratios [0,1]; scaled to each photo's actual resolution
// This allows one template to work across mixed resolutions
const applyCropTemplate = (width: number, height: number, template: CropTemplate) => {
  const side = Math.round(template.sizeFraction * Math.min(width, height));
  const sx = Math.round((template.xFraction * width - side / 2));
  const sy = Math.round((template.yFraction * height - side / 2));
  return { sx, sy, side }; // Clamp later in rendering step
};
```

**Sequential mapping edge cases:**
```typescript
// If photos.length > rows.length → extras copied as-is to "Tanpa jam/"
// If photos.length < rows.length → extraRows reported (not an error)
// Invalid cells (bad date/time) → row failed with reason; no silent drops
```

**Batch concurrency backpressure:**
```typescript
// Worker pool limited by mapWithConcurrency(items, limit, workerFn)
// Default: 5 concurrent images to prevent memory spikes
// Results order preserved despite parallel execution
```

## COMMANDS (Testing)

```bash
npm test -- src/services/spreadsheet/csvParser.test.ts
npm test -- src/services/mapping/index.test.ts
npm test -- src/services/batchPipeline.e2e.test.ts
```
