# `query.json` and the shared cleaning cases

Files the app exports so a scripted pipeline (for example the Python package
`bioregions-py`) can reproduce a data-explorer study.

## `query.json`

**Cite & reproduce ▸ Query ▸ Download query.json** (and **Library ▸ Download
query.json**) write one JSON object. Built by `buildQueryExport` in
`src/store/explorer/queryExport.ts`.

The query fields (`OccurrenceQuery` in `src/sources/types.ts`) stay at the top level,
so the file imports back into the app unchanged (Library ▸ Import, which ignores the
extra keys). Three keys are added:

| Key | Shape | Present |
| --- | --- | --- |
| `taxa`, `area`, `years`, `depth`, `quality`, `sources` | the query, as before | always |
| `requests` | `{ gbif?: <predicate>, obis?: { [param]: string } }` | always (may be `{}`) |
| `gbifDownload` | `{ key?: string, doi?: string }` | when a GBIF download is known |
| `app` | `{ name: "infomap-bioregions", version: "<package.json version>" }` | always |

- `requests.gbif` is the predicate for GBIF `POST /v1/occurrence/download/request`
  (`gbifDownloadPredicate`). The occurrence API search the app streams uses the same
  filters.
- `requests.obis` holds the query parameters for OBIS `GET /v3/occurrence` as a flat
  object of strings, without paging (`size`, `after`) and without `fields`.
- For a loaded dataset (the Cite tab after a load, or any export whose query equals the
  loaded one) the requests are exactly what the load sent (`LoadProvenance.requests`).
  Otherwise they are computed from the query. A source is left out when it is off, does
  not support the query (country areas on OBIS), or cannot be computed yet: OBIS needs an
  AphiaID (`obisId`) for every taxon, and taxa without one are only resolved through
  WoRMS when a load is planned.
- The requests are the server-side part of the query. For OBIS, basis of record and
  coordinate uncertainty are filtered in the browser (`obisClientFilter` in
  `src/sources/obis/records.ts`); some quality settings have no OBIS equivalent (see
  `obisCaveats`). Then every record goes through the cleaner below.
- `gbifDownload` is the download that cites the load: the one whose zip was dropped in,
  else the newest succeeded download for the same query.

Example (`src/store/explorer/query.example.json`, kept in sync by
`src/store/explorer/queryExport.test.ts`; regenerate with
`QUERY_FIXTURE=write pnpm exec vitest run src/store/explorer/queryExport.test.ts`):

```json
{
  "taxa": [
    {
      "name": "Delphinidae",
      "rank": "FAMILY",
      "gbifKey": 5314,
      "obisId": 136980
    }
  ],
  "area": {
    "kind": "bbox",
    "bbox": [
      -80,
      20,
      0,
      66
    ],
    "label": "North Atlantic"
  },
  "years": [
    1990,
    2024
  ],
  "depth": [
    null,
    null
  ],
  "quality": {
    "basisOfRecord": [
      "PRESERVED_SPECIMEN",
      "HUMAN_OBSERVATION",
      "MACHINE_OBSERVATION",
      "OCCURRENCE",
      "MATERIAL_SAMPLE",
      "MATERIAL_CITATION",
      "OBSERVATION"
    ],
    "maxUncertaintyMeters": 10000,
    "keepMissingUncertainty": true,
    "excludeGeospatialIssues": true,
    "excludeIntroduced": true,
    "presentOnly": true,
    "dedupe": "exact"
  },
  "sources": {
    "gbif": true,
    "obis": true
  },
  "requests": {
    "gbif": {
      "type": "and",
      "predicates": [
        {
          "type": "equals",
          "key": "TAXON_KEY",
          "value": "5314"
        },
        {
          "type": "equals",
          "key": "HAS_COORDINATE",
          "value": "true"
        },
        {
          "type": "within",
          "geometry": "POLYGON((-80 20,0 20,0 66,-80 66,-80 20))"
        },
        {
          "type": "and",
          "predicates": [
            {
              "type": "greaterThanOrEquals",
              "key": "YEAR",
              "value": "1990"
            },
            {
              "type": "lessThanOrEquals",
              "key": "YEAR",
              "value": "2024"
            }
          ]
        },
        {
          "type": "in",
          "key": "BASIS_OF_RECORD",
          "values": [
            "PRESERVED_SPECIMEN",
            "HUMAN_OBSERVATION",
            "MACHINE_OBSERVATION",
            "OCCURRENCE",
            "MATERIAL_SAMPLE",
            "MATERIAL_CITATION",
            "OBSERVATION"
          ]
        },
        {
          "type": "or",
          "predicates": [
            {
              "type": "isNull",
              "parameter": "COORDINATE_UNCERTAINTY_IN_METERS"
            },
            {
              "type": "lessThanOrEquals",
              "key": "COORDINATE_UNCERTAINTY_IN_METERS",
              "value": "10000"
            }
          ]
        },
        {
          "type": "equals",
          "key": "HAS_GEOSPATIAL_ISSUE",
          "value": "false"
        },
        {
          "type": "or",
          "predicates": [
            {
              "type": "isNull",
              "parameter": "ESTABLISHMENT_MEANS"
            },
            {
              "type": "not",
              "predicate": {
                "type": "in",
                "key": "ESTABLISHMENT_MEANS",
                "values": [
                  "introduced",
                  "introducedAssistedColonisation",
                  "vagrant"
                ]
              }
            }
          ]
        },
        {
          "type": "or",
          "predicates": [
            {
              "type": "isNull",
              "parameter": "DEGREE_OF_ESTABLISHMENT"
            },
            {
              "type": "not",
              "predicate": {
                "type": "in",
                "key": "DEGREE_OF_ESTABLISHMENT",
                "values": [
                  "captive",
                  "cultivated",
                  "released",
                  "failing",
                  "casual",
                  "reproducing",
                  "established",
                  "colonising",
                  "invasive",
                  "widespreadInvasive",
                  "managed"
                ]
              }
            }
          ]
        },
        {
          "type": "equals",
          "key": "OCCURRENCE_STATUS",
          "value": "PRESENT"
        }
      ]
    },
    "obis": {
      "taxonid": "136980",
      "geometry": "POLYGON((-80 20,0 20,0 66,-80 66,-80 20))",
      "startdate": "1990-01-01",
      "enddate": "2024-12-31",
      "absence": "false",
      "exclude": "ON_LAND,DEPTH_EXCEEDS_BATH"
    }
  },
  "app": {
    "name": "infomap-bioregions",
    "version": "2.0.0-alpha.22"
  },
  "gbifDownload": {
    "key": "0012345-240000000000000",
    "doi": "10.15468/dl.abcd12"
  }
}
```

