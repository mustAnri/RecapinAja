# Coding Standards — RecapinAja

This document defines **PREDICT** patterns for each detected language, so only **REPORT** deviations.

## Languages Detected in This Project

- TypeScript (.ts)
- TypeScript React (.tsx)
- JavaScript (ES Modules)
- JSON (package.json, tsconfig.json)

---

## PREDICT: TypeScript Patterns

### File Structure

*Every TypeScript file follows these rules:*

1. **Top-level JSDoc comment block** explaining purpose, scope, and constraints (e.g., "network-free", "unit-testable")

2. **Import organization**:
   - Standard library first (eact, 	ypescript)
   - Project imports next (../utils/..., ../../types/...)
   - Types imported with import type for type-only dependencies

3. **Export discipline**:
   - Export interfaces/types at top of file if used across modules
   - Named exports preferred over default
   - Use export type for pure type exports

4. **Function/method patterns**:
   - Explicit parameter types on exported/public functions
   - Return types always annotated for public APIs
   - unknown instead of ny for error handling
   - Readonly<T> for input parameters that must not mutate

5. **Interface vs Type Alias**:
   - Use interface for object shapes, contracts, extension points
   - Use 	ype for unions, intersections, mapped types, tuples

6. **Error handling**:
   ```typescript
   try {
     await riskyOperation(id)
   } catch (error: unknown) {
     if (error instanceof Error) throw error
   }
   ```

7. **Naming conventions**:
   - PascalCase for types, interfaces, components
   - camelCase for functions, variables, constants
   - UPPER_SNAKE_CASE only for module-level constants (if ever needed)

8. **Comments**:
   - Public API: JSDoc for params, returns, side effects
   - Complex logic: inline comments above code blocks, not below

9. **No console.log** in production code — use proper logging

10. **Immutability**: Spread operator for updates, never mutation

---

### React Component Patterns (TSX)

1. **Props definition**: Named interface or 	ype for component props

2. **Destructuring in signature**: unction Comp({ prop }: Props) — no props.prop

3. **No React.FC** unless specific reason

4. **Hook usage**:
   - useEffect always has cleanup return
   - useState with explicit generic when infer fails
   - Custom hooks start with use, return plain objects, handle edge cases

5. **SVG Icons**: Inline SVG with stroke="currentColor" and consistent stroke-width

6. **Component structure**:
   - Imports: react first, then internal modules
   - Interfaces at top
   - Constants/helpers after interface
   - Main component function last

---

### Utility Function Patterns

1. **Pure functions preferred** — no side effects unless documented

2. **Input validation early**: reject invalid inputs before processing

3. **Return type safety**: Use discriminated unions where appropriate:
   ```typescript
   interface Success { success: true; data: T }
   interface Failure { success: false; error: string }
   type Result = Success | Failure
   ```

4. **Constants as hints, not requirements**: User overrides always allowed

---

## PREDICT: Test Patterns

### Test File Structure

1. **Test filename**: <source>.test.ts in same directory as source

2. **Import order**:
   - Vitest first (describe, expect, it)
   - Then system under test

3. **Describe blocks**: Match function/group name being tested

4. **Test naming**: 'action + expected outcome or condition':
   ```typescript
   it('parses DD/MM/YYYY (PRD example 20/05/2022)', () => { ... })
   ```

5. **Arrange-Act-Assert clarity**: Single responsibility per test

6. **Edge case coverage**: Empty input, boundary values, invalid formats

### Test Philosophy

- Never silently coerce invalid data — report errors visibly
- Parse failures fall back to raw values rather than fabricating
- Blank rows skipped silently but counted
- Manual mode validated same as sheet data

---

## PREDICT: Service Layer Patterns

1. **Single Responsibility**: One service per concern (spreadsheet, imageProcessor, geocoder)

2. **Dependency injection via imports** — no global state

3. **CSV parsing**: Source-agnostic, network-free, testable

4. **User choice over guessing**: Hints pre-select defaults, user can override

5. **Error visibility**: Invalid timestamps fail visibly with exact reason

6. **Sequential mapping**: Photo N → Row N by natural sort order

7. **Fallbacks**: When both date and time manual with no sheet data, create synthetic rows

8. **Row numbering**: Spreadsheet row numbers 1-based (visible to user), array indices 0-based internally

9. **Blank skipping**: Silently skip blank rows but track count for reporting

---

## PREDICT: Type Definitions Pattern

