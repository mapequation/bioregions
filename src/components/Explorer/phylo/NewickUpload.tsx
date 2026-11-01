import { Alert, Button, Flex, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useRef, useState } from 'react';
import { LuFileUp, LuTrash2 } from 'react-icons/lu';
import { useStore } from '../../../store';
import { classifyFiles } from '../../../store/data/classify';
import { secondaryButtonProps } from '../buttonStyles';
import { fmtInt } from '../format';

const TREE_ACCEPT = '.nwk,.tre,.tree';

/** Why `file` can't load as a tree, or null. Uses the Upload tab's classifier, trees only. */
function treeFileError(file: File): string | null {
  const plan = classifyFiles([{ name: file.name, size: file.size }]);
  if (plan.tree) return null;
  return plan.errors[0] ?? `${file.name}: not a tree file. Choose a .nwk, .tre or .tree file.`;
}

/** "Loaded: birds.nwk · 140 tips · 132 of 140 dataset species in tree", with Remove. */
const LoadedTreeRow = observer(function LoadedTreeRow() {
  const { dataStore } = useStore();
  const tree = dataStore.tree;
  const overlap = dataStore.treeOverlap;
  if (!tree) return null;
  const parts = [`${fmtInt(tree.tips)} tips`];
  if (overlap && overlap.datasetSpecies > 0) {
    parts.push(`${fmtInt(overlap.inTree)} of ${fmtInt(overlap.datasetSpecies)} dataset species in tree`);
  }
  const busy = dataStore.isLoading;
  return (
    <Stack gap={1} data-testid="newick-loaded">
      <Flex align="center" gap={2} wrap="wrap">
        <Text fontSize="sm" flex="1" minW={0} wordBreak="break-word" fontVariantNumeric="tabular-nums">
          <Text as="span" fontWeight="medium">
            Loaded:
          </Text>{' '}
          {[tree.label, ...parts].join(' · ')}
        </Text>
        <Button
          {...secondaryButtonProps}
          size="xs"
          disabled={busy}
          onClick={() => void dataStore.removeTree()}
          data-testid="newick-remove"
        >
          <LuTrash2 /> Remove
        </Button>
      </Flex>
      {busy && (
        <Text fontSize="xs" color="fg.muted">
          Remove is available when the occurrence load ends.
        </Text>
      )}
    </Stack>
  );
});

/**
 * Load a Newick tree file into the tree slot (`dataStore.loadTree`). `start` is the
 * centred variant for the tab's start card; `compact` is a row for the names aside.
 */
export default observer(function NewickUpload({ variant }: { variant: 'start' | 'compact' }) {
  const { dataStore } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const job = dataStore.treeJob;
  const loading = job?.state === 'loading';
  const error = rejected ?? (job?.state === 'error' ? job.error ?? 'Not a valid Newick tree' : null);
  const errorLabel = rejected ? null : job?.label;

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reason = treeFileError(file);
    setRejected(reason);
    if (!reason) void dataStore.loadTree({ kind: 'file', file });
  };

  const start = variant === 'start';
  return (
    <Stack gap={2} w="full" textAlign="start" data-testid={`newick-upload-${variant}`}>
      <LoadedTreeRow />
      <Flex align="center" gap={2} wrap="wrap" justify={start ? 'center' : 'flex-start'}>
        {start && (
          <Text fontSize="sm" color="fg.muted">
            Or upload your own tree (.nwk, .tre, .tree)
          </Text>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={TREE_ACCEPT}
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            onFiles(e.currentTarget.files);
            e.currentTarget.value = '';
          }}
        />
        <Button
          {...secondaryButtonProps}
          size="xs"
          loading={loading}
          loadingText="Loading tree…"
          onClick={() => inputRef.current?.click()}
          data-testid="newick-choose"
        >
          <LuFileUp /> {start ? 'Choose file' : 'Upload a tree file (.nwk, .tre, .tree)'}
        </Button>
      </Flex>
      {dataStore.tree && !loading && (
        <Text fontSize="xs" color="fg.muted" textAlign={start ? 'center' : 'start'}>
          A new tree replaces the tree loaded now.
        </Text>
      )}
      {error && (
        <Alert.Root status="error" size="sm" borderRadius="md">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{errorLabel ? `Couldn’t load ${errorLabel}` : 'Couldn’t use this file'}</Alert.Title>
            <Alert.Description wordBreak="break-word">{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}
    </Stack>
  );
});
