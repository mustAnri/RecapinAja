# COMPONENTS KNOWLEDGE BASE — React UI Library

**Generated:** 2026-01-02  
**Purpose:** Shared UI components for photo timestamp workflow

## OVERVIEW

14 components implementing the 7-step batch processing workflow (plus shared `ui.tsx`). All use TailwindCSS v4 utility-first styling, strict TypeScript props interfaces, and follow consistent interaction patterns (controlled inputs, memoized handlers, cleanup effects).

## STRUCTURE

```
components/
├── ui.tsx             # Shared UI kit: Card, Button, Banner, Icons
├── ui/interactive-map.tsx # AdvancedMap: Leaflet map (click/search/locate/layers/cluster)
├── Background3D.tsx   # Optional 3D background animation (visual flair)
├── ColumnSelector.tsx     # Step 5: worksheet/time/date column picker
├── CropEditor.tsx         # Step 3: interactive 1:1 canvas crop tool
├── FolderSelector.tsx     # Step 2: local folder picker via FS Access API
├── LocationInput.tsx      # Add location via area search / coords / map
├── LocationList.tsx       # Display/edit/delete saved locations
├── MappingPreview.tsx     # Step 5: photo↔row pairs + manual overrides
├── ProcessingProgress.tsx # Step 6: live progress bar with stats
├── QuickMode.tsx        # Fast batch entry mode (manual date+time)
├── ResultPanel.tsx      # Step 7: summary table of successes/failures
├── SpreadsheetUrlInput.tsx # Step 1: Google Sheet URL paste + validation
└── TimestampInput.tsx    # Step 4: calendar date picker (all photos)
```

## WHERE TO LOOK

| Component | Props Interface | Key Behavior | Notes |
|-----------|-----------------|--------------|-------|
| `ColumnSelector` | `Worksheet[]`, selected column refs | Dropdowns for date/time/name columns | Auto-detects Indonesian headers |
| `CropEditor` | `previewImage` (File), `template?` | Drag square on canvas; saves fractions | Proportional scaling to all photos |
| `FolderSelector` | `mode: "input" \| "output"` | `showDirectoryPicker()` prompt | Desktop Chrome/Edge only |
| `MappingPreview` | `entries[]`, `overrides Map` | Drag-drop reassigns rows | Stealing row evicts previous owner |
| `ProcessingProgress` | `total`, `processed`, `results[]` | Live bar, success/fail counts | Cancels on unmount |
| `SpreadsheetUrlInput` | `onSave`, `existingUrl?` | Validates format, extracts gid | Handles edit/published/direct links |
| `TimestampInput` | `value?`, `onChange?` | Calendar picker (`<input type="date">`) | Same date applied to all photos |
| `ResultPanel` | `summary`, `results[]` | Table of status/errors | Click row to expand details |
| `LocationInput` | `onSave`, `initialMode` | Area/coords/map toggle | Three modes for flexibility |

## CONVENTIONS

**Props pattern:**
```typescript
export interface MyComponentProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function MyComponent({ value, onChange, disabled }: MyComponentProps) {
  // Implementation
}
```

**Event handlers:** Always `useCallback` memoized when passed as props to avoid child re-renders

**Layout:**
- Each component wrapped in `Card` wrapper from `ui.tsx`
- Buttons use primary/secondary/ghost variants consistently
- Input fields: rounded-xl, border-slate-200, focus ring-indigo-500/10

**Icons:** Use `Icons` namespace from `ui.tsx` (SVG paths compiled once)

**Accessibility:**
- All inputs have visible labels or aria-labels
- Loading states show spinners + text ("Searching...", "Fetching...")
- Error banners use red background + clear message

## ANTI-PATTERNS

- **DO NOT** put complex logic in components — extract to services/utils
- **NEVER** mutate props directly — always read-only
- **AVOID** inline event handlers — wrap in `useCallback` at parent if needed
- **DO NOT** hardcode strings — externalize constants where repeated (e.g., error messages)
- **NEVER** access DOM directly — use refs only for Canvas/File input elements

## UNIQUE PATTERNS

**Crop editor coordinate math:**
```typescript
// Template stored as fractions; scaled to each photo's resolution
const sx = Math.round(fractionX * photoWidth - fractionSize * photoWidth / 2);
const sy = Math.round(fractionY * photoHeight - fractionSize * photoHeight / 2);
const side = Math.round(fractionSize * Math.min(photoWidth, photoHeight));
```

**Manual pair overrides (stealing model):**
```typescript
// If photo A steals row 5 from photo B → B becomes extraPhoto (copied as-is later)
// Later override wins: new Map([['a.jpg', 5], ['b.jpg', 5]]) → b.jpg evicted
```

**Google Sheets link detection:**
```typescript
// Edit link (#gid=42) → kind: 'standard'
// Published link (docs.google.com/spreadsheets/d/e/...) → kind: 'published'
// Export CSV link (?format=csv&gid=3) → kind: 'direct-csv'
```
