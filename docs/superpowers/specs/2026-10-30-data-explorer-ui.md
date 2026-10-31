# Data explorer: UI and interaction spec (final)

> **Superseded by docs/superpowers/specs/2026-10-31-data-sources-and-portal.md.** Kept for history; where they differ, the newer spec holds.

Status: final design, 2026-10-30. Architecture and API facts: `2026-10-30-data-explorer-design.md`. Data contract: `src/sources/types.ts`.
The base is design C ("decision ledger"). It adds B's pinned baseline, insights drawer and accessible brush, and A's live methods draft, actionable bias flags, zero-result relax and library behaviour.

## 1. Concept

The explorer is a full-screen workspace with three header tabs: **Occurrences**, **Phylogeny** and **Cite & reproduce**. The tabs are the only navigation; there is no step rail.

On Occurrences, every decision the biogeographer makes is shown as a line with a signed record count in the **decision ledger**. The ledger sits under a live density map, and next to it an insights column flags sampling biases.

The ledger has two sections that never mix:
1. **Filter impact (each alone)**: marginal, overlapping counts from `filterImpact`. Drawn as hollow bars.
2. **Cleaning (in order)**: the sequential funnel from `Funnel`. Drawn as solid waterfall bars. It appears once loading starts.

The same rows freeze after a load and become the supplementary table and the methods text. A **pinned baseline** lets the user ask "what if" before the first load. A sticky **methods draft** rewrites after every edit, so the dataset is always defensible.

Visual language matches the app: slate `brand` palette, `size="sm"` controls (`xs` for icon buttons), Philosopher only in the "Data explorer" title, semantic tokens only (`bg`, `bg.subtle`, `bg.muted`, `fg`, `fg.muted`, `border`, `colorPalette.*`), and `fontVariantNumeric="tabular-nums"` on every number.

## 2. Layout

Full-screen `DialogRoot size="full"`, no double backdrop. At 1280×800 the regions are:

| Region | Size |
|---|---|
| Header | 44 px |
| Body | 3-column grid, 300 px · 1fr · 280 px |
| Methods strip | 32 px, collapsed |
| Load dock | 56 px |

The centre column stacks the KPI strip (52 px), the map (2:1 aspect, at most 42 % of body height, at least 220 px) and the ledger, which scrolls. Columns scroll independently, and the page never scrolls horizontally.

From 1024 to 1279 px wide:
- The query column narrows to 280 px.
- The insights column becomes an overlay `Drawer` (320 px, right). It opens from a KPI-strip button, `Insights · ⚠ 2`, so the active flag count stays visible.
- The dock wraps onto two lines.

