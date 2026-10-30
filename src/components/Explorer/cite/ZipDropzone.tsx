import { Alert, Box, Button, Flex, Grid, HStack, Progress, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuFileArchive } from 'react-icons/lu';
import { useStore } from '../../../store';
import { FileUploadDropzone, FileUploadRoot } from '../../ui/file-upload';
import { fmtInt, fmtPct } from '../format';

function Figure({ label, value, emphasis }: { label: string; value: number | null; emphasis?: boolean }) {
  return (
    <Box>
      <Text fontSize="xs" color="fg.muted">
        {label}
      </Text>
      <Text
        fontSize="md"
        fontWeight={emphasis ? 'semibold' : 'medium'}
        fontVariantNumeric="tabular-nums"
        color={value == null ? 'fg.muted' : 'fg'}
      >
        {value == null ? '–' : fmtInt(value)}
      </Text>
    </Box>
  );
}

/** Drop zone for the official GBIF download zip, with the zip-vs-stream comparison. */
export default observer(function ZipDropzone() {
  const { explorerStore } = useStore();
  const zip = explorerStore.zipImport;
  const streamed = explorerStore.lastLoad?.funnel.accepted ?? null;

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
    const received = zip.funnel.received;
    const accepted = zip.funnel.accepted;
    const diff = streamed != null ? accepted - streamed : null;
    return (
      <Box data-testid="zip-dropzone" borderWidth="1px" borderColor="border" rounded="md" px={4} py={3.5}>
        <HStack gap={2} fontSize="sm" mb={3} minW={0}>
          <LuFileArchive aria-hidden />
          <Text truncate fontWeight="medium" title={zip.fileName}>
            {zip.fileName}
          </Text>
        </HStack>
        <Text srOnly>
          Zip: {fmtInt(received)} received, {fmtInt(accepted)} accepted
          {streamed != null ? ` (stream: ${fmtInt(streamed)})` : ''}
        </Text>
        <Grid templateColumns="repeat(3, minmax(0, 1fr))" gap={4} aria-hidden>
          <Figure label="Zip received" value={received} />
          <Figure label="Zip accepted" value={accepted} emphasis />
          <Figure label="Streamed (loaded)" value={streamed} />
        </Grid>
        {diff != null && streamed != null && streamed > 0 && (
          <Text fontSize="xs" color="fg.muted" mt={2} fontVariantNumeric="tabular-nums">
            {diff === 0
              ? 'Identical record counts.'
              : `The zip has ${fmtInt(Math.abs(diff))} ${diff > 0 ? 'more' : 'fewer'} records (${fmtPct(Math.abs(diff) / streamed)}) than the stream: GBIF changed between the two snapshots.`}
          </Text>
        )}
        <Flex gap={2} mt={3.5} wrap="wrap">
          <Button size="sm" onClick={() => explorerStore.applyZip('replace')}>
            {streamed != null ? 'Replace with official download' : 'Load official download'}
          </Button>
          {streamed != null && (
            <Button size="sm" variant="outline" onClick={() => explorerStore.applyZip('keepStreamCiteDoi')}>
              Keep streamed, cite DOI
            </Button>
          )}
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
