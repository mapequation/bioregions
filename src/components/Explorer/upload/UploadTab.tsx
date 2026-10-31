import { Box, Button, Grid, HStack, List, Spinner, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { type DragEvent, useRef, useState } from 'react';
import { FiUpload } from 'react-icons/fi';
import { useStore } from '../../../store';
import {
  classifyFiles,
  inspectFiles,
  UPLOAD_ACCEPT,
  type UploadItem,
  type UploadPlan,
} from '../../../store/data/classify';
import type { ColumnNames } from '../../../store/data/columns';
import { primaryButtonProps, secondaryButtonProps } from '../buttonStyles';
import ColumnMapping from './ColumnMapping';
import FormatTable from './FormatTable';

type Selection =
  | { state: 'empty' }
  | { state: 'inspecting' }
  | { state: 'ready'; files: File[]; plan: UploadPlan };

/** "Point occurrences · birds.csv" for one plan item. */
function itemText(item: UploadItem, files: File[]): string {
  switch (item.kind) {
    case 'points':
      return `Point occurrences · ${files[item.file].name}`;
    case 'shapefile':
      return `Shapefile · ${item.files.map((i) => files[i].name).join(', ')}`;
    case 'shapefile-zip':
      return `Shapefile · ${files[item.file].name}`;
    case 'gbif-zip':
      return `GBIF download, as downloaded · ${files[item.file].name}`;
    case 'tree':
      return `Tree · ${files[item.file].name}`;
  }
}

function loadLabel(plan: UploadPlan): string {
  if (plan.occurrences && plan.tree) return 'Load occurrences and tree';
  if (plan.tree) return 'Load tree';
  return 'Load';
}

/**
 * The Upload tab (spec §5.2): one drop zone with a Choose files button, the supported
 * formats, the plan the dropped files make, column mapping for CSV/TSV, and Load, which
 * hands the plan to `dataStore.loadUpload` and closes the portal.
 */
export default observer(function UploadTab() {
  const { dataStore, explorerStore } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [selection, setSelection] = useState<Selection>({ state: 'empty' });
  const [columns, setColumns] = useState<ColumnNames | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    const gen = ++generation.current;
    setColumns(null);
    setSelection({ state: 'inspecting' });
    const plan = classifyFiles(await inspectFiles(files));
    if (gen !== generation.current) return; // A newer pick replaced this one.
    setSelection({ state: 'ready', files, plan });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files);
  };

  const ready = selection.state === 'ready' ? selection : null;
  const plan = ready?.plan ?? null;
  const pointsFile = plan?.occurrences?.kind === 'points' ? ready?.files[plan.occurrences.file] : undefined;
  const sameColumn =
    !!pointsFile && !!columns && new Set([columns.name, columns.lat, columns.long]).size < 3;
  const hasItems = !!plan && (!!plan.occurrences || !!plan.tree);
  const canLoad =
    !!ready &&
    hasItems &&
    ready.plan.errors.length === 0 &&
    !dataStore.isLoading &&
    (!pointsFile || (!!columns && !sameColumn));

  const load = () => {
    if (!ready || !canLoad) return;
    // Synchronous refusals in loadUpload (a load running, plan errors, no columns) are
    // ruled out by canLoad; failures after the start show on the job in the Data panel.
    void dataStore.loadUpload(ready.files, ready.plan, pointsFile && columns ? columns : undefined);
    generation.current++;
    setSelection({ state: 'empty' });
    setColumns(null);
    explorerStore.close();
  };

  const replaces = (slot: 'occurrences' | 'tree') => {
    const current = slot === 'tree' ? dataStore.tree : dataStore.occurrence;
    return current ? ` (replaces ${current.label})` : '';
  };

  return (
    <Grid
      maxW="7xl"
      mx="auto"
      p={6}
      gap={6}
      templateColumns={{ base: 'minmax(0, 1fr)', xl: 'minmax(0, 5fr) minmax(0, 6fr)' }}
      alignItems="start"
      data-testid="upload-tab"
    >
      <Stack gap={3} minW={0}>
        <Box
          data-testid="upload-dropzone"
          borderWidth="2px"
          borderStyle="dashed"
          borderColor={dragging ? 'colorPalette.solid' : 'border.emphasized'}
          bg={dragging ? 'bg.muted' : 'bg'}
          rounded="md"
          px={4}
          py={6}
          textAlign="center"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <Stack gap={3} align="center">
            <Text fontSize="sm">
              Drop one occurrence file and/or one tree here (a shapefile may be several files), or
            </Text>
            <Button {...secondaryButtonProps} onClick={() => inputRef.current?.click()}>
              <FiUpload aria-hidden /> Choose files
            </Button>
            <Text fontSize="xs" color="fg.muted">
              Files are read in your browser and are not uploaded anywhere.
            </Text>
          </Stack>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={UPLOAD_ACCEPT}
            hidden
            data-testid="upload-input"
            onChange={(e) => {
              void pick(e.currentTarget.files);
              e.currentTarget.value = ''; // Choosing the same file again still fires change.
            }}
          />
        </Box>

        {selection.state === 'inspecting' && (
          <HStack gap={2} fontSize="sm" color="fg.muted" role="status">
            <Spinner size="xs" />
            <Text>Checking the files…</Text>
          </HStack>
        )}

        {plan && (
          <Stack gap={2} fontSize="sm" data-testid="upload-plan">
            {hasItems && (
              <List.Root gap={1} listStyle="none" ms={0}>
                {plan.occurrences && ready && (
                  <List.Item>
                    {itemText(plan.occurrences, ready.files)}
                    <Text as="span" color="fg.muted">
                      {replaces('occurrences')}
                    </Text>
                  </List.Item>
                )}
                {plan.tree && ready && (
                  <List.Item>
                    {itemText(plan.tree, ready.files)}
                    <Text as="span" color="fg.muted">
                      {replaces('tree')}
                    </Text>
                  </List.Item>
                )}
              </List.Root>
            )}
            {plan.errors.length > 0 && (
              <Stack gap={1} role="alert" color="fg.error">
                {plan.errors.map((error) => (
                  <Text key={error}>{error}</Text>
                ))}
              </Stack>
            )}
            {plan.ignored.length > 0 && (
              <Stack gap={1} color="fg.muted">
                <Text>Not loaded:</Text>
                {plan.ignored.map(({ name, reason }) => (
                  <Text key={name}>{reason}</Text>
                ))}
              </Stack>
            )}
          </Stack>
        )}

        {pointsFile && plan?.errors.length === 0 && (
          <ColumnMapping key={`${pointsFile.name}:${pointsFile.size}:${pointsFile.lastModified}`} file={pointsFile} value={columns} onChange={setColumns} />
        )}
        {sameColumn && (
          <Text fontSize="sm" color="fg.error" role="alert">
            Pick a different column for species, latitude and longitude.
          </Text>
        )}

        {plan && hasItems && plan.errors.length === 0 && (
          <HStack gap={3}>
            <Button {...primaryButtonProps} onClick={load} disabled={!canLoad}>
              {loadLabel(plan)}
            </Button>
            {dataStore.isLoading && (
              <Text fontSize="sm" color="fg.muted">
                A load is running
              </Text>
            )}
          </HStack>
        )}
      </Stack>

      <FormatTable />
    </Grid>
  );
});