### A. Occurrences tab (preview)
```
┌ ✦ Data explorer   [Occurrences][Phylogeny][Cite & reproduce]   [●GBIF ✓][●OBIS ✓]  [Library ▾] [?] [✕] ┐
├ QUERY 300 ───────────────┬ PREVIEW ──────────────────────────────────────────┬ INSIGHTS 280 ──────────┤
│ TAXA            Felidae… │ Records ≤412,380  Species 214  Datasets 1,102     │ BIAS CHECKS  ⚠ 2 of 5  │
│ [⌕ Scientific or common…]│ Years 1823–2025   ⟳ updating   [📌 Pin baseline]   │ ⚠ Dataset dominance    │
│ (Felidae FAMILY ✕)       │  baseline: Species 214 → 198 (−7.5 %)             │   eBird 64 % ████████░ │
│ (Canidae FAMILY ✕ GBIF only)│ ┌ map: GBIF density + OBIS grid ──────────────┐ │   [Exclude dataset] ⓘ │
│ AREA       Neotropic     │ │ ░▒▓  ┌────┐ area outline     [▭ Draw] [World│Area]│ │ ⚠ Temporal skew      │
│ [Neotropic realm ▾]      │ │      └────┘                                     │ │   72 % since 2011     │
│ [Countries…] [▭ Draw]    │ │ legend 1·10·100·1k+ rec/px                      │ │   [Narrow years] ⓘ    │
│ ▸ Coordinates W S E N    │ │ Map shows taxon, area, years, basis only        │ │ ✓ Human obs. 41 %     │
│ YEARS  1970 – 2025       │ └─────────────────────────────────────────────────┘ │ ✓ Countries BR 38 %   │
│ ▁▁▂▂▃▅▇█▇ (brush, √)     │ DECISION LEDGER                [View as table][CSV]│ ✓ Low-count spp 8 %   │
│ [1970] – [2025]          │ Filter impact · each alone (overlapping)          │ COMPOSITION            │
│ 61 % after 2010          │ ☑ No fossil/living spec.  ▭▭▭        −88,410  6 % │ Basis ▇▇▇▇▆▂ (click ✕) │
│ DEPTH (OBIS)  – to – m   │ ☑ Uncertainty ≤ 10 km    ▭▭▭▭▭▭▭▭ −371,002 31 % │ Top datasets (10)      │
│ QUALITY                  │ ☑ No geospatial issues    ▭▭      −21,870  2 % │ Top species  (10)      │
│ (●)Recommended ( )Permis.│ ☑ Native/wild only        ▏        −1,204  0 % │ Countries    (10)      │
│ ( )Custom               │ ☑ Presence only           ▏           −93  0 % │ Issues (GBIF) (8)      │
│ Uncertainty ≤ [10] km    │ ☑ Years 1970–2025         ▭▭▭     −63,115  5 % │ Uncert. avg 2.1 km     │
│ ☐ Keep records without   │ ☐ Excluded datasets (0)                          │                        │
│   uncertainty (≈58 %)    │ = Matches all filters               412,380      │                        │
│ Dedupe [One per site ▾]  │ Each bar is what that filter alone removes. Filters│                        │
│ Min. records/species [1] │ overlap, so the bars don't add up. ⓘ              │                        │
├──────────────────────────┴───────────────────────────────────────────────────┴────────────────────────┤
│ ▴ Methods draft: "Occurrences of Felidae (GBIF 9703) and Canidae … were retrieved …"          [Copy]  │
│ ≈412 k records · 61 MB · ~2 min · 96 requests  Cap [500,000]  (●Replace ○Add)  [ Load 412,380 records ]│
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### B. Loading

The query column is dimmed and read-only, with the label "Query locked while loading — cancel to edit". Insights stay visible. The dock grows to 132 px, and the ledger gains the live Cleaning section.
```
│ DECISION LEDGER                                                                                     │
│ Filter impact · each alone  (frozen at load time, as A)                                             │
│ Cleaning · in order                                                                                 │
│ Received              █████████████████████  251,004   GBIF 241,0k · OBIS 10,0k                    │
│ − Invalid / no species ▏                       −1,812                                                │
│ − Outside area         ▏                         −306                                               │
│ − Duplicates           ██                     −18,440   of which GBIF∩OBIS 2,115                     │
│ = Accepted            ███████████████████    230,446                                                │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Loading "Felidae, Canidae · Neotropic · 1970–2025"         1 m 12 s elapsed · ~0 m 41 s left        │
│ GBIF ███████████████▒▒▒▒ 241,004 / 398,104 · species 171/214 · req 58/96 · 37 MB                    │
│ OBIS ████████████████████ 10,000 / 14,276 · ⏸ GBIF busy, retrying in 6 s (attempt 2/5)              │
│                                                   [Minimize ▾]  [Cancel load ▾]                    │
│                                       Cancel ▾ → Keep 230,446 records and run Infomap | Discard     │
```

### C. After load: the success panel and the Cite & reproduce tab

A persistent success panel replaces the KPI strip until the query is edited: `✓ Loaded 398,112 records · 209 species · 1,087 datasets · 2 sources · 14:03 · Bioregions computing… [View bioregions] [Cite this data]`. If the user kept a partial load, an amber banner sits above it: `⚠ Partial dataset: 230,446 of ~412,380 planned records (56 %). Some species may be under-sampled. The methods text says so.`
```
│ THIS DATASET  398,112 records · 209 spp · 1,087 datasets · retrieved 2026-10-30 14:03   [Edit query & reload] │
│ ┌ Ledger (frozen: filter impact + cleaning) ──────────────── [View as table] [Download ledger CSV] ┐ │
│ METHODS PARAGRAPH                                                         [Copy] [Copy references] │
│ "Occurrence records of Felidae (GBIF taxonKey 9703) … OBIS … 1970–2025 … uncertainty ≤ 10 km …"    │
│ GBIF CITATION — choose one                                                                         │
│ ① Derived dataset (fast)   [Download datasetKey,count CSV] [Open GBIF registration ↗]              │
│    DOI after registering [10.15468/dd-______] [Save]                                               │
│ ② Citable GBIF download    [Request citable DOI…]   ◷ RUNNING · key 0012345-… · checked 14:31     │
│    → SUCCEEDED doi:10.15468/dl.abc123 · 398,540 rec · 41 MB [Open zip ↗]                          │
│    ┌ Drop the downloaded .zip here (or browse) ┐  Zip: 398,540 received → 398,101 accepted          │
│    └────────────────────────────────────────────┘  (stream: 398,112)  [Replace with official download] [Keep streamed, cite DOI] │
│ OBIS CITATION  "OBIS (2026) Ocean Biodiversity Information System…" + 14 dataset ids  [Copy]       │
│ QUERY  [Copy JSON] [Download query.json] [Save to library…]                                         │
```

### D. Phylogeny tab
```
│ NAMES  209 loaded species → Open Tree         ┃ TREES FOR Carnivora      sort [Coverage ▾] ☐ Dated only │
│ ████████████████▆░ 191 matched · 12 synonyms  ┃ ┌ Source               Coverage   Year  Dated  Lengths  DOI┐ │
│ · 6 unmatched                                 ┃ │◉ Open Tree synthesis 191/209 ███ v15.1  –   Grafen   –  │ │
│ ▸ Synonyms (12)   [Copy]                      ┃ │○ Nyakatura & B-E     168/209 ██▊ 2012  ✓ Myr time    ↗  │ │
│   Puma yagouaroundi → Herpailurus yagouaroundi ┃ │○ Johnson et al.      33/209  ▏   2006  ✓ Myr time    ↗  │ │
│ ▸ Unmatched (6)   [Copy]                      ┃ │○ Piras et al.        ⟳ checking…  2013  –  other   ↗   │ │
│ CLADE (MRCA)                                  ┃ └─────────────────────────────────────────────────────────┘ │
│ Carnivora · order · 312 tips in synthesis     ┃ SELECTED  Open Tree synthesis v15.1                          │
│ ⚠ 5 taxa placed at MRCA (broken) [show]       ┃ 191 tips kept · 18 dataset species absent [show] · 121 tree tips pruned │
│                                               ┃ ⓘ Topology only. Branch lengths use Grafen's method (ρ = 1):  │
│                                               ┃   ages are relative (root = 1), not millions of years.       │
│                                               ┃                          [ Load tree & re-run bioregions ]   │
```

### E. Entry points
```
DATA ─────────────────────────────             Empty map (centre card):
[⤒ Load data…]                                 ┌──────────────────────────────────┐
[Load examples]                                │ No data yet                       │
[⌕ Explore GBIF & OBIS…]                       │ [⌕ Explore GBIF & OBIS] [Load file]│
 while an explorer load runs:                  └──────────────────────────────────┘
 GBIF+OBIS 241k / 412k ▓▓▓▓▒▒ [Open] [Cancel]
 after a load:
 Felidae, Canidae · Neotropic · 1970–2025
 [Edit query] [Cite]
