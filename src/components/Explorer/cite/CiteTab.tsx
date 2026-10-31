import { Alert, Badge, Box, Button, Circle, Flex, Heading, HStack, Icon, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useState } from 'react';
import type { IconType } from 'react-icons';
import { LuArrowRight, LuBookMarked, LuFileArchive, LuFileJson, LuListChecks, LuPencil, LuQuote, LuSend } from 'react-icons/lu';
import {
  isQueryRunnable,
  methodsParagraph,
  queryTitle,
  supportsGbif,
} from '@/sources';
import { useStore } from '../../../store';
import type { Provenance } from '../../../store/explorer/types';
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';
import { fmtInt } from '../format';
import { partialExplanation } from '../load/partialText';
import { partialSummary } from '../preview/cleaningSteps';
import DecisionLedger from '../preview/DecisionLedger';
import { contributingSources, gbifReference, obisCitationHead, retrievedLabel } from './citeHelpers';
import DerivedDatasetCard from './DerivedDatasetCard';
import DownloadRequestDialog from './DownloadRequestDialog';
import DownloadStatus from './DownloadStatus';
import QueryJsonCard, { CopyButton } from './QueryJsonCard';
import ZipDropzone from './ZipDropzone';

// --- Layout pieces -----------------------------------------------------------------------

function Section({
  title,
  aside,
  actions,
  children,
  testId,
}: {
  title: string;
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Box as="section" data-testid={testId}>
      <Flex align="center" gap={3} minH="8" mb={2} wrap="wrap">
        <Heading
          as="h3"
          fontSize="xs"
          fontWeight="semibold"
          textTransform="uppercase"
          letterSpacing="wider"
          color="fg.muted"
        >
          {title}
        </Heading>
        {aside && (
          <Text fontSize="xs" color="fg.muted">
            {aside}
          </Text>
        )}
        {actions && (
          <HStack gap={2} ms="auto">
            {actions}
          </HStack>
        )}
      </Flex>
      {children}
    </Box>
  );
}

function OptionCard({
  n,
  icon,
  title,
  tag,
  description,
  children,
}: {
  n?: number;
  icon?: IconType;
  title: string;
  tag: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box borderWidth="1px" borderColor="border" rounded="lg" bg="bg" p={4}>
      <Flex gap={3} align="flex-start" mb={4}>
        {n != null ? (
          <Circle
            size="6"
            flexShrink={0}
            bg="colorPalette.solid"
            color="colorPalette.contrast"
            fontSize="xs"
            fontWeight="bold"
            aria-hidden
          >
            {n}
          </Circle>
        ) : (
          <Circle size="6" flexShrink={0} bg="colorPalette.subtle" color="colorPalette.fg" aria-hidden>
            <Icon as={icon ?? LuSend} boxSize="3.5" />
          </Circle>
        )}
        <Box flex="1" minW={0}>
          <HStack gap={2} wrap="wrap">
            <Text fontWeight="semibold" fontSize="sm">
              {title}
            </Text>
            <Badge size="sm" variant="subtle">
              {tag}
            </Badge>
          </HStack>
          <Text fontSize="xs" color="fg.muted" mt={0.5}>
            {description}
          </Text>
        </Box>
      </Flex>
      <Box ps={{ base: 0, md: 9 }}>{children}</Box>
    </Box>
  );
}

function OrDivider() {
  return (
    <Flex align="center" gap={3} my={2} aria-hidden>
      <Box flex="1" borderTopWidth="1px" borderColor="border.muted" />
      <Text fontSize="xs" color="fg.muted" textTransform="uppercase" letterSpacing="wider">
        or
      </Text>
      <Box flex="1" borderTopWidth="1px" borderColor="border.muted" />
    </Flex>
  );
}

/** Why a citable download can't be requested for the query, or null. */
function useRequestBlocker(): string | null {
  const { explorerStore } = useStore();
  const q = explorerStore.loaded?.query ?? explorerStore.query;
  if (!explorerStore.online) return 'You’re offline.';
  const runnable = isQueryRunnable(q);
  if (!runnable.ok) return runnable.reason;
  const gbif = supportsGbif(q);
  return gbif.ok ? null : gbif.reason;
}

const DownloadOption = observer(function DownloadOption({ onRequest }: { onRequest(): void }) {
  const blocker = useRequestBlocker();
  return (
    <Stack gap={4}>
      <Flex gap={3} align="center" wrap="wrap">
        <Button {...primaryButtonProps} data-testid="request-doi" onClick={onRequest} disabled={!!blocker}>
          <LuSend />
          Request citable DOI…
        </Button>
        <Text fontSize="xs" color={blocker ? 'fg.warning' : 'fg.muted'} role={blocker ? 'status' : undefined}>
          {blocker ?? 'Then open the zip link when it’s ready and drop the file below.'}
        </Text>
      </Flex>
      <DownloadStatus />
      <ZipDropzone onRequest={onRequest} />
    </Stack>
  );
});

