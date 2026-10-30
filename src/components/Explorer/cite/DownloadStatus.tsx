import { Badge, Box, Button, Flex, IconButton, Link, Spinner, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useState } from 'react';
import { LuCircleCheck, LuCircleX, LuClock, LuExternalLink, LuRefreshCw } from 'react-icons/lu';
import { useStore } from '../../../store';
import type { GbifDownload } from '../../../store/explorer/types';
import { Tooltip } from '../../ui/tooltip';
import { fmtBytes, fmtInt } from '../format';
import { isPending, shortTime } from './citeHelpers';

const STATUS: Record<
  GbifDownload['status'],
  { palette: string; label: string; icon: React.ReactNode }
> = {
  PREPARING: { palette: 'blue', label: 'Preparing', icon: <Spinner size="xs" borderWidth="1.5px" /> },
  RUNNING: { palette: 'blue', label: 'Running', icon: <Spinner size="xs" borderWidth="1.5px" /> },
  SUCCEEDED: { palette: 'green', label: 'Succeeded', icon: <LuCircleCheck /> },
  FAILED: { palette: 'red', label: 'Failed', icon: <LuCircleX /> },
  KILLED: { palette: 'red', label: 'Killed', icon: <LuCircleX /> },
  CANCELLED: { palette: 'gray', label: 'Cancelled', icon: <LuCircleX /> },
};

const Sep = () => (
  <Box as="span" color="fg.muted" aria-hidden>
    ·
  </Box>
);

const DownloadRow = observer(function DownloadRow({ d, cited }: { d: GbifDownload; cited: boolean }) {
  const s = STATUS[d.status];
  const gbifPage = `https://www.gbif.org/occurrence/download/${d.key}`;
  const doi = d.doi?.replace(/^https?:\/\/doi\.org\//, '');
  return (
    <Box as="li" listStyleType="none" px={3} py={2.5} data-testid="download-row">
      <Flex gap={2} align="center" wrap="wrap" fontSize="sm">
        <Badge size="sm" variant="subtle" colorPalette={s.palette} gap={1} minW="92px" justifyContent="center">
          {s.icon}
          {s.label}
        </Badge>
        <Tooltip content={`GBIF download ${d.key}`}>
          <Link
            href={gbifPage}
            target="_blank"
            rel="noopener noreferrer"
            fontFamily="mono"
            fontSize="xs"
            color="fg"
            maxW="24ch"
            truncate
            display="inline-block"
          >
            {d.key}
          </Link>
        </Tooltip>
        {cited && (
          <Badge size="sm" variant="outline" colorPalette="brand">
            Cited
          </Badge>
        )}
        <Text
          fontSize="xs"
          color="fg.muted"
          ms="auto"
          fontVariantNumeric="tabular-nums"
          display="inline-flex"
          gap={1.5}
          alignItems="center"
        >
          <LuClock aria-hidden />
          requested {shortTime(d.createdAt)}
          <Sep />
          checked {shortTime(d.checkedAt)}
        </Text>
      </Flex>
      {d.status === 'SUCCEEDED' ? (
        <Flex
          mt={1.5}
          gap={2}
          align="center"
          wrap="wrap"
          fontSize="xs"
          color="fg.muted"
          fontVariantNumeric="tabular-nums"
        >
          {doi ? (
            <Link href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer" color="fg" fontWeight="medium">
              doi:{doi}
            </Link>
          ) : (
            <Text as="span">DOI pending</Text>
          )}
          {d.totalRecords != null && (
            <>
              <Sep />
              <Text as="span">{fmtInt(d.totalRecords)} records</Text>
            </>
          )}
          {d.size != null && (
            <>
              <Sep />
              <Text as="span">{fmtBytes(d.size)}</Text>
            </>
          )}
          {d.downloadLink && (
            <Button size="xs" variant="outline" asChild ms="auto">
              <a href={d.downloadLink} target="_blank" rel="noopener noreferrer">
                Open zip
                <LuExternalLink />
              </a>
            </Button>
          )}
        </Flex>
      ) : (
        <Text mt={1} fontSize="xs" color="fg.muted">
          {isPending(d) ? (
            'GBIF is preparing the zip, usually 5–60 minutes. You’ll also get an email.'
          ) : (
            <>
              GBIF could not finish this download.{' '}
              <Link href={gbifPage} target="_blank" rel="noopener noreferrer">
                Details on GBIF.org
              </Link>
            </>
          )}
        </Text>
      )}
    </Box>
  );
});

/** Requested GBIF downloads, newest first (the store polls pending ones every 30 s). */
export default observer(function DownloadStatus() {
  const { explorerStore } = useStore();
  const downloads = [...explorerStore.downloads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const anyPending = downloads.some(isPending);
  const [checking, setChecking] = useState(false);

  if (downloads.length === 0) return null;
  const citedKey = explorerStore.lastLoad?.gbifDownloadKey;

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={1.5}>
        <Text fontSize="xs" color="fg.muted" aria-live="polite">
          {anyPending ? 'Checked every 30 s while the explorer is open' : `${downloads.length} requested`}
        </Text>
        {anyPending && (
          <Tooltip content="Check now">
            <IconButton
              aria-label="Check download status now"
              size="xs"
              variant="ghost"
              loading={checking}
              onClick={async () => {
                setChecking(true);
                try {
                  await explorerStore.pollDownloads();
                } finally {
                  setChecking(false);
                }
              }}
            >
              <LuRefreshCw />
            </IconButton>
          </Tooltip>
        )}
      </Flex>
      <Stack
        as="ul"
        gap={0}
        m={0}
        p={0}
        borderWidth="1px"
        borderColor="border.muted"
        rounded="md"
        css={{ '& > li + li': { borderTopWidth: '1px', borderColor: 'border.muted' } }}
      >
        {downloads.map((d) => (
          <DownloadRow key={d.key} d={d} cited={d.key === citedKey} />
        ))}
      </Stack>
    </Box>
  );
});