```

## 3. Component tree and work packages

All components live in `src/components/Explorer/` and are MobX `observer`s that read `explorerStore` and `phyloStore` through `useStore()`. Props are `none` unless listed, so the packages connect only through the stores and the agreed file names. Where a package depends on a file another package has not yet delivered, it renders a stub until merge.

**UI-1 Shell and query builder (~800 LOC)**

| File | Responsibility |
|---|---|
| `ExplorerDialog.tsx` | Full-screen dialog, header, tabs, `SourceChips` and close button. Focus trap and return of focus to the opener. Handles Esc, Minimize and the shortcut hook. |
| `SourceChips.tsx` | Each chip shows on/off, a status dot (ready, loading, error, rate-limited) and a tooltip with the `supports` reason. Retry lives in the tooltip. |
| `OccurrencesTab.tsx` | The grid and the responsive Drawer switch. Composes `QueryColumn`, `PreviewColumn`, `InsightsColumn`, `MethodsStrip` and `LoadDock`. |
| `query/QueryColumn.tsx` | Section headers with a one-line summary each ("AREA · Neotropic"), plus a dot when the section changed since the last load. |
| `query/TaxonPicker.tsx` | Chakra `Combobox` with chips. |
| `query/AreaPicker.tsx` | Preset Select (World, continents, realms), countries multi-select, Draw toggle, collapsible W/S/E/N number fields. |
| `query/YearBrush.tsx` | d3 histogram from `yearsAll`, √-scale toggle, two `role="slider"` handles, From/To `NumberInput`s, a readout line. |
| `query/DepthField.tsx` | Depth range. |
| `query/QualityPanel.tsx` | Preset radio, uncertainty km, keep-missing switch with share, dedupe select, minimum records per species. |
| `format.ts` | `fmtInt`, `fmtCompact`, `fmtBytes`, `fmtDuration`, `fmtPct`. |
| `useExplorerShortcuts.ts` | Keyboard shortcuts. |
| Edits | `ControlPanel/Data.tsx` gets the entry button and status rows. The empty-map CTA goes in `App.tsx` or `WorldMap.tsx`. |

**UI-2 Preview and insights (~850 LOC)**

| File | Responsibility |
|---|---|
| `preview/PreviewColumn.tsx` | KPI strip (or the success panel from UI-3), the map and the ledger. When the query is empty it shows `ExampleCards` from UI-3. |
| `preview/KpiStrip.tsx` | Records, Species, Datasets, Years. Per-source split tooltip, `≤` and overlap note, skeleton or stale state, Pin baseline, delta chips, Insights drawer button. |
| `preview/PreviewMap.tsx` | Plate-carrée `<img>` tiles from the GBIF EPSG:4326 base and density tiles, fitted to the area (zoom 0–3, no free pan). SVG overlay with the OBIS grid, area outline and rectangle draw. Legend and the "map shows…" note. |
| `preview/DecisionLedger.tsx` | Props `mode: 'preview' \| 'live' \| 'frozen'`. Filter rows are the checkboxes. Ghost ticks and Δ against the loaded snapshot. Hidden mirror `<table>`, View as table, CSV. |
| `insights/InsightsColumn.tsx` | `BiasPanel` and `CompositionPanel`. Renders as a Drawer body below 1280 px. |
| `insights/BiasPanel.tsx` | Flags with threshold, InfoTip and action. Checks that pass collapse into one ✓ line each. |
| `insights/CompositionPanel.tsx` | Basis, datasets, species, countries and issues as `ShareBar` lists. Clicking a GBIF dataset or basis bar excludes it. |
| `charts/ShareBar.tsx` | The single d3/SVG bar primitive used by the ledger, composition, bias and coverage views. Variants `hollow`, `solid` and `ghost`. |
| `charts/ViewAsTable.tsx` | Toggle wrapper that shows a chart as a table. |
| `charts/colors.ts` | CSS-var colours. |

**UI-3 Load, provenance and library (~850 LOC)**

| File | Responsibility |
|---|---|
| `load/LoadDock.tsx` | Estimate, cap, Replace/Add, Load button with disabled reason, over-cap actions. |
| `load/LoadProgress.tsx` | Per-source rows, ETA, rate-limit countdown, `CancelMenu`, Minimize. |
| `load/LoadedPanel.tsx` | Success panel and partial banner. |
| `load/MethodsStrip.tsx` | Collapsed one-liner that expands to a 180 px panel. Copy. |
| `cite/CiteTab.tsx` | Composes the Cite & reproduce tab. |
| `cite/DerivedDatasetCard.tsx` | Derived-dataset CSV, registration link and DOI paste field. |
| `cite/DownloadRequestDialog.tsx` | Focused dialog for the citable download request. |
| `cite/DownloadStatus.tsx` | Polled download status. |
| `cite/ZipDropzone.tsx` | `FileUploadRoot` with the zip-vs-stream diff. |
| `cite/QueryJsonCard.tsx` | Copy, download and save the query JSON. |
| `library/LibraryMenu.tsx` | Popover with Recent, Saved and Examples tabs, plus Import and Export JSON. |
| `library/ExampleCards.tsx` | Example studies for the empty state. |

**UI-4 Phylogeny (~500 LOC)**

| File | Responsibility |
|---|---|
| `phylo/PhyloTab.tsx` | Tab layout. |
| `phylo/NameMatchSummary.tsx` | Progress bar, counts, expandable Synonyms and Unmatched lists with Copy. |
| `phylo/CladeCard.tsx` | Clade (MRCA) card and broken taxa. |
| `phylo/TreeSourceTable.tsx` | `Table.Root size="sm"` with radio selection, sort and Dated only. |
| `phylo/TreeSelectionSummary.tsx` | Kept, absent and pruned counts, Grafen or lengths note, load button, success panel. |

## 4. Store contract for the UI

### Requested additions to `src/sources/types.ts` (coordinator to approve; all optional)

- `QualityFilters.excludeDatasets: string[]` holds GBIF dataset keys and maps to a `not in datasetKey` predicate (GBIF only; the UI says so). `QualityFilters.minRecordsPerSpecies: number` (1 means off) is applied at plan time to the GBIF species list and the OBIS checklist. The cleaner drops OBIS records of excluded species under the new `DropReason` value `'lowCount'`.
- `FilterId` gains `'datasets'`.
- `PreviewSummary.yearsAll?` is the year histogram without the year filter. The brush needs it to show bars outside the selected range.
- `StreamPlan.speciesCounts?: FacetBucket[]` drives the low-count flag, the exact estimate and phylogeny matching before a load.
- `StreamProgress.bytes?`, `retryAt?` (epoch ms, set while backing off on 429) and `truncated?: {name: string; kept: number; total: number}[]`.

### ExplorerStore (`src/store/ExplorerStore.ts`)

```ts
type Tab = 'occurrences' | 'phylogeny' | 'cite';
type Preset = 'recommended' | 'permissive' | 'custom';
type ReqState = 'idle' | 'loading' | 'ready' | 'error' | 'rateLimited';
interface SourceState { enabled: boolean; supports: Supports; gbifOnlyTaxa: string[];
  preview: PreviewSummary | null; state: ReqState; stale: boolean; error?: string; retryAt?: number }