// --- States ------------------------------------------------------------------------------

const UPCOMING: { icon: IconType; title: string; text: string }[] = [
  { icon: LuListChecks, title: 'Decision ledger', text: 'Every filter and cleaning step with its record count, frozen.' },
  { icon: LuQuote, title: 'Methods paragraph', text: 'Ready to paste, with sources, filters and citations.' },
  { icon: LuBookMarked, title: 'GBIF & OBIS citations', text: 'A derived-dataset DOI or an official download DOI.' },
  { icon: LuFileJson, title: 'Query JSON', text: 'Rebuild the exact query later or share it.' },
];

const EmptyCite = observer(function EmptyCite({ onRequest }: { onRequest(): void }) {
  const { explorerStore } = useStore();
  const hasQuery = isQueryRunnable(explorerStore.query).ok;
  return (
    <Stack gap={8}>
      <Box borderWidth="1px" borderColor="border" borderStyle="dashed" rounded="lg" p={6} bg="bg.subtle">
        <Heading as="h2" fontSize="md" fontWeight="semibold">
          Nothing to cite yet
        </Heading>
        <Text fontSize="sm" color="fg.muted" mt={1} maxW="60ch">
          Load data from the Occurrences tab and this tab fills in with everything a paper needs to describe and
          reproduce the dataset.
        </Text>
        <Box
          as="ul"
          display="grid"
          gridTemplateColumns="repeat(auto-fill, minmax(200px, 1fr))"
          gap={4}
          mt={5}
          p={0}
          listStyleType="none"
        >
          {UPCOMING.map((u) => (
            <Flex as="li" key={u.title} gap={2.5} align="flex-start">
              <Flex boxSize="7" flexShrink={0} rounded="md" align="center" justify="center" bg="bg.muted" color="fg.muted">
                <Icon as={u.icon} boxSize="3.5" />
              </Flex>
              <Box minW={0}>
                <Text fontSize="sm" fontWeight="medium">
                  {u.title}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  {u.text}
                </Text>
              </Box>
            </Flex>
          ))}
        </Box>
        <Button {...secondaryButtonProps} mt={5} onClick={() => explorerStore.setTab('search')}>
          Go to Occurrences
          <LuArrowRight />
        </Button>
      </Box>

      <Section title="Citable GBIF download" aside="for the current query">
        <OptionCard
          icon={LuFileArchive}
          title={hasQuery ? queryTitle(explorerStore.query) : 'Current query'}
          tag="Official DOI · 5–60 min"
          description="Skip streaming: GBIF prepares every matching record as a zip with its own DOI. Useful above the record cap. Drop the zip here to load it."
        >
          <DownloadOption onRequest={onRequest} />
        </OptionCard>
      </Section>

      <Section title="Query">
        <QueryJsonCard />
      </Section>
    </Stack>
  );
});

