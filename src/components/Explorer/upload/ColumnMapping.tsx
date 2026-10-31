import { Box, Field, HStack, NativeSelect, Spinner, Stack, Table, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useEffect, useState } from 'react';
import { type ColumnNames, guessColumnNames } from '../../../store/data/columns';
import { loadPreview } from '../../../utils/loader';

/** Rows of the file shown above the selects. */
const PREVIEW_ROWS = 5;

const ROLES: { key: keyof ColumnNames; label: string }[] = [
  { key: 'name', label: 'Species column' },
  { key: 'lat', label: 'Latitude column' },
  { key: 'long', label: 'Longitude column' },
];

type Preview =
  | { state: 'loading' }
  | { state: 'error'; error: string }
  | { state: 'ready'; header: string[]; rows: Record<string, unknown>[] };

const cellText = (value: unknown) => (value == null ? '' : String(value));

interface ColumnMappingProps {
  /** The CSV/TSV file to map. Remount (key by file) when it changes. */
  file: File;
  value: ColumnNames | null;
  /** Called with the guessed columns once the header is read, and on every select change. */
  onChange: (columns: ColumnNames) => void;
}

/**
 * Column mapping for a point file: a preview of its first rows and three labelled selects
 * for the species, latitude and longitude columns, pre-filled by `guessColumnNames`.
 */
export default observer(function ColumnMapping({ file, value, onChange }: ColumnMappingProps) {
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });

  // biome-ignore lint/correctness/useExhaustiveDependencies: read the header once per file; onChange is a fresh closure each render
  useEffect(() => {
    let current = true;
    loadPreview(file)
      .then(({ data, header }) => {
        if (!current) return;
        setPreview({ state: 'ready', header, rows: (data as Record<string, unknown>[]).slice(0, PREVIEW_ROWS) });
        if (header.length > 0) onChange(guessColumnNames(header));
      })
      .catch((errors: unknown) => {
        if (!current) return;
        const first = Array.isArray(errors) ? (errors[0] as { message?: string } | undefined)?.message : undefined;
        setPreview({ state: 'error', error: first ?? String(errors) });
      });
    return () => {
      current = false;
    };
  }, [file]);

  if (preview.state === 'loading') {
    return (
      <HStack gap={2} fontSize="sm" color="fg.muted" role="status">
        <Spinner size="xs" />
        <Text>Reading the first rows of {file.name}…</Text>
      </HStack>
    );
  }
  if (preview.state === 'error') {
    return (
      <Text fontSize="sm" color="fg.error" role="alert">
        Could not read {file.name}: {preview.error}
      </Text>
    );
  }
  const { header, rows } = preview;
  if (header.length === 0) {
    return (
      <Text fontSize="sm" color="fg.error" role="alert">
        {file.name} has no header row.
      </Text>
    );
  }

  return (
    <Stack gap={3} data-testid="upload-column-mapping">
      <Box overflowX="auto" borderWidth="1px" borderColor="border" rounded="md">
        <Table.Root size="sm" variant="line">
          <Table.Caption captionSide="top" textAlign="start" px={3} pt={2} mt={0}>
            First {Math.min(PREVIEW_ROWS, rows.length)} rows of {file.name}
          </Table.Caption>
          <Table.Header>
            <Table.Row>
              {header.map((col) => (
                <Table.ColumnHeader key={col} scope="col" whiteSpace="nowrap">
                  {col}
                </Table.ColumnHeader>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: preview rows have no identity and never reorder
              <Table.Row key={i}>
                {header.map((col) => (
                  <Table.Cell key={col} whiteSpace="nowrap">
                    {cellText(row[col])}
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
      <HStack gap={3} align="start" flexWrap="wrap">
        {ROLES.map(({ key, label }) => (
          <Field.Root key={key} flex="1" minW="10rem">
            <Field.Label fontSize="sm">{label}</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={value?.[key] ?? ''}
                onChange={(e) => {
                  if (value) onChange({ ...value, [key]: e.currentTarget.value });
                }}
              >
                {header.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        ))}
      </HStack>
    </Stack>
  );
});
