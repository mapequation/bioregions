# Data explorer: GBIF + OBIS occurrences and Open Tree phylogenies

Status: design, 2026-10-30. UI layout and interaction spec: `2026-10-30-data-explorer-ui.md`.

## Goal

A biogeographer can search, filter and preview occurrence data from GBIF and OBIS,
stream a biologically meaningful, deduplicated dataset into the app, cite it with a
DOI, and find and load a matching phylogeny, without leaving the app.

## Decisions (user, 2026-10-30)

- **Access:** stream records from the GBIF GraphQL API, plus an in-app "request a
  citable GBIF download" flow (GBIF login sent only to api.gbif.org). GBIF serves
  download zips without CORS, so the user downloads the zip and drops it back in;
  the app parses it and applies the same cleaning.
- **Sources:** GBIF + OBIS, merged, tagged by source, deduplicated across sources.
- **Delivery:** issue + PR on `mapequation/bioregions`.

## Verified API facts (probed 2026-10-30, all CORS `*` unless noted)

GBIF GraphQL `POST https://graphql.gbif.org/graphql`, body `{query, variables}`:
- `occurrenceSearch(predicate: Predicate)` takes the GBIF download predicate JSON:
  `and/or/not/equals/in/within/isNotNull/isNull/like/range/geoDistance/...`,
  e.g. `{"type":"range","key":"year","value":{"gte":"1970","lte":"2025"}}`,
  `{"type":"within","key":"geometry","value":"POLYGON((...))"}`,
  `{"type":"not","predicate":{...}}`, `{"type":"isNotNull","key":"..."}`.
  Predicate keys are camelCase (`taxonKey`, `basisOfRecord`, `hasCoordinate`,
  `hasGeospatialIssue`, `coordinateUncertaintyInMeters`, `establishmentMeans`,
  `occurrenceStatus`, `country`, `year`, `depth`, `speciesKey`).
- One call returns the whole preview in ~0.5 s:
  `documents(size:0){total}`, `cardinality{speciesKey datasetKey}`,
  `stats{year{min max} coordinateUncertaintyInMeters{min max avg}}`,
  `histogram{year(interval:1){buckets{key count}}}`,
  `facet{basisOfRecord(size:n){key count} issue(...) countryCode(...)
  speciesKey(size:n){key count label} datasetKey(size:n){key count label}}`.
  Facet `label` is the canonical species name / dataset title.
- `facet{speciesKey(size:12000, from:0){key count label}}` enumerates species with
  counts (13k Aves species in one 735 kB response).
- `documents(size, from)`: `from + size <= 6000` (hard cap). Fields per record
  `decimalLatitude decimalLongitude year datasetKey basisOfRecord
  coordinateUncertaintyInMeters` cost ~150 B. Top-level `species`/`speciesKey`/
  `taxonRank` are **null** in the current backend; taxonomy lives in
  `classification{usage{key name rank} acceptedUsage{...} classification{key name rank}}`
  (heavy). Hence the stream partitions **by species** (names from the facet label).
- Several aliased `occurrenceSearch` fields per request work
  (`a: occurrenceSearch(...) {...} b: occurrenceSearch(...) {...}`).
- Aliased count-only searches give per-filter impact in one request.

GBIF REST `https://api.gbif.org/v1`:
- `GET /species/suggest?q=` (taxon autocomplete; `key, canonicalName, rank, ...`),
  `GET /species/{key}`, `GET /species/{key}/vernacularNames`.
- `POST /occurrence/download/request` with Basic auth: CORS preflight allows
  `authorization, content-type`. Body:
  `{"creator": user, "notificationAddresses": [...], "sendNotification": true,
  "format": "SIMPLE_CSV", "predicate": <same predicate>}` returns the download key
  as text. `GET /occurrence/download/{key}` returns status, `doi`, `totalRecords`,
  `size`, `downloadLink` (CORS ok).
- The zip itself (`/occurrence/download/request/{key}.zip`, 302 to
  occurrence-download.gbif.org) has **no CORS**: the browser must navigate to it.
- Density tiles (for a preview map): `https://api.gbif.org/v2/map/occurrence/density/{z}/{x}/{y}@1x.png?srs=EPSG:4326&style=classic.point&taxonKey=..&country=..&basisOfRecord=..&year=1970,2025`
  (subset of filters only). Base map: `https://tile.gbif.org/4326/omt/{z}/{x}/{y}@1x.png?style=gbif-light`.
  EPSG:4326 zoom 0 is two 512 px tiles (x = 0 west, 1 east).
- REST search (`/occurrence/search`) is ~6 kB per record and capped at offset
  100 000; do not use it for bulk streaming.

OBIS `https://api.obis.org/v3`:
- `GET /occurrence?taxonid|scientificname&geometry=WKT&startdate&enddate&startdepth&enddepth&absence&size&after&fields=...`
  (`fields=id,species,decimalLatitude,decimalLongitude,date_year,dataset_id,basisOfRecord,coordinateUncertaintyInMeters`; cursor paging with `after=<last id>`).
- `GET /statistics?...` → `{records, species, datasets, yearrange}`;
  `GET /statistics/years?...` → `[{year, records}]`;
  `GET /checklist?...&size=n` → species with `records`;
  `GET /occurrence/grid/{precision}?...` → GeoJSON grid with `n` per cell;
  `GET /taxon/complete/verbose/{q}` → taxon autocomplete (`id` = AphiaID).

