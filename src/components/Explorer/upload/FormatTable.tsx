import { Code, Table, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The formats the Upload tab reads (spec §5.2). Every line states what the parsers do:
 * points: SpeciesStore.loadOccurrenceFile + utils/loader.ts (Papa Parse, header row,
 * auto delimiter) + data/columns.ts; shapefiles: workers/DataWorker.ts; GBIF zips:
 * sources/gbif/zip.ts + data/zipLoad.ts; trees: utils/tree/treeUtilsJS.js and utils/names.ts.
 */
const ROWS: { data: string; files: ReactNode; requirements: ReactNode }[] = [
  {
    data: 'Point occurrences',
    files: (
      <>
        <Code size="sm">.csv</Code>, <Code size="sm">.tsv</Code>
      </>
    ),
    requirements: (
      <>
        A header row and one row per record. You pick the species, latitude and longitude columns next; they are
        guessed from column names containing species/binomial/name, lat, and lng/long. Decimal degrees (WGS84). The
        delimiter is detected automatically. Rows with an empty or &ldquo;NA&rdquo; species are skipped.
      </>
    ),
  },
  {
    data: 'Range polygons (or points)',
    files: (
      <>
        Shapefile: a <Code size="sm">.zip</Code> with one <Code size="sm">.shp</Code> and its{' '}
        <Code size="sm">.dbf</Code>, or the loose <Code size="sm">.shp</Code> + <Code size="sm">.dbf</Code>
      </>
    ),
    requirements: (
      <>
        Polygon/MultiPolygon or Point/MultiPoint. Coordinates must be longitude/latitude (the{' '}
        <Code size="sm">.prj</Code> is not read). The species name comes from the first of these attribute fields
        that exists, spelled exactly in lowercase: <Code size="sm">binomial</Code>, <Code size="sm">species</Code>,{' '}
        <Code size="sm">name</Code>, <Code size="sm">id</Code>.
      </>
    ),
  },
  {
    data: 'GBIF download',
    files: (
      <>
        A <Code size="sm">.zip</Code> from gbif.org: Simple CSV or Darwin Core Archive
      </>
    ),
    requirements: (
      <>
        Recognised by <Code size="sm">occurrence.txt</Code> or <Code size="sm">&lt;download key&gt;.csv</Code> at the
        zip&rsquo;s root. Needs the columns <Code size="sm">species</Code>, <Code size="sm">decimalLatitude</Code> and{' '}
        <Code size="sm">decimalLongitude</Code>. ABSENT rows are skipped. The download key and DOI are kept for
        citation. Loaded as downloaded: no de-duplication or area filter.
      </>
    ),
  },
  {
    data: 'Phylogenetic tree',
    files: (
      <>
        <Code size="sm">.nwk</Code>, <Code size="sm">.tre</Code>, <Code size="sm">.tree</Code> (Newick)
      </>
    ),
    requirements: (
      <>
        Tip labels are matched to species names after underscores become spaces and the first letter is
        capitalised. In the occurrence file, dots also become spaces, so write tips with underscores, not dots.
      </>
    ),
  },
];

/** The always-visible table of supported upload formats. */
export default function FormatTable() {
  return (
    <Table.Root size="sm" variant="line" data-testid="upload-format-table">
      <Table.Caption captionSide="top" textAlign="start" mt={0} mb={2}>
        <Text as="span" fontWeight="medium" color="fg">
          Supported formats
        </Text>
      </Table.Caption>
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader scope="col">Data</Table.ColumnHeader>
          <Table.ColumnHeader scope="col">Files</Table.ColumnHeader>
          <Table.ColumnHeader scope="col">Requirements</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {ROWS.map((row) => (
          <Table.Row key={row.data} verticalAlign="top">
            <Table.Cell as="th" scope="row" fontWeight="medium" whiteSpace="nowrap">
              {row.data}
            </Table.Cell>
            <Table.Cell minW="10rem">{row.files}</Table.Cell>
            <Table.Cell color="fg.muted">{row.requirements}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}