interface Kpis { records: number; recordsUpperBound: boolean; species: number | null;
  datasets: number | null; yearRange: [number, number] | null; bySource: Partial<Record<SourceId, number>> }
interface LedgerRow { id: FilterId | 'minRecords'; label: string; active: boolean;
  impact: number | null; share: number | null /* impact / (total+impact) */; loadedImpact?: number | null }
type BiasId = 'datasetDominance' | 'humanObservation' | 'temporalSkew' | 'countryConcentration' | 'lowCountSpecies';
interface BiasFlag { id: BiasId; triggered: boolean; value: number; threshold: number; text: string;
  action?: { label: string; run(): void } }
interface Estimate { records: number; species: number | null; bytes: number; seconds: number;
  requests: number; exact: boolean /* from plans, else ≈ from preview */; overCap: boolean }
interface SourceProgress extends StreamProgress { source: SourceId; state: 'streaming' | 'done' | 'error' | 'rateLimited' }
interface LoadJob { state: 'planning' | 'streaming' | 'done' | 'cancelled' | 'error'; label: string;
  startedAt: number; etaSeconds: number | null; perSource: SourceProgress[]; funnel: Funnel;
  truncated: { name: string; kept: number; total: number }[]; error?: string }
interface Provenance { query: OccurrenceQuery; retrievedAt: string; mode: 'replace' | 'add'; funnel: Funnel;
  ledger: LedgerRow[]; kpis: Kpis; partial: { planned: number; accepted: number } | null;
  datasetCounts: Partial<Record<SourceId, FacetBucket[]>>; derivedDoi?: string; gbifDownloadKey?: string }