const LoadedCite = observer(function LoadedCite({ last, onRequest }: { last: Provenance; onRequest(): void }) {
  const { explorerStore, phyloStore } = useStore();
  const sources = contributingSources(last);
  const usesGbif = sources.includes('gbif');
  const usesObis = sources.includes('obis');
  const methods =
    explorerStore.methodsText ||
    methodsParagraph({
      entries: [],
      funnel: last.funnel,
      speciesCount: last.kpis.species ?? 0,
      query: last.query,
    });
  const references = [
    usesGbif ? gbifReference(last, explorerStore.downloads) : null,
    usesObis ? explorerStore.obisCitation : null,
    phyloStore.citationText || null,
  ].filter((r): r is string => !!r);
  const obisIds = (last.datasetCounts.obis ?? []).map((d) => d.key);
  const obisCitation = explorerStore.obisCitation;
  const records = last.funnel.accepted || last.kpis.records;

  const stats: [string, string][] = [
    [fmtInt(records), 'records'],
    ...(last.kpis.species != null ? [[fmtInt(last.kpis.species), 'species'] as [string, string]] : []),
    ...(last.kpis.datasets != null ? [[fmtInt(last.kpis.datasets), 'datasets'] as [string, string]] : []),
  ];

  return (
    <Stack gap={8}>
      <Box>
        <Box borderWidth="1px" borderColor="border" rounded="lg" bg="bg.subtle" px={5} py={4}>
          <Flex gap={4} align="center" wrap="wrap">
            <Box flex="1" minW="280px">
              <Text
                fontSize="xs"
                fontWeight="semibold"
                textTransform="uppercase"
                letterSpacing="wider"
                color="fg.muted"
              >
                This dataset
              </Text>
              <Text fontSize="lg" fontWeight="semibold" mt={0.5} truncate title={queryTitle(last.query)}>
                {queryTitle(last.query)}
              </Text>
              <Flex
                mt={1}
                gap={1.5}
                wrap="wrap"
                fontSize="sm"
                color="fg.muted"
                fontVariantNumeric="tabular-nums"
                align="center"
              >
                {stats.map(([v, l], i) => (
                  <Text as="span" key={l}>
                    {i > 0 && (
                      <Box as="span" color="fg.muted" me={1.5} aria-hidden>
                        ·
                      </Box>
                    )}
                    <Text as="span" color="fg" fontWeight="medium">
                      {v}
                    </Text>{' '}
                    {l}
                  </Text>
                ))}
                <Box as="span" color="fg.muted" aria-hidden>
                  ·
                </Box>
                <Text as="span">retrieved {retrievedLabel(last.retrievedAt)}</Text>
                {sources.map((s) => (
                  <Badge key={s} size="sm" variant="outline" ms={1}>
                    {s.toUpperCase()}
                  </Badge>
                ))}
              </Flex>
            </Box>
            <Button {...secondaryButtonProps} onClick={() => {
                explorerStore.resetToLoaded();
                explorerStore.setTab('search');
              }}>
              <LuPencil />
              Edit query & reload
            </Button>
          </Flex>
        </Box>
        {last.partial && (
          <Alert.Root status="warning" size="sm" variant="subtle" mt={2}>
            <Alert.Indicator />
            <Alert.Title fontWeight="normal" fontVariantNumeric="tabular-nums" data-testid="cite-partial">
              <Box as="span" fontWeight="semibold">
                Partial dataset:
              </Box>{' '}
              {partialSummary(last.partial)} {partialExplanation(last.partial)} The methods text says so.
            </Alert.Title>
          </Alert.Root>
        )}
      </Box>

      <Box borderWidth="1px" borderColor="border" rounded="lg" p={4}>
        <DecisionLedger mode="frozen" />
      </Box>

      <Section
        title="Methods paragraph"
        actions={
          <>
            <CopyButton text={methods} disabled={!methods} />
            <CopyButton text={references.join('\n\n')} label="Copy references" disabled={references.length === 0} />
          </>
        }
      >
        <Box bg="bg.subtle" borderWidth="1px" borderColor="border.muted" rounded="md" px={5} py={4}>
          <Text fontSize="sm" lineHeight="1.7" maxW="80ch" fontVariantNumeric="tabular-nums">
            {methods || 'The methods paragraph appears here once the load has finished.'}
          </Text>
          {references.length > 0 && (
            <Box mt={4} pt={3} borderTopWidth="1px" borderColor="border.muted">
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb={1.5}>
                References
              </Text>
              <Stack as="ol" gap={1} m={0} ps={4} fontSize="xs" color="fg.muted" listStyleType="decimal">
                {references.map((r) => (
                  <Box as="li" key={r} wordBreak="break-word">
                    <Text lineClamp={3} title={r.length > 240 ? r : undefined}>
                      {r}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      </Section>

      {usesGbif && (
        <Section title="GBIF citation" aside="choose one">
          <OptionCard
            n={1}
            title="Derived dataset"
            tag="Fast · minutes"
            description="Register the records you streamed on GBIF.org and cite the DOI it mints. Credits every contributing dataset."
          >
            <DerivedDatasetCard />
          </OptionCard>
          <OrDivider />
          <OptionCard
            n={2}
            title="Citable GBIF download"
            tag="Official · 5–60 min"
            description="GBIF prepares the same query as an official zip with its own DOI. Needs a GBIF.org account."
          >
            <DownloadOption onRequest={onRequest} />
          </OptionCard>
        </Section>
      )}

      {usesObis && (
        <Section
          title="OBIS citation"
          aside={`${fmtInt(obisIds.length)} ${obisIds.length === 1 ? 'dataset' : 'datasets'}`}
          actions={
            <>
              <CopyButton text={obisCitation} />
              <CopyButton text={obisIds.join('\n')} label="Copy dataset ids" disabled={obisIds.length === 0} />
            </>
          }
        >
          <Box borderWidth="1px" borderColor="border.muted" rounded="md" px={4} py={3}>
            <Text fontSize="sm">{obisCitationHead(obisCitation)}</Text>
            {obisIds.length > 0 && (
              <Text fontSize="xs" color="fg.muted" mt={1.5} fontFamily="mono" lineClamp={2} wordBreak="break-all">
                {obisIds.join(', ')}
              </Text>
            )}
          </Box>
        </Section>
      )}

      <Section title="Query" aside="reproduces this dataset">
        <QueryJsonCard query={last.query} />
      </Section>
    </Stack>
  );
});

/** Cite & reproduce tab (spec layout C, flow 5). */
export default observer(function CiteTab() {
  const { explorerStore } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const last = explorerStore.loaded;
  return (
    <Box data-testid="cite-tab" maxW="960px" mx="auto" px={{ base: 4, md: 6 }} pt={6} pb={12}>
      {last ? (
        <LoadedCite last={last} onRequest={() => setDialogOpen(true)} />
      ) : (
        <EmptyCite onRequest={() => setDialogOpen(true)} />
      )}
      <DownloadRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} query={last?.query} />
    </Box>
  );
});
