import { Box, Button, Flex, Grid, HStack, Input, Link, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useId, useState } from 'react';
import { LuCircleCheck, LuExternalLink, LuFileDown } from 'react-icons/lu';
import { useStore } from '../../../store';
import { fmtInt } from '../format';
import { downloadText, normalizeDoi } from './citeHelpers';
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';

export const DERIVED_DATASET_REGISTER_URL = 'https://www.gbif.org/derived-dataset/register';

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Grid
      as="li"
      listStyleType="none"
      templateColumns={{ base: '1fr', md: '128px minmax(0, 1fr)' }}
      columnGap={4}
      rowGap={1}
      alignItems="baseline"
    >
      <Text fontSize="xs" fontWeight="medium" color="fg.muted" pt={{ md: '7px' }} alignSelf="start">
        {title}
      </Text>
      <Box minW={0}>{children}</Box>
    </Grid>
  );
}

/** Option ①: register the streamed records as a GBIF derived dataset and cite its DOI. */
export default observer(function DerivedDatasetCard() {
  const { explorerStore, dataStore } = useStore();
  const last = explorerStore.loaded;
  const gbifDatasets = last?.datasetCounts.gbif ?? [];
  const gbifRecords = gbifDatasets.reduce((s, d) => s + d.count, 0);
  const csv =
    explorerStore.datasetCsv ||
    (gbifDatasets.length
      ? ['datasetKey,count', ...[...gbifDatasets].sort((a, b) => b.count - a.count).map((d) => `${d.key},${d.count}`)].join(
          '\n',
        )
      : '');
  const savedDoi = last?.derivedDoi ?? '';
  const [doi, setDoi] = useState(savedDoi);
  const [touched, setTouched] = useState(false);
  useEffect(() => setDoi(savedDoi), [savedDoi]);
  const inputId = useId();
  const helpId = useId();
  const normalized = normalizeDoi(doi);
  const invalid = touched && doi.trim() !== '' && !normalized;
  const isSaved = !!savedDoi && normalized === normalizeDoi(savedDoi);
  const noGbif = !csv;

  return (
    <Stack as="ol" gap={3.5} m={0} p={0}>
      <Step title="1 · Download counts">
        <Flex gap={3} align="center" wrap="wrap">
          <Button
            {...secondaryButtonProps}
            data-testid="derived-csv"
            disabled={noGbif}
            onClick={() => downloadText('gbif-derived-dataset.csv', csv, 'text/csv')}
          >
            <LuFileDown />
            Download datasetKey,count CSV
          </Button>
          <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums">
            {noGbif
              ? 'No GBIF records in this dataset.'
              : `${fmtInt(gbifRecords)} records from ${fmtInt(gbifDatasets.length)} GBIF ${gbifDatasets.length === 1 ? 'dataset' : 'datasets'}`}
          </Text>
        </Flex>
      </Step>
      <Step title="2 · Register">
        <Flex gap={3} align="center" wrap="wrap">
          <Button {...secondaryButtonProps} asChild>
            <a href={DERIVED_DATASET_REGISTER_URL} target="_blank" rel="noopener noreferrer">
              Open GBIF registration
              <LuExternalLink />
            </a>
          </Button>
          <Text fontSize="xs" color="fg.muted">
            Upload the CSV, describe the filters (the methods paragraph works), and GBIF mints a DOI.
          </Text>
        </Flex>
      </Step>
      <Step title="3 · Paste the DOI">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            const source = dataStore.occurrence;
            if (normalized && source) dataStore.patchOccurrence(source.id, { derivedDoi: normalized });
          }}
        >
          <HStack gap={2} align="center" maxW="480px">
            <Input
              id={inputId}
              aria-label="Derived dataset DOI"
              size="sm"
              fontFamily="mono"
              placeholder="10.15468/dd-…"
              value={doi}
              aria-invalid={invalid || undefined}
              aria-describedby={helpId}
              onChange={(e) => setDoi(e.target.value)}
              onBlur={() => setTouched(true)}
              disabled={noGbif}
            />
            <Button {...primaryButtonProps} type="submit" disabled={noGbif || !normalized || isSaved}>
              Save
            </Button>
          </HStack>
          <Text
            id={helpId}
            fontSize="xs"
            mt={1.5}
            minH="1lh"
            color={invalid ? 'fg.error' : isSaved ? 'fg.success' : 'fg.muted'}
            role={invalid ? 'alert' : undefined}
          >
            {invalid ? (
              'That doesn’t look like a DOI. It starts with 10., e.g. 10.15468/dd-ab12cd.'
            ) : isSaved ? (
              <HStack as="span" gap={1} display="inline-flex">
                <LuCircleCheck aria-hidden />
                Saved. The methods paragraph now cites{' '}
                <Link href={`https://doi.org/${normalizeDoi(savedDoi)}`} target="_blank" rel="noopener noreferrer">
                  doi:{normalizeDoi(savedDoi)}
                </Link>
              </HStack>
            ) : (
              'The DOI goes into the methods paragraph and the references.'
            )}
          </Text>
        </form>
      </Step>
    </Stack>
  );
});