interface GbifDownload { key: string; status: 'PREPARING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'KILLED' | 'CANCELLED';
  doi?: string; totalRecords?: number; size?: number; downloadLink?: string; createdAt: string; checkedAt?: string }
interface ZipImport { state: 'parsing' | 'ready' | 'error'; fileName: string; funnel?: Funnel; error?: string }
interface SavedQuery { id: string; name: string; query: OccurrenceQuery; savedAt: string; kpis?: Kpis }
interface TaxonSuggestion extends TaxonRef { gbifCount?: number; inGbif: boolean; inObis: boolean }
```

| Observable | Type |
|---|---|
| `isOpen` | `boolean` |
| `tab` | `Tab` |
| `minimized` | `boolean` |
| `online` | `boolean` |
| `query` | `OccurrenceQuery` |
| `sources` | `Record<SourceId, SourceState>` |
| `baseline` | `{ kpis: Kpis; total: number; label: string } \| null` |
| `cap` | `number`, default 500,000 |
| `loadMode` | `'replace' \| 'add'` |
| `job` | `LoadJob \| null` |
| `lastLoad` | `Provenance \| null` |
| `downloads` | `GbifDownload[]`, persisted |
| `zipImport` | `ZipImport \| null` |
| `recent`, `saved` | `SavedQuery[]` |
| `examples` | `SavedQuery[]`, static |
| `methodsExpanded` | `boolean` |

| Computed | Type |
|---|---|
| `preset` | `Preset` |
| `kpis` | `Kpis \| null` |
| `previewState` | `'empty' \| 'first' \| 'stale' \| 'ready' \| 'error'` |
| `ledger` | `LedgerRow[]`, impacts summed over sources |
| `ledgerTotal` | `number` |
| `biasFlags` | `BiasFlag[]` |
| `biggestRestriction` | `{ row: LedgerRow; relax(): void; relaxLabel: string } \| null` |
| `mergedYearsAll` | `{ year: number; count: number }[]` |
| `yearShareAfter(y)` | `number` |
| `estimate` | `Estimate \| null` |
| `canLoad` | `Supports` |
| `dirty` | `Set<'taxa' \| 'area' \| 'years' \| 'depth' \| 'quality' \| 'sources'>` |
| `methodsText` | `string` |
| `obisCitation` | `string` |
| `datasetCsv` | `string` |
| `ledgerCsv` | `string` |
| `querySummary` | `string` |

Actions:
- **Workspace:** `open(tab?)`, `close()`, `setTab`, `setMinimized`.
- **Query:** `addTaxon(t: TaxonRef)`, `removeTaxon(name)`, `setArea(a: AreaFilter)`, `setYears(r)`, `setDepth(r)`, `setQuality(patch: Partial<QualityFilters>)`, `toggleFilter(id)`, `applyPreset(p)`, `setSourceEnabled(id, on)`, `excludeDataset(key)`, `excludeBasis(b)`.
- **Preview:** `retrySource(id)`, `suggestTaxa(q, signal): Promise<TaxonSuggestion[]>`, `pinBaseline()`, `clearBaseline()`.
- **Load:** `setCap(n)`, `setLoadMode(m)`, `load()`, `cancel('keep' | 'discard')`.
- **Citation:** `setDerivedDoi(doi)`, `requestDownload({ user, password, email })`, where the password is used once for the request and never stored. `pollDownloads()` runs every 30 s while any download is PREPARING or RUNNING. `importZip(file)`, `applyZip('replace' | 'keepStreamCiteDoi')`.
- **Library:** `saveQuery(name)`, `restore(id)`, `deleteSaved(id)`, `importQueryJson(text): Supports`, `exportQueryJson(): string`, `editAndReload()`.

Behaviour the UI relies on:
- The preview is debounced at 400 ms, and each change aborts the in-flight request.
- The plan is fetched automatically after the preview settles when the total is at most twice the cap.
- `restore` re-previews and never loads.
- `load` pushes to `recent` (10 entries), and `localStorage` access is wrapped in try/catch.

### PhyloStore (`src/store/PhyloStore.ts`)

```ts
type MatchStatus = 'matched' | 'synonym' | 'unmatched' | 'ambiguous';
interface NameMatch { datasetName: string; status: MatchStatus; ottId?: number; ottName?: string }
interface Clade { name: string; rank: string; ottId: number; numTips: number }
interface TreeCandidate { id: string; kind: 'synthetic' | 'study'; title: string; citation: string;
  year: number | null; synthVersion?: string; doi?: string; studyId?: string; treeId?: string;
  branchLengths: 'time' | 'other' | 'none'; timeUnit?: string;
  coverage: { matched: number; total: number } | null; coverageState: 'pending' | 'ready' | 'error' }
