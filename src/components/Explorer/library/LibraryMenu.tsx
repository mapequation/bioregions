import { Alert, Box, Button, Flex, HStack, IconButton, Input, Stack, Tabs, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useRef, useState } from 'react';
import { LuChevronDown, LuFileDown, LuFileUp, LuLibrary, LuTrash2 } from 'react-icons/lu';
import { describeQuery } from '@/sources';
import { useStore } from '../../../store';
import type { SavedQuery } from '../../../store/explorer/types';
import { PopoverBody, PopoverContent, PopoverRoot, PopoverTrigger } from '../../ui/popover';
import { downloadText, timeAgo } from '../cite/citeHelpers';
import { fmtCompact } from '../format';

type LibraryTab = 'recent' | 'saved';

function querySubline(q: SavedQuery['query']): string {
  const d = describeQuery(q);
  const parts = [d.area];
  if (q.years[0] !== null || q.years[1] !== null) parts.push(d.years);
  return parts.join(' · ');
}

interface RowProps {
  item: SavedQuery;
  meta?: string;
  onPick(): void;
  onDelete?(): void;
}

function Row({ item, meta, onPick, onDelete }: RowProps) {
  const d = describeQuery(item.query);
  return (
    <Flex as="li" listStyleType="none" align="center" gap={1}>
      <Box
        as="button"
        flex="1"
        minW={0}
        textAlign="start"
        px={2.5}
        py={1.5}
        rounded="md"
        _hover={{ bg: 'bg.muted' }}
        focusVisibleRing="inside"
        onClick={onPick}
        title={`Restore “${item.name}” (does not load)`}
      >
        <Flex align="baseline" gap={2}>
          <Text fontSize="sm" fontWeight="medium" truncate flex="1" minW={0}>
            {item.name}
          </Text>
          {meta && (
            <Text fontSize="xs" color="fg.muted" flexShrink={0} fontVariantNumeric="tabular-nums">
              {meta}
            </Text>
          )}
        </Flex>
        <Text fontSize="xs" color="fg.muted" truncate>
          {`${d.taxa} · ${querySubline(item.query)}`}
        </Text>
      </Box>
      {onDelete && (
        <IconButton aria-label={`Delete “${item.name}”`} size="xs" variant="ghost" color="fg.muted" onClick={onDelete}>
          <LuTrash2 />
        </IconButton>
      )}
    </Flex>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text fontSize="sm" color="fg.muted" px={2.5} py={6} textAlign="center">
      {children}
    </Text>
  );
}

/** Header Library popover: Recent, Saved and Examples (restore, never load), save, import and export JSON. */
export default observer(function LibraryMenu() {
  const { explorerStore } = useStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<LibraryTab>(() =>
    explorerStore.recent.length || !explorerStore.saved.length ? 'recent' : 'saved',
  );
  const [name, setName] = useState('');
  const [message, setMessage] = useState<{ status: 'error' | 'success'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const placeholder = explorerStore.querySummary || 'Name this query';
  const queryEmpty = explorerStore.query.taxa.length === 0 && explorerStore.query.area.kind === 'world';

  // Restore re-previews and never loads.
  const pick = (item: SavedQuery) => {
    explorerStore.restore(item.id);
    explorerStore.setTab('search');
    setOpen(false);
  };

  const save = () => {
    const n = name.trim() || explorerStore.querySummary;
    if (!n) return;
    explorerStore.saveQuery(n);
    setName('');
    setTab('saved');
    setMessage({ status: 'success', text: `Saved “${n}”.` });
  };

  const importFile = async (file: File) => {
    try {
      const res = explorerStore.importQueryJson(await file.text());
      if (res.ok) {
        setMessage(null);
        explorerStore.setTab('search');
        setOpen(false);
      } else setMessage({ status: 'error', text: res.reason });
    } catch {
      setMessage({ status: 'error', text: `Couldn’t read ${file.name}.` });
    }
  };

  const counts = { recent: explorerStore.recent.length, saved: explorerStore.saved.length };

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open);
        if (!e.open) setMessage(null);
      }}
      positioning={{ placement: 'bottom-end' }}
      lazyMount
    >
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" data-testid="library-menu" aria-label="Query library">
          <LuLibrary />
          Library
          <LuChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent w="380px" maxW="calc(100vw - 32px)">
        <PopoverBody p={0}>
          <Tabs.Root value={tab} onValueChange={(e) => setTab(e.value as LibraryTab)} size="sm" variant="line" fitted>
            <Tabs.List px={2}>
              {(['recent', 'saved'] as const).map((t) => (
                <Tabs.Trigger key={t} value={t} textTransform="capitalize">
                  {t}
                  <Text as="span" color="fg.muted" fontVariantNumeric="tabular-nums">
                    {counts[t]}
                  </Text>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Box maxH="320px" overflowY="auto" p={1.5}>
              <Tabs.Content value="recent" p={0}>
                {counts.recent === 0 ? (
                  <Empty>Queries you load appear here.</Empty>
                ) : (
                  <Stack as="ul" gap={0} m={0} p={0}>
                    {explorerStore.recent.map((r) => (
                      <Row
                        key={r.id}
                        item={r}
                        meta={[r.kpis ? `${fmtCompact(r.kpis.records)} rec` : '', timeAgo(r.savedAt)]
                          .filter(Boolean)
                          .join(' · ')}
                        onPick={() => pick(r)}
                      />
                    ))}
                  </Stack>
                )}
              </Tabs.Content>
              <Tabs.Content value="saved" p={0}>
                {counts.saved === 0 ? (
                  <Empty>Name and save the current query below to come back to it.</Empty>
                ) : (
                  <Stack as="ul" gap={0} m={0} p={0}>
                    {explorerStore.saved.map((s) => (
                      <Row
                        key={s.id}
                        item={s}
                        meta={timeAgo(s.savedAt)}
                        onPick={() => pick(s)}
                        onDelete={() => explorerStore.deleteSaved(s.id)}
                      />
                    ))}
                  </Stack>
                )}
              </Tabs.Content>
            </Box>
          </Tabs.Root>
          <Box borderTopWidth="1px" borderColor="border.muted" p={3}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Text asChild fontSize="xs" fontWeight="medium" color="fg.muted">
                <label htmlFor="library-save-name">Save the current query</label>
              </Text>
              <HStack gap={2} mt={1}>
                <Input
                  id="library-save-name"
                  size="sm"
                  value={name}
                  placeholder={placeholder}
                  onChange={(e) => setName(e.target.value)}
                  disabled={queryEmpty}
                />
                <Button size="sm" type="submit" disabled={queryEmpty}>
                  Save
                </Button>
              </HStack>
            </form>
            {message && (
              <Alert.Root status={message.status} size="sm" variant="subtle" mt={2} role="status">
                <Alert.Indicator />
                <Alert.Title fontWeight="normal">{message.text}</Alert.Title>
              </Alert.Root>
            )}
            <HStack gap={1} mt={2} ms={-2}>
              <Button size="xs" variant="ghost" onClick={() => fileRef.current?.click()}>
                <LuFileUp />
                Import JSON…
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => downloadText('query.json', explorerStore.exportQueryJson(), 'application/json')}
              >
                <LuFileDown />
                Export JSON
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Import query JSON file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void importFile(f);
                }}
              />
            </HStack>
          </Box>
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
});