1. **Domain-specific types** in /types/*.ts

2. **DTO separation**: Input DTOs (CreateLocationInput) separate from domain models

3. **Response shapes**: Include metadata (	otal, currentPage, pageSize)

4. **Validation rules** separate from domain logic: AddressValidationRules interface

5. **Geographic bounds**: Always validate latitude/longitude ranges

6. **Optional fields** marked with ? or union with undefined

---

## PREDICT: Configuration Files

### package.json

- "type": "module" for ES modules
- Scripts follow npm convention: dev, build, preview, lint, test, typecheck
- Dependencies grouped logically, versions pinned for stability

### tsconfig.json

- Strict mode enabled (strict: true)
- No implicit any (
oImplicitAny: true)
- Skip lib checks only if required
- Module resolution: bundler-friendly

### vite.config.ts

- ES build target
- Resolve extensions .ts, .tsx automatically

---

## PREDICT: Directory Structure

`
src/
├── App.tsx                    # Root component with flow control
├── main.tsx                   # Entry point, React render
├── components/                # Reusable UI components
│   ├── ui.tsx                 # Shared primitives (icons, buttons, cards)
│   └── [Feature]/[Feature].tsx # Step-specific components
├── services/                  # Business logic, network/file operations
│   ├── spreadsheet/           # URL parsing, CSV fetch, timestamp extraction
│   ├── mapping/               # Sequential photo ↔ row pairing
│   ├── imageProcessor/        # Canvas crop + timestamp overlay
│   ├── filesystem/            # FS Access API folder pickers
│   └── batchProcessor.ts      # Concurrency orchestration
├── types/                     # Domain type definitions
│   ├── location.ts            # Geographic/location entities
│   ├── spreadsheet.ts         # Sheet import/state types
│   └── processing.ts          # Batch job progress/result types
└── utils/                     # Pure utilities
    ├── dateFormatter.ts       # Timestamp format registry, parsing
    ├── imageOrdering.ts       # Natural sort + output naming
    ├── validation.ts          # Photo format/size validation
    └── concurrency.ts         # Bounded async worker pool
`

---

## PREDICT: Naming Conventions

| Pattern | Style | Example |
|---------|-------|--------|
| Interface/Type | PascalCase | Coordinates, LocationQueryParams |
| Component | PascalCase | ColumnSelector, CropEditor |
| Function | camelCase | parseDateCell, guessTimeColumn |
| Constant | camelCase (or UPPER for truly constant) | TIME_HINTS, DATE_HINTS |
| Test | Matches description | 'accepts a valid pair' |
| File/Directory | kebab-case or PascalCase depending on purpose | BatchPipeline.test.ts, SpreadsheetUrlInput/ |

---

## PREDICT: Code Formatting

1. **Indentation**: 2 spaces (default VSCode TS/JS setting)

2. **Quote style**: Single quotes except in template literals

3. **Trailing commas**: In multi-line arrays/objects for cleaner diffs

4. **Line length**: ~100 characters max before wrapping

5. **Empty lines**: Group related imports, separate logical sections with one empty line

---

## PREDICT: Documentation Pattern

1. **README.md**: High-level overview, requirements, quickstart, architecture diagram

2. **JSDoc at module level**: Explain constraints, assumptions, non-obvious decisions

3. **Inline comments for complex algorithms**: Why, not what

4. **PRD references**: Link to product requirements when implementing features

---

## REPORT: Deviations from Standards

Whenever you see these patterns, flag them as deviations requiring correction:

### CRITICAL — Security/Safety Violations

- ❌ Hardcoded secrets/API keys in source
- ❌ ny type in app code without unknown narrowing
- ❌ console.log() in production code
- ❌ Direct DOM manipulation without React ref tracking
- ❌ Async without await or proper error handling
- ❌ Mutation of props or state directly

### BLOCKER — Missing Tests

- ❌ Public function without unit test
- ❌ New utility or service without corresponding .test.ts file
- ❌ Parser/modifier without edge case tests

### STYLE — Minor Issues

- ❌ Unused imports
- ❌ Trailing whitespace
- ❌ Consistent quote usage violations
- ❌ Missing JSDoc on exported functions
- ❌ Inconsistent spacing around operators

### PERFORMANCE PATTERNS

- ✅ Bounded concurrency for parallel image processing
- ✅ Memoization with useMemo for expensive computations
- ✅ Lazy loading for route-specific components
- ❌ Unnecessary re-renders due to prop changes
- ❌ Event listeners not cleaned up on unmount
- ❌ Large arrays processed without virtualization

### ACCESSIBILITY VIOLATIONS

- ❌ Interactive elements without aria-label or role
- ❌ Images missing alt text
- ❌ Form fields without labels
- ❌ Focus trap issues in modals

---

## Deviation Tracking Template

When documenting deviations, use this format:

`markdown
#### Deviation: [Brief Description]

- **Location**: path/to/file.ts:[line_number]
- **Expected**: What standard says
- **Actual**: What was found
- **Impact**: Risk if not fixed
- **Fix Required**: Yes/No / Priority
`

---

## Automated Validation Rules

Run these checks regularly:

`ash
# Type safety
npm run typecheck

# Linting
npm run lint

# Test coverage
npm test -- --coverage

# Security audit
npm audit
`

Pre-commit hooks should enforce:
- No console.log
- No hardcoded secrets
- Trailing whitespace removal
- Import sorting

---

## Exception Handling

If deviation is justified, document why in code with JSDoc:

`	ypescript
// NOTE: Using 'any' here because external library lacks TypeScript defs.
// See https://github.com/library/issues/123 for upstream support pending.
const result: any = externalLib.riskyCall()
`

Or add ESLint disable comment with justification:

`	ypescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any — reason documented in PR #456
`

---

## Version Tracking

This document applies to project version 1.x.x. Track major deviations in changelog. Update this document whenever new standard patterns emerge from successful implementations.

---

## Summary — The Golden Rules

1. **Predictability**: Every file follows same structure
2. **Explicitness**: Types are clear, not inferred
3. **Fail visibly**: Invalid data reported, never fabricated
4. **Test everything**: No public function without test
5. **Immutable by default**: Spread, don't mutate
6. **Document constraints**: Module-level comments explain why
7. **Report deviations**: Nothing undocumented slips through

---

**Last updated**: Based on current project analysis  
**Maintained by**: Development team + automated tools  
**Review frequency**: Quarterly or when new major pattern emerges