interface TreeSelection { kept: number; absentFromTree: string[]; pruned: number; broken: string[] }
```

| Observable | Type |
|---|---|
| `speciesSource` | `'loaded' \| 'query' \| null` |
| `matchProgress` | `{ done: number; total: number } \| null` |
| `matches` | `NameMatch[]` |
| `clade` | `Clade \| null` |
| `candidates` | `TreeCandidate[]` |
| `candidatesState` | `ReqState` |
| `sort` | `'coverage' \| 'year'` |
| `datedOnly` | `boolean` |
| `selectedId` | `string \| null` |
| `selection` | `TreeSelection \| null` |
| `loadState` | `'idle' \| 'loading' \| 'done' \| 'error'` |
| `loadedTree` | `{ candidateId: string; tips: number; citation: string } \| null` |

Computed: `counts` (`{ matched, synonym, unmatched }`), `visibleCandidates` (sorted by coverage, then dated, after the Dated only filter), `citationText` (feeds `methodsText`).

Actions: `matchNames()`, which runs automatically when the tab opens and the species list changed, in TNRS batches of 250. Also `select(id)`, `setSort`, `setDatedOnly`, `copyList(status): string` and `loadSelected()`. `loadSelected` relabels tips to dataset names, prunes them, adds Grafen lengths when there are none, then calls `treeStore.loadString`, `setIncludeTree(true)` and runs Infomap. Exact study coverage is computed by fetching up to 15 candidate trees (concurrency 3) and counting matched tips. Rows show `⟳ checking…` until that finishes.

## 5. Flows

1. **Search, preview, load**
   1. Open the explorer (Data section or the empty map). Focus lands in taxon search.
   2. Type "cats" and pick `Felidae · FAMILY · Animalia › Chordata › Mammalia · 3.1 M · GBIF ✓ OBIS –`. The chip shows "GBIF only".
   3. About 400 ms later the KPIs, map, ledger and flags fill in.
   4. Choose the Neotropic realm. The map refits, and the old numbers dim with "updating".
   5. Brush the years to 1970–2025.
   6. Read the ledger and the two ⚠ flags.
   7. Click **Load 412,380 records** (or press Mod+Enter). The Cleaning section streams in, and the main map fills behind the dialog; Minimize shows it.
   8. When the load is done, the success panel offers [View bioregions] and [Cite this data].
2. **What-if:** Pin a baseline, then tighten uncertainty to 1 km. The delta chips read `Species 214 → 198 (−7.5 %)` and `Records −41 %`. The "Compare: specimens only" action on the human-observation flag pins the baseline automatically and then applies the filter.
3. **Merge OBIS:** Both sources are on by default. Taxa without an AphiaID are "GBIF only" chips, and the OBIS toggle is never disabled because of them. The KPIs mark the merged total `≤` with the caption "OBIS partly republishes into GBIF; overlap is removed while loading". With Add mode, the cleaner is seeded with the keys already loaded.
4. **Iterate after a load:** Edited sections show a dot. Ledger rows show a ghost tick at the loaded value and a Δ. The dock reads "Query changed since load — Reload (replace)". Saved and Recent queries are in Library.
5. **Cite with a DOI**
   1. Cite & reproduce → **Request citable DOI…** opens a dialog with username, password (`autocomplete="current-password"`) and notification email.
   2. Status is polled every 30 s and persisted. The DOI goes into the methods text as soon as the download SUCCEEDS.
   3. **Open zip ↗** opens the zip; the user drops it back in.
   4. The diff appears with two choices: Replace with official download, or Keep streamed, cite DOI.
6. **Phylogeny**
   1. Opening the tab matches names automatically. With nothing loaded, the button reads "Match the 1,393 species in the current query".
   2. Review synonyms and unmatched names, and read the MRCA.
   3. Pick a row, read the kept, absent and pruned counts, and click **Load tree & re-run bioregions**.
   4. The explorer stays open with a success panel and [View bioregions]. The tree citation is added to the methods text.

## 6. States

| State | Presentation |
|---|---|
| Empty | Example cards in the preview column, over a faint global density map. The dock reads "Add a taxon or narrow the area to a region". |
| First preview | Skeleton KPIs, ledger rows and bars. |
| Later previews | Old values at 50 % opacity with `⟳ updating`. The in-flight request is aborted. The map veil appears only when a map-relevant filter changed (taxon, area, years, basis). |
| Source error | The chip turns red. An inline line above the KPIs reads "OBIS preview failed (HTTP 502) [Retry]". The KPIs are labelled "GBIF only". |
| Rate-limited | Amber countdown "GBIF is busy, retrying in 8 s (attempt 2/5)". Never shown as a failure. |
| Offline | Header banner "You're offline. Previews paused; loaded data is kept." Load is disabled with that reason. |
| Zero results | "No records match. Biggest restriction: Uncertainty ≤ 1 km (removes 12,400 on its own)" with [Relax to 10 km]. If taxa and area alone return nothing: "No records for these taxa here" with [Use World]. |
| Over cap | The dock turns amber: "1.8 M records exceed the 500 k cap (≈270 MB)". Actions: [Raise cap to 2 M] [Narrow years] [One per ~1 km cell] [Request GBIF download instead]. The last one opens Cite. |
| Truncated species | Ledger row "− Truncated: 3 species capped at 6,000 records per cell [list]". |
| Partial kept | Amber banner, plus a sentence in the methods text. |
| Esc while streaming | Opens the cancel menu. ✕ while streaming minimizes, and the load continues; progress is shown in the Data section. |
| Phylogeny | No matches: the unmatched list is shown with a link to the Open Tree search. Broken taxa: "5 taxa placed at MRCA". Coverage pending: `⟳ checking…`. |

## 7. Microcopy

| Element | Text |
|---|---|
| Entry button | **Explore GBIF & OBIS…** |
| Taxon placeholder | Scientific or common name, e.g. Felidae, hummingbirds |
| Preset help | Recommended for bioregionalisation: wild, present, species-level records with coordinates precise to 10 km, no geospatial issues, no fossil or captive specimens; one record per species and site. |
| Uncertainty InfoTip | Records less precise than this can fall in the wrong grid cell. 10 km suits cells of 1° or larger. |
| Keep missing | Keep records with no uncertainty reported (≈58 % of these records) |
| Dedupe | Keep all · One per species per site (~11 m) · One per species per ~1 km cell |
| Ledger footnote | Each bar is what that filter alone removes. Filters overlap, so the bars don't add up. |
| Map note | Map shows taxon, area, years and basis of record only; quality filters apply to the counts. |
| Dataset dominance (>30 %) | 64 % of records come from one dataset (eBird). Its sampling design can shape your regions. [Exclude dataset] |
| Human observations (>60 %) | 74 % are human observations, often citizen science: dense near people and roads. [Compare: specimens only] |
| Temporal skew (>60 % in last 15 y) | 72 % of records are from 2011 or later; historical ranges may be missing. [Narrow years] |
| Country concentration (>50 %, area not one country) | 38 % of records are from Brazil; effort differs between countries. [Show countries] |
| Low-count species (>20 % with <5 rec) | 48 species (22 %) have fewer than 5 records and can form spurious regions. [Set minimum 5 records] |
| Load button | Load 412,380 records · Add 12,300 records to current data |
| Disabled reasons | Add a taxon or narrow the area to a region · You're offline · Over the cap |
| Locked query | Query locked while loading — cancel to edit |
| Cancel menu | Keep 230,446 records and run Infomap · Discard and restore previous data |
| Partial (methods) | Loading was stopped early; the dataset holds 230,446 of ~412,380 planned records (56 %). |
| Login note | Your GBIF password is sent only to api.gbif.org and is never stored. |
| Grafen note | Topology only. Branch lengths use Grafen's method (ρ = 1): ages are relative (root = 1), not millions of years. |
| Undated lengths | Branch lengths are in substitutions per site and are used as relative time. |
| Done | Bioregions are updating. [View bioregions] [Cite this data] |

## 8. Accessibility

- **Dialog and tabs:** The Chakra Dialog traps focus and returns it to the opener. Tabs move with the arrow keys. Every control has a `Field` label, and the impact count is part of each ledger checkbox label: "Uncertainty ≤ 10 km, removes 371,002 records (31 %)".
- **Year brush:** Each handle is `role="slider"` with `aria-valuetext="from 1970"`. Arrow keys move one year and Shift+Arrow moves ten. Paired number inputs are labelled "From year" and "To year". The rectangle draw tool has W/S/E/N number inputs.
- **Charts and the map:** Every chart has an SVG `<title>` summary and a "View as table" toggle, and the ledger also has a visually hidden mirror table. The map legend gives numeric labels.
- **Live regions:** The KPIs are a polite live region announced once after each debounce settles. Load progress uses `role="progressbar"` with text values, announced at most every 5 s.
- **Shortcuts:** `/` focuses taxon search and `?` lists the shortcuts; both fire only when focus is not in a text field. `Mod+Enter` loads. `Esc` closes the innermost popover, then opens the cancel menu while streaming, otherwise closes the dialog. There are no other single-key shortcuts.
- **Colour:** No state relies on colour alone: flags use an icon plus a word, impacts use a "−" sign, sources use text badges. Removal bars use `orange.solid`, accepted bars `brand.solid`, and hollow bars `fg.muted` outlines; all are checked for AA contrast in light and dark mode. The map base style switches to `gbif-dark` in dark mode (to be verified at build time, with `gbif-middle` as the fallback).

## 9. Out of scope

- Free polygon drawing and shapefile upload (WKT can go through the query JSON).
- A record-level table.
- Pan and free zoom on the preview map.
- Dataset exclusion for OBIS.
- Manual re-matching of unmatched names.
- Tree editing, dating, or grafting unmatched tips.
- Storing credentials or saving queries on a server.
- Fetching the GBIF zip automatically (no CORS).
- More sources than GBIF and OBIS.
- Multiple baselines.
- Layouts narrower than 1024 px.