## Tree (Newick)

**Export ▸ Tree (Newick)** writes the loaded tree (uploaded, example or Open Tree) as
`<name>_tree.nwk`: tip labels are the dataset species names (`normalizeSpeciesName`,
the names the app matches against the occurrences), single-quoted when they contain
spaces or Newick punctuation; branch lengths, internal labels and support values are
kept as loaded (`speciesNewick` in `src/phylo/newickTools.ts`).

## Cleaning cases

`src/sources/clean-cases.json` holds test cases for the record cleaner (`RecordCleaner`
in `src/sources/clean.ts`), meant to be copied into other implementations.
`src/sources/clean-cases.test.ts` runs every case through the app's cleaner, so the
file stays true to the app.

```jsonc
{
  "$comment": "...",
  "cases": [
    {
      "id": "dedupe-exact",                    // unique, stable
      "description": "...",                    // the rule the case pins down
      "area": { "kind": "world" },             // query.area: only "bbox" is checked
      "quality": { "dedupe": "exact" },        // query.quality fields the cleaner reads
      "lowCount": { "obis": ["Abra alba"] },   // optional, see below
      "records": [                             // in arrival order
        { "name": "Abra alba", "lon": 10.12344, "lat": 50, "source": "gbif" }
      ],
      "expected": {
        "accepted": [                          // in order, with canonical names
          { "name": "Abra alba", "lon": 10.12344, "lat": 50, "source": "gbif" }
        ],
        "funnel": {
          "received": 1, "accepted": 1,
          "dropped": { "noSpecies": 0, "invalidCoordinates": 0, "zeroCoordinates": 0,
                       "outsideArea": 0, "duplicate": 0, "crossSource": 0, "lowCount": 0 },
          "bySource": { "gbif": { "received": 1, "accepted": 1 } }
        }
      }
    }
  ]
}
```

Run one fresh cleaner per case over `records` in order. `lon`/`lat` `null` means a
missing coordinate. `source` is `gbif`, `obis` or `file`. Each record is checked in this
order and stops at the first rule it fails:

1. `noSpecies`: the name does not reduce to a Latin binomial `Genus epithet`
   (`toSpeciesName`: authorship, subgenus and infraspecific parts are stripped; genus-only
   names, `sp.`/`cf.`/`aff.` and other placeholders, `?`, and hybrid formulas fail).
2. `lowCount`: the canonical name is listed for the record's source in `lowCount`. The
   app fills this list when it plans an OBIS load (species with fewer than
   `quality.minRecordsPerSpecies` records); the cleaner does not count records itself.
3. `invalidCoordinates`: missing, not finite, `|lat| > 90` or `|lon| > 180`.
4. `zeroCoordinates`: exactly `(0, 0)`.
5. `outsideArea`: only for a bbox area `[west, south, east, north]`, edges inclusive;
   `west > east` crosses the antimeridian (inside when `lon >= west or lon <= east`).
6. Dedupe by `quality.dedupe`: `none` keeps everything; `exact` keys on
   `(name, round(lon * 1e4), round(lat * 1e4))`; `cell` keys on
   `(name, floor(lon * 100), floor(lat * 100))`. The first record with a key is kept; a
   later one is `duplicate` when it comes from the first one's source, else `crossSource`.
   `round` is JavaScript's `Math.round` (halves round up, towards +∞), not Python's
   round-half-to-even.

Accepted records carry the canonical name. Batching does not matter as long as each
batch holds records of one source (as the app's streams deliver them).
