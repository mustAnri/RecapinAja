# RecapinAja — Photo Timestamp Studio

A fully **client-side** web app that batch-processes photos: it reads a **list
of times** from a Google Spreadsheet (no login needed), you type the date once,
every photo is cropped with a **manual 1:1 crop template** and stamped with the
combined timestamp, and the results are saved into a **local output folder** —
all in your browser.

No accounts, no OAuth, no server, no uploads.

## How it works (seven steps)

1. **List Jam** — paste the Google Spreadsheet URL. The sheet is read through
   Google's public CSV endpoint, so it must be shared as *“Anyone with the
   link”* (or published to the web). No Google login is involved. The sheet
   only provides the **list of times** — one time per photo.
2. **Foto** — pick the local folder that contains the raw photos (JPG/JPEG/PNG).
   The folder is scanned and the photos are listed in deterministic filename
   order.
3. **Crop 1:1** — pick any photo as preview, drag the square into place, and
   confirm. The rectangle is saved as a proportional **crop template** and
   replayed on every photo, whatever its resolution — no stretching.
4. **Tanggal** — type the date once (calendar picker). The same date applies to
   every photo and is combined with each time from the list.
5. **Kolom Jam** — choose the worksheet (`gid`), the **time column**, the header
   row and the row where the data starts. Photos are paired **sequentially**
   with the time rows (photo #1 ↔ first row, photo #2 ↔ second, …), and the
   full mapping with the final timestamp text is shown for review before
   anything runs.
6. **Proses** — press *Process*, choose the destination folder, and the batch
   runs with a live progress bar.
7. **Hasil** — a summary shows total / successful / failed, with the reason for
   every failure. Processed copies are saved as `<name>_timestamp.<ext>` inside
   a new `Processed <date>` subfolder; the originals are never touched.

When there are **more photos than time rows**, the leftover photos are never
dropped: the original files are copied as-is (no crop, no timestamp) into a
`Tanpa jam` subfolder inside the output folder, so every photo comes back.

The steps have **no locks** — you can open any step in any order. Every step
shows a small *Panduan* (guide) panel with what to do, plus inline hints when
something is still missing. The *Proses* step shows a readiness checklist with
one-click links to whatever is not filled in yet.

Because all image processing happens with the Canvas API in the browser, the
only network request the app can make is fetching the spreadsheet link you
paste. Photos never leave your machine.

---

## Requirements

- **Node.js 20+** and npm (for development)
- **Chrome or Edge on desktop** at runtime — the app uses the File System
  Access API (`showDirectoryPicker`) to read the photo folder and write the
  results. Firefox/Safari show a clear “unsupported browser” message.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
```

Open the printed URL (usually http://localhost:5173). No environment variables
or API credentials are needed.

## Scripts

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Start the Vite dev server                  |
| `npm run build`     | Type-check and build the production bundle |
| `npm run preview`   | Serve the production build locally         |
| `npm test`          | Run the unit test suite (Vitest)           |
| `npm run lint`      | ESLint                                     |
| `npm run typecheck` | TypeScript (`tsc -b`)                      |

---

## Making your Google Sheet readable (no login)

The app reads the sheet through the public CSV endpoint, so the sheet must be
publicly readable:

**Option A — share the link (simplest)**

1. Open the sheet → **Share**.
2. Under *General access*, choose **Anyone with the link → Viewer**.
3. Copy the normal URL from the address bar and paste it into the app.
   The spreadsheet id and worksheet (`#gid=…`) are detected automatically.

**Option B — publish to the web**

1. **File → Share → Publish to web**.
2. Choose the sheet/tab, format *Comma-separated values (.csv)*, and publish.
3. Paste the published link into the app.

> ⚠️ Keep privacy in mind: anything in a publicly shared sheet is readable by
> anyone with the link. Keep only the columns you need (e.g. just the time
> list), and stop sharing when you are done.

**Worksheet selection** — the app reads one worksheet at a time. The worksheet
is taken from `#gid=…` in the URL; you can also type another `gid` in step 5
(*Kolom Jam*) and switch without re-pasting the link.

**Accepted values**

| Value | Source                                       | Accepted formats                    | Example      |
| ----- | -------------------------------------------- | ----------------------------------- | ------------ |
| Date  | typed manually in step 4 (all photos)         | calendar picker (`YYYY-MM-DD`)      | `2022-05-20` |
| Time  | one cell per row in the chosen time column    | `HH:mm`, `H:mm`, `HH:mm:ss` (24 h)  | `14:09`      |

Rows with a missing or invalid time are **never guessed**: the paired photo
fails visibly with the exact reason, so a wrong timestamp can never end up on
a photo.

## Sequential mapping — verify before processing
There is no filename matching: the photos sorted by filename (natural order,
so `IMG_2` comes before `IMG_10`) are paired 1:1 with the time rows starting
at your chosen start row. Step 5 (*Kolom Jam*) lists **every** pair with the
timestamp that will be stamped — check that the order matches your expectation
(rename the files or adjust the start row if it does not). If there are more
photos than rows, the extra photos are listed and will fail; extra rows are
ignored and reported.

---

## Architecture

```
src/
  App.tsx                      # seven-step flow
  types/
    spreadsheet.ts             # imported sheet, row selection, sequential mapping
    processing.ts              # crop template, batch progress/results
  services/
    spreadsheet/               # URL parsing + public CSV fetch + time-list extraction
    mapping/                   # sequential photo ↔ row pairing
    imageProcessor/            # crop template replay + timestamp overlay (Canvas)
    filesystem/                # folder pickers + output writes (FS Access API)
    batchProcessor.ts          # bounded-concurrency orchestration
  components/
    ui.tsx                     # shared UI kit (cards, banners, tables, icons)
    SpreadsheetUrlInput/       # step 1: time-list link + privacy warning
    FolderSelector/            # step 2: folder scan + detected order
    CropEditor/                # step 3: interactive manual 1:1 crop
    TimestampInput/            # step 4: manual date for all photos
    ColumnSelector/            # step 5: worksheet/time column/start row + preview
    MappingPreview/            # step 5: full mapping review
    ProcessingProgress/        # step 6: live progress bar
    ResultPanel/               # step 7: summary + failure reasons
  utils/
    dateFormatter.ts           # timestamp format registry (Indonesian months)
    imageOrdering.ts           # natural filename sort + output naming
    validation.ts              # photo format/size validation
    concurrency.ts             # bounded async worker pool
```

## Quality & verification

- `npm run lint` — ESLint
- `npm run typecheck` — strict TypeScript across app and tests
- `npm test` — 100+ unit tests covering URL parsing, CSV parsing, row
  extraction, sequential mapping, date/time validation and formatting,
  filename ordering, crop-template math, and the concurrency pool
- `npm run build` — production bundle

## Deploying to Vercel

The app is a static Vite site — any static host works. For Vercel:

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In [vercel.com](https://vercel.com) → **Add New → Project**, import the repo.
3. Vercel auto-detects Vite. Confirm:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Deploy. No environment variables are required.

CLI alternative:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

> Remember: the deployed app still reads the photo folder **locally** through
> the browser's File System Access API — hosting only serves the static UI.
> Visitors must use Chrome or Edge on desktop.

## Privacy & security notes

- **Photos stay local**: all image processing runs on the Canvas API in your
  browser and results are written to a folder you choose. Nothing is uploaded.
- **Originals are never modified** — outputs live in a separate
  `Processed <date>` subfolder with `_timestamp` suffixed names.
- **No credentials**: the app has no OAuth flow, API keys, or backend — there
  is nothing to configure or leak.
- **Network use is opt-in**: the only fetch is the spreadsheet link you paste.
- Output size is capped at 4096 px per side to keep large batches stable;
  quality below that cap is preserved (JPEG 0.92 / PNG lossless).