Open Tree of Life `https://api.opentreeoflife.org/v3` (POST JSON):
- `tnrs/match_names {names, context_name?, do_approximate_matching?}` → matches with
  `ott_id`, `unique_name`, synonyms.
- `tree_of_life/induced_subtree {ott_ids, label_format:"name"|"id"|"name_and_id"}` →
  `{newick, broken}` (topology only, no branch lengths; internal labels like
  `mrcaott123ott456`; `broken` lists taxa replaced by MRCA nodes).
- `tree_of_life/mrca {ott_ids}` → `nearest_taxon {name, ott_id, rank}`, `mrca.num_tips`.
- `studies/find_trees {property:"ot:ottId"|"ot:ottTaxonName", value, verbose:true}` →
  studies with `ot:studyPublicationReference`, `ot:studyYear`, `ot:studyPublication`
  (DOI URL), trees with `ot:treeId`, `ot:branchLengthMode` (`ot:time` = dated),
  `ot:branchLengthTimeUnit`.
- `GET study/{studyId}/tree/{treeId}.tre?tip_label=ot:ottTaxonName` → Newick with
  quoted names and branch lengths (CORS echoes the origin).

## Module layout and ownership

```
src/sources/types.ts          shared contract (written first; do not change shape without the coordinator)
src/sources/query.ts          defaults, presets, summary text, (de)serialization, methods-paragraph text
src/sources/regions.ts        preset areas (world, continents, biogeographic realms), bbox/WKT helpers
src/sources/http.ts           fetchJson with timeout, retry/backoff on 429/5xx, AbortSignal, concurrency limiter
src/sources/clean.ts          RecordCleaner: validation, cross-source dedupe, funnel
src/sources/gbif/*.ts         predicate, graphql, preview, stream, taxa, tiles, download, zip
src/sources/obis/*.ts         params, preview, stream, taxa
src/phylo/otol.ts             TNRS (batched), induced subtree, mrca, find_trees, study tree
src/phylo/newickTools.ts      parse-free string-level helpers + tree ops: relabel, prune, grafen, write
src/store/ExplorerStore.ts    query, previews, plan, streaming job, provenance, downloads, saved queries
src/store/PhyloStore.ts       name matching, synthetic tree, study search, coverage, load into TreeStore
src/components/Explorer/*     full-screen workspace (see UI spec)
```

## Integration with existing stores

- `SpeciesStore.loadRecords(batches: AsyncIterable<OccurrenceRecord[]>, {name, clear, signal})`
  mirrors `load()`: optional `clearData()`, set `name`, `preLoad()`,
  `mapStore.setRenderType('records')`, per batch `addFeature(createPointFeature(...))`
  and one `MultiPoint` pushed to `multiPointCollection` + `mapStore.renderMultiPoint`,
  then `loadEnd()` and `postLoad()` (which runs Infomap). On abort it stops reading
  and still finishes with the records received ("keep partial"); the explorer can
  call `rootStore.clearData()` instead to discard.
- Fix on the way: `clearData()` must reset `numPoints`, `numPolygons` and the debounced
  counters (they leak across loads today), and `cancelLoad()` must actually stop the
  worker (the `dataWorker` field is never assigned).
- Records keep only `properties.name` downstream; extra properties are not needed.
- Trees: `treeStore.loadString(newick)` then, if occurrences are loaded,
  `infomapStore.setIncludeTree(true)`, `await infomapStore.run()`,
  `mapStore.setRenderType('bioregions'); mapStore.render()`. Tip labels must equal
  the dataset's species names after `normalizeSpeciesName` (underscores → spaces).
  The phylogeny store relabels OTT names back to the dataset names it matched, so
  synonyms still join.
- Topology-only trees (synthesis) get branch lengths with Grafen's method
  (node height = (tips − 1)/(N − 1), rho = 1) by default, so `time` in the tree view
  and the state network stays meaningful; the UI states this explicitly.

## Streaming algorithm (GBIF)

1. Plan: `facet{speciesKey(size:10000, from:k)}` pages (+ total). If the sum exceeds
   `maxRecords`, the plan reports it and the UI blocks or asks to raise the cap.
2. Species with count ≤ 6000 are packed into requests of ≤ 6000 records and ≤ 40
   aliases; each alias is `and(predicate, speciesKey = K)`.
3. Species with count > 6000 are split spatially: aliased child counts of the four
   quadrants of the current cell (`within` WKT), recurse until ≤ 6000 or the cell is
   smaller than 0.01°, then split by year halves; a leaf still > 6000 is truncated to
   6000 and reported in the funnel.
4. Concurrency 4, retry with exponential backoff on 429/5xx, abort via `signal`.
5. Yield one `RecordBatch` per response; the cleaner validates, normalizes names and
   dedupes across sources before records reach `SpeciesStore`.

## Provenance and citation

The explorer keeps, per load: source, query summary, GBIF predicate / OBIS params,
retrieval time, counts (fetched, accepted, by drop reason) and per-dataset record
counts. It renders:
- GBIF: a derived-dataset CSV (`datasetKey,count`) with a link to
  `https://www.gbif.org/derived-dataset/register`, or the DOI of an in-app download.
- OBIS: the OBIS citation and dataset ids.
- A copyable methods paragraph describing taxa, area, years, quality filters, cleaning,
  record and species counts, and citations; plus the phylogeny's citation.
