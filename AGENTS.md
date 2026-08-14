# PROJECT KNOWLEDGE BASE — RecapinAja Photo Timestamp Studio

**Generated:** 2026-01-02  
**Status:** Production-ready client-side batch processor

## OVERVIEW

**RecapinAja** is a fully **client-side** web app that batch-processes photos by stamping timestamps directly onto images. Users provide a Google Spreadsheet containing times, pick a date, define a manual 1:1 crop template, and the app processes hundreds of photos locally—no uploads, no accounts, no server. Everything runs in-browser using Canvas API + File System Access API (Chrome/Edge desktop only).

**Stack:** React 19.2.x + TypeScript 5.x | Vite 8.2.x | TailwindCSS 4.3.x | Vitest 4.1.x

## STRUCTURE

```
RekapTestDrive/
├── src/
│   ├── App.tsx              # Main 7-step workflow orchestrator
│   ├── components/          # UI components per step (14 total)
│   │   ├── ColumnSelector.tsx       # Step 5: worksheet/time column picker
│   │   ├── CropEditor.tsx           # Step 3: interactive 1:1 crop canvas
│   │   ├── FolderSelector.tsx       # Step 2: local photo folder picker
│   │   ├── MappingPreview.tsx       # Step 5: full photo↔row mapping review
│   │   ├── ProcessingProgress.tsx   # Step 6: live progress bar
│   │   ├── ResultPanel.tsx          # Step 7: summary + failure reasons
│   │   ├── SpreadsheetUrlInput.tsx  # Step 1: Google Sheet URL input
│   │   ├── TimestampInput.tsx        # Step 4: date picker for all photos
│   │   ├── ui.tsx                       # Shared UI kit (cards, banners, icons)
│   │   └── ... (others for location features)
│   ├── services/            # Core business logic
│   │   ├── filesystem/              # FS Access API wrappers
│   │   ├── geocoder/                # External map/geocoding APIs
│   │   ├── imageProcessor/          # Canvas cropping + timestamp overlay
│   │   ├── locationManager/         # Location CRUD + persistence
│   │   ├── mapping/                 # Sequential/Name-based photo↔row pairing
│   │   ├── spreadsheet/             # URL parsing + CSV extraction (Nominatim)
│   │   └── batchPipeline.ts         # Concurrent orchestration engine
│   ├── types/               # Domain models (spreadsheet.ts, processing.ts)
│   └── utils/               # Helpers (dateFormatter, validation, concurrency)
├── tmp_photos/              # Temporary test folder for user photos
└── package.json             # Dependencies + scripts
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| **Main workflow steps** | `src/App.tsx` | 7 sequential steps mapped to state machine |
| **Google Sheets URL parsing** | `src/services/spreadsheet/url.ts` | Handles edit/published/direct CSV links |
| **CSV parsing & delimiter detection** | `src/services/spreadsheet/csvParser.ts` | RFC 4180 compliant + BOM stripping |
| **Time/date parsing formats** | `src/utils/dateFormatter.ts` | Indonesian locale months, dotted notation support |
| **Photo ↔ row mapping** | `src/services/mapping/index.ts` | Sequential or name-matching mode |
| **Image cropping + stamping** | `src/services/imageProcessor/index.ts` | Canvas-based, scales templates proportionally |
| **Batch processing orchestration** | `src/services/batchProcessor.ts` | Bounded-concurrency worker pool (default: 5) |
| **Folder pickers (input/output)** | `src/services/filesystem/` | `showDirectoryPicker()` with fallback prompts |
| **UI component library** | `src/components/ui.tsx` | Cards, banners, tables, icons (Tailwind) |
| **Manual 1:1 crop editor** | `src/components/CropEditor.tsx` | Interactive square dragged via mouse/touch |
| **Mapping preview & manual overrides** | `src/components/MappingPreview.tsx` | Drag-drop reassigns photo↔row pairs |
| **Testing core logic** | `src/**/*.test.ts` | 100+ tests; Vitest in Node env |

## CODE MAP (Top Exports by Centrality)

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `App` | Component | `App.tsx` | Root orchestrator; manages 7-step state |
| `processBatch` | Function | `batchProcessor.ts` | Core batch engine; applies crop + timestamp |
| `buildSequentialMapping` | Function | `mapping/index.ts` | Pairs photos with time rows sequentially |
| `parseGoogleSheetsUrl` | Function | `spreadsheets/url.ts` | Detects standard/published/direct link types |
| `parseSheetValues` | Function | `spreadsheets/parse.ts` | Extracts headers + data rows from CSV |
| `applyCropTemplate` | Function | `imageProcessor/index.ts` | Scales crop fractions to target resolution |
| `formatTimestamp` | Function | `utils/dateFormatter.ts` | Renders final text (Indonesian months) |
| `mapWithConcurrency` | Function | `utils/concurrency.ts` | Parallel worker pool with backpressure |
| `ColumnSelector` | Component | `components/ColumnSelector.tsx` | Step 5 worksheet/column picker UI |
| `CropEditor` | Component | `components/CropEditor.tsx` | Step 3 interactive canvas crop tool |

## CONVENTIONS (Deviations from Standard)

**Naming:**
- Components: PascalCase matching filename (`TimestampInput.tsx`)
- Private helpers: underscore prefix only when ambiguity exists (`_extractDateString`)
- Constants: UPPER_SNAKE_CASE within module scope (`DEFAULT_FORMAT_ID`, `MAX_OUTPUT_SIZE`)

**Import order (strict):**
1. Third-party libraries (React, vitest, tailwindcss)
2. Absolute imports from same directory
3. Parent/child relative imports
4. Blank line between groups

**Error handling:**
- Custom error classes with domain context: `SpreadsheetLoadError`, `ImageProcessingError`, `BatchProcessingError`
- User-facing messages wrapped; technical details preserved in stack traces internally
- Validation failures throw typed errors: `InvalidTimeError`, `InvalidDateError`

**React patterns:**
- Functional components with explicit props interfaces
- Export interface alongside component definition
- `useCallback` for all event handlers passed as props
- `useMemo` for expensive computations (crop math, mapping builds)
- Cleanup functions required for all subscriptions/effects

**Testing:**
- Test organization: `describe` blocks grouped by functionality
- Arrange-Act-Assert pattern strictly followed
- Edge cases mandatory: empty inputs, invalid formats, boundary conditions
- Target: 80%+ coverage on core business logic (mapping, parsing, formatting)

## ANTI-PATTERNS (THIS PROJECT)

- **DO NOT** hardcode secrets or API keys — all config via `process.env`
- **NEVER** upload photos externally — everything is client-side only
- **DO NOT** use `any` type — prefer `unknown` with safe narrowing
- **AVOID** global state — lift state to App, pass down via props
- **NEVER** mutate arrays/objects directly — always spread/new instances
- **DO NOT** skip cleanup in `useEffect` — always return teardown function
- **AVOID** large components (>500 lines) — split into sub-components when possible
- **DO NOT** match filenames loosely for mapping — exact string comparison only (no fuzzy matching)
- **NEVER** assume valid input — validate all external data (URLs, CSV cells, file sizes)

## UNIQUE STYLES

**Indonesian localization:**
- Month names: Januari, Februari, Maret, etc. (never English)
- Date separators: `/`, `-`, or `.` all accepted (`20/05/2022`, `20-05-2022`, `20.05.2022`)
- Time format: `HH:mm` (24h), supports `H:mm` and `HH.mm.ss` (dotted notation)

**Image processing constraints:**
- Max output dimension: 4096px (prevents memory spikes on large batches)
- Quality preserved below cap: JPEG 0.92 / PNG lossless
- Output naming: `<name>_timestamp.<ext>` (originals never modified)

**Fallback behavior:**
- If more photos than time rows → extras saved as-is to `Tanpa jam/` subfolder
- If more rows than photos → ignored (not an error, just reported)
- Invalid cells → row marked failed with precise reason (never silent drop)

**File system quirks:**
- Requires Chrome/Edge Desktop API (`showDirectoryPicker()`) — Firefox/Safari show unsupported banner
- All file writes go to user-selected output folder; permissions requested upfront

## COMMANDS

```bash
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # TypeScript check + production bundle
npm run typecheck        # Run tsc -b without bundling
npm run lint             # ESLint check
npm test                 # Run Vitest suite once
npm test -- --watch      # Watch mode for TDD
npm run test -- src/file.test.ts    # Run specific test file
```

## NOTES (Gotchas & Context)

**Spreadsheet access (PRD §1, §2):**
- Sheet must be shared as **"Anyone with the link"** or published-to-web
- No OAuth flow needed; uses public CSV endpoint (`/export?format=csv`)
- Worksheet selection via `#gid=` hash or query parameter; default to first sheet if absent
- "Timestamp" submission column is **hidden** from date/time selectors to prevent mispairing

**Sequential mapping guarantees (PRD §14, §15):**
- Photos sorted by **natural filename order** (`IMG_2.jpg` before `IMG_10.jpg`)
- Paired 1:1 with time rows starting at selected start-row (after header)
- Mismatch = failure with exact reason; no guessing/fuzzy matches allowed

**Privacy & security (PRD §Final):**
- Original photos **never modified** — outputs go to separate `Processed <date>/` folder
- Network requests limited to spreadsheet URL you paste; photos stay local
- Output size capped at 4096px/side to prevent DoS on huge images
- Object URLs revoked after canvas render to avoid memory leaks

**Browser compatibility:**
- Only Chrome/Edge Desktop supported due to File System Access API usage
- Other browsers show clear "unsupported browser" message with graceful exit
- Works offline once loaded (no CDN dependencies beyond initial load)

**Performance notes:**
- Concurrency pool defaults to 5 concurrent workers (tunable in `mapWithConcurrency` call)
- Use `createImageBitmap()` when available for faster image decoding
- Cancel in-progress batches cleanly on unmount/error to release promises
