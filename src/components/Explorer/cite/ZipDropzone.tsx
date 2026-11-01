import { Alert, Box, Button, Flex, Grid, HStack, Link, Progress, Text } from '@chakra-ui/react';
import { runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { LuExternalLink, LuFileArchive, LuSend, LuX } from 'react-icons/lu';
import { useStore } from '../../../store';
import { FileUploadDropzone, FileUploadRoot } from '../../ui/file-upload';
import { Tooltip } from '../../ui/tooltip';
import type { ZipImport } from '../../../store/explorer/types';
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';
import { fmtInt, fmtPct } from '../format';

/** Fields the store adds to a ready zip import (optional until every store path sets them). */
type ZipDetails = ZipImport & {
  downloadKey?: string;
  doi?: string;
  queryMatch?: 'match' | 'mismatch' | 'unknown';
  downloadQueryText?: string;
  streamGbifRecords?: number | null;
  /** GBIF records of the stream on screen before and after cleaning (added with clearZip). */
  streamGbifReceived?: number | null;
  streamGbifLoaded?: number | null;
  canReplace?: boolean;
  canCiteDoi?: boolean;
  note?: string;
};

function Cell({ value, emphasis }: { value: number | null; emphasis?: boolean }) {
  return (
    <Text
      fontSize="sm"
      textAlign="end"
      fontWeight={emphasis ? 'semibold' : 'normal'}
      fontVariantNumeric="tabular-nums"
      color={value == null ? 'fg.muted' : 'fg'}
    >
      {value == null ? '–' : fmtInt(value)}
    </Text>
  );
}

const ColumnHead = ({ children }: { children: string }) => (
  <Text fontSize="xs" color="fg.muted" textAlign="end">
    {children}
  </Text>
);

const RowHead = ({ children }: { children: string }) => (
  <Text fontSize="sm" color="fg.muted" truncate>
    {children}
  </Text>
);

/**
 * An action that cannot run here: the same sm outline disabled look for every such button, and
 * `aria-disabled` (not `disabled`) so it stays focusable and its tooltip can give the reason.
 */
function BlockedButton({ label, reason, testId }: { label: string; reason: string; testId: string }) {
  return (
    <Tooltip content={reason} openDelay={200} showArrow>
      <Button
        {...secondaryButtonProps}
        aria-disabled
        aria-description={reason}
        data-testid={testId}
        opacity={0.5}
        cursor="not-allowed"
        _hover={{ bg: 'bg' }}
        _active={{ bg: 'bg' }}
        onClick={(e) => e.preventDefault()}
      >
        {label}
      </Button>
    </Tooltip>
  );
}

export interface ZipDropzoneProps {
  /** Opens the download request dialog for the current query. */
  onRequest?: () => void;
}

/** Drop zone for the official GBIF download zip, with the zip-vs-stream comparison. */
export default observer(function ZipDropzone({ onRequest }: ZipDropzoneProps) {
  const { explorerStore } = useStore();
  const removeZip = () => {
    const store = explorerStore as unknown as { clearZip?: () => void };
    if (store.clearZip) store.clearZip();
    else runInAction(() => (explorerStore.zipImport = null));
  };
  const zip = explorerStore.zipImport;
  const lastLoad = explorerStore.loaded;
  const streamed = lastLoad?.funnel.accepted ?? null;

  if (zip?.state === 'parsing') {
    return (
      <Box
        data-testid="zip-dropzone"
        borderWidth="1px"
        borderColor="border"
        rounded="md"
        px={4}
        py={3.5}
        aria-busy="true"
      >
        <HStack gap={2} fontSize="sm" mb={2}>
          <LuFileArchive aria-hidden />
          <Text truncate>
            Reading <b>{zip.fileName}</b>…
          </Text>
        </HStack>
        <Progress.Root size="xs" value={null} aria-label={`Reading ${zip.fileName}`}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
        <Text fontSize="xs" color="fg.muted" mt={2}>
          The zip is cleaned with the same filters as the stream, so the two can be compared.
        </Text>
      </Box>
    );
  }

  if (zip?.state === 'ready' && zip.funnel) {
    const z = zip as ZipDetails;
    const received = zip.funnel.received;
    const accepted = zip.funnel.accepted;
    const mismatch = z.queryMatch === 'mismatch';
    // Compare with the GBIF part of the stream only: OBIS records are not in a GBIF download.
    const gbifStreamed =
      z.streamGbifLoaded ?? z.streamGbifRecords ?? lastLoad?.funnel.bySource.gbif?.accepted ?? null;
    const gbifReceived = z.streamGbifReceived ?? lastLoad?.funnel.bySource.gbif?.received ?? null;
    const obisStreamed = lastLoad?.funnel.bySource.obis?.accepted ?? 0;
    const hasStream = lastLoad != null;
    const diff = gbifStreamed != null ? accepted - gbifStreamed : null;
    const canReplace = !mismatch && accepted > 0 && (z.canReplace ?? true);
    const canCite = !mismatch && hasStream && (z.canCiteDoi ?? true);
    const obisNote = obisStreamed > 0 ? '; OBIS records are kept' : '';
    // Reconcile the GBIF row with the loaded total: "867 GBIF + 3,661 OBIS = 4,528 loaded; 5,289
    // GBIF records were the same as OBIS records" (cross-source duplicates are kept once, as OBIS).
    const loadedTotal = lastLoad?.funnel.accepted ?? null;
    const sameAsObis = (lastLoad?.funnel.dropped as Partial<Record<string, number>> | undefined)?.crossSource ?? 0;
    const reconcile =
      hasStream && gbifStreamed != null && loadedTotal != null && (obisStreamed > 0 || sameAsObis > 0)
        ? `${fmtInt(gbifStreamed)} GBIF + ${fmtInt(obisStreamed)} OBIS = ${fmtInt(loadedTotal)} loaded${
            sameAsObis > 0
              ? `; ${fmtInt(sameAsObis)} GBIF ${sameAsObis === 1 ? 'record was' : 'records were'} the same as OBIS records`
              : ''
          }`
        : null;
    // Why an action is unavailable, for the tooltip on its disabled button.
    const replaceReason = mismatch
      ? 'Different query'
      : accepted === 0
        ? 'No records in the zip passed cleaning'
        : 'Not available for this zip';
    const citeReason = mismatch ? 'Different query' : 'Not available for this zip';
    let comparison: string | null = null;
    if (!mismatch && diff != null && gbifStreamed != null && gbifStreamed > 0) {
      const vs = `${fmtInt(gbifStreamed)} GBIF records streamed${obisNote}`;
      if (diff === 0) comparison = `Same count as the ${vs}.`;
      else {
        const cause =
          z.queryMatch === 'match'
            ? ' GBIF changed between the two snapshots.'
            : ' The download may use another snapshot or query.';
        comparison = `The zip has ${fmtInt(Math.abs(diff))} ${diff > 0 ? 'more' : 'fewer'} records (${fmtPct(
          Math.abs(diff) / gbifStreamed,
        )}) than the ${vs}.${cause}`;
      }
    }
    return (
      <Box data-testid="zip-dropzone" borderWidth="1px" borderColor="border" rounded="md" px={4} py={3.5}>
        <HStack gap={2} fontSize="sm" mb={z.downloadQueryText && !mismatch ? 1 : 3} minW={0}>
          <LuFileArchive aria-hidden style={{ flexShrink: 0 }} />
          <Text truncate fontWeight="medium" title={zip.fileName} minW={0}>
            {zip.fileName}
          </Text>
          {z.downloadKey && (
            <Text as="span" fontSize="xs" color="fg.muted" flexShrink={0} fontVariantNumeric="tabular-nums">
              key {z.downloadKey}
            </Text>
          )}
        </HStack>
        {z.downloadQueryText && !mismatch && (
          <Text fontSize="xs" color="fg.muted" mb={3} wordBreak="break-word" data-testid="zip-query">
            Download query:{' '}
            <Box as="span" color="fg">
              {z.downloadQueryText}
            </Box>
          </Text>
        )}
        {mismatch && (
          <Alert.Root status="error" size="sm" variant="subtle" mb={3} role="alert" data-testid="zip-mismatch">
            <Alert.Indicator />
            <Alert.Content minW={0}>
              <Alert.Title>This download is for a different query</Alert.Title>
              <Alert.Description wordBreak="break-word">
                {z.downloadQueryText ?? 'Its query does not match the one loaded here.'}
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <Text srOnly>
          Official zip: {fmtInt(received)} received, {fmtInt(accepted)} after cleaning.
          {hasStream
            ? ` GBIF part of the loaded data: ${gbifReceived != null ? `${fmtInt(gbifReceived)} received, ` : ''}${
                gbifStreamed != null ? fmtInt(gbifStreamed) : 'unknown'
              } loaded after cleaning.`
            : ''}
          {reconcile ? ` ${reconcile}.` : ''}
        </Text>
        <Grid
          templateColumns="minmax(0, 1fr) minmax(5.5rem, auto) minmax(9rem, auto)"
          columnGap={4}
          rowGap={1}
          alignItems="baseline"
          aria-hidden
          data-testid="zip-figures"
        >
          <Box />
          <ColumnHead>Received</ColumnHead>
          <ColumnHead>Loaded (after cleaning)</ColumnHead>
          <RowHead>Official zip</RowHead>
          <Cell value={received} />
          <Cell value={accepted} emphasis />
          <RowHead>GBIF part of the loaded data</RowHead>
          <Cell value={hasStream ? gbifReceived : null} />
          <Cell value={hasStream ? gbifStreamed : null} emphasis />
        </Grid>
        {reconcile && (
          <Text
            fontSize="xs"
            color="fg.muted"
            mt={0.5}
            fontVariantNumeric="tabular-nums"
            aria-hidden
            data-testid="zip-reconcile"
          >
            {reconcile}
          </Text>
        )}
        {comparison && (
          <Text fontSize="xs" color="fg.muted" mt={2} fontVariantNumeric="tabular-nums" data-testid="zip-comparison">
            {comparison}
          </Text>
        )}
        {!mismatch && accepted === 0 && (
          <Text fontSize="xs" color="fg.warning" mt={2}>
            No records in the zip passed cleaning, so it cannot replace the data.
          </Text>
        )}
        {z.doi && (
          <HStack gap={1.5} fontSize="xs" mt={2} minW={0}>
            <Text color="fg.muted" flexShrink={0}>
              DOI
            </Text>
            <Link
              href={`https://doi.org/${z.doi}`}
              target="_blank"
              rel="noreferrer"
              color="colorPalette.fg"
              truncate
              title={z.doi}
            >
              {z.doi}
              <LuExternalLink aria-hidden />
            </Link>
          </HStack>
        )}
        {z.note && (
          <Text fontSize="xs" color="fg.muted" mt={2}>
            {z.note}
          </Text>
        )}
        <Flex gap={2} mt={3.5} wrap="wrap" align="center">
          {canReplace ? (
            <Button {...primaryButtonProps} onClick={() => explorerStore.applyZip('replace')} data-testid="zip-replace">
              {hasStream ? 'Replace with official download' : 'Load official download'}
            </Button>
          ) : (
            <BlockedButton
              label={hasStream ? 'Replace with official download' : 'Load official download'}
              reason={replaceReason}
              testId="zip-replace"
            />
          )}
          {hasStream &&
            (canCite ? (
              <Button
                {...secondaryButtonProps}
                onClick={() => explorerStore.applyZip('keepStreamCiteDoi')}
                data-testid="zip-keep-cite"
              >
                Keep streamed, cite DOI
              </Button>
            ) : (
              <BlockedButton label="Keep streamed, cite DOI" reason={citeReason} testId="zip-keep-cite" />
            ))}
          {z.queryMatch !== 'match' && onRequest && (
            <Button {...secondaryButtonProps} onClick={onRequest} data-testid="zip-request-download">
              <LuSend />
              Request a download for this query
            </Button>
          )}
          <Button {...secondaryButtonProps} variant="ghost" bg="transparent" borderColor="transparent" onClick={removeZip} data-testid="zip-remove">
            <LuX />
            Remove this zip
          </Button>
        </Flex>
      </Box>
    );
  }

  return (
    <Box data-testid="zip-dropzone">
      {zip?.state === 'error' && (
        <Alert.Root status="error" size="sm" variant="subtle" mb={2} role="alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Couldn’t read {zip.fileName}</Alert.Title>
            <Alert.Description>{zip.error ?? 'Is it a GBIF download zip?'}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
      <FileUploadRoot
        maxFiles={1}
        accept={['.zip', 'application/zip', 'application/x-zip-compressed']}
        alignItems="stretch"
        onFileAccept={(e) => {
          const file = e.files[0];
          if (file) void explorerStore.importZip(file);
        }}
      >
        <FileUploadDropzone
          minH="auto"
          py={4}
          gap={1}
          borderColor="border"
          bg="bg"
          _hover={{ bg: 'bg.subtle' }}
          label={
            <Text as="span" fontSize="sm">
              Drop the downloaded <b>.zip</b> here, or{' '}
              <Text as="span" color="colorPalette.fg" textDecoration="underline" textUnderlineOffset="2px">
                browse
              </Text>
            </Text>
          }
          description={
            <Text as="span" fontSize="xs">
              {streamed != null
                ? 'It stays on this computer and is compared with the streamed records.'
                : 'It stays on this computer and loads as your dataset.'}
            </Text>
          }
        />
      </FileUploadRoot>
    </Box>
  );
});
