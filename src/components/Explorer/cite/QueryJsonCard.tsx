import { Box, Button, Code, Flex, HStack, Input, Text, VisuallyHidden } from '@chakra-ui/react';
import { toJS } from 'mobx';
import { observer } from 'mobx-react';
import { useEffect, useRef, useState } from 'react';
import { LuBookmarkPlus, LuCheck, LuCopy, LuFileDown } from 'react-icons/lu';
import type { OccurrenceQuery } from '@/sources';
import { describeQuery, queryTitle } from '@/sources';
import { useStore } from '../../../store';
import { PopoverArrow, PopoverBody, PopoverContent, PopoverRoot, PopoverTrigger } from '../../ui/popover';
import { copyText, downloadText } from './citeHelpers';

// --- Small shared controls for the Cite & reproduce tab ---------------------------------

export interface CopyButtonProps {
  /** Text to copy, or a function that builds it on click. */
  text: string | (() => string);
  label?: string;
  disabled?: boolean;
  'data-testid'?: string;
  variant?: 'outline' | 'ghost' | 'subtle' | 'surface';
}

/** "Copy" button that confirms with "Copied" for a moment (announced politely). */
export function CopyButton({ text, label = 'Copy', disabled, variant = 'outline', ...rest }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onClick = async () => {
    const ok = await copyText(typeof text === 'function' ? text() : text);
    setState(ok ? 'copied' : 'failed');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };
  return (
    <Button size="sm" variant={variant} onClick={onClick} disabled={disabled} data-testid={rest['data-testid']}>
      {state === 'copied' ? <LuCheck /> : <LuCopy />}
      {/* Keep the label width stable so neighbours don't jump. */}
      <Box as="span" display="inline-grid">
        <Box as="span" gridArea="1 / 1" visibility={state === 'idle' ? 'visible' : 'hidden'}>
          {label}
        </Box>
        <Box as="span" gridArea="1 / 1" visibility={state === 'idle' ? 'hidden' : 'visible'} aria-hidden>
          {state === 'failed' ? 'Copy failed' : 'Copied'}
        </Box>
      </Box>
      <VisuallyHidden aria-live="polite">
        {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed' : ''}
      </VisuallyHidden>
    </Button>
  );
}

/** Popover with a name field that saves the current query to the library. */
export const SaveToLibraryButton = observer(function SaveToLibraryButton({
  label = 'Save to library…',
}: {
  label?: string;
}) {
  const { explorerStore } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = explorerStore.querySummary || 'My query';
  const save = () => {
    const n = name.trim() || placeholder;
    explorerStore.saveQuery(n);
    setSaved(n);
    setName('');
    setOpen(false);
  };
  return (
    <PopoverRoot
      // Mount the portalled content on open: the explorer dialog aria-hides body children present when it opens.
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(e) => setOpen(e.open)}
      initialFocusEl={() => inputRef.current}
      positioning={{ placement: 'bottom-start' }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          {saved ? <LuCheck /> : <LuBookmarkPlus />}
          {saved ? 'Saved' : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent w="320px">
        <PopoverArrow />
        <PopoverBody p={3}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Text asChild fontSize="sm" fontWeight="medium" display="block" mb={1.5}>
              <label htmlFor="save-query-name">Name</label>
            </Text>
            <HStack gap={2}>
              <Input
                id="save-query-name"
                ref={inputRef}
                size="sm"
                value={name}
                placeholder={placeholder}
                onChange={(e) => setName(e.target.value)}
              />
              <Button size="sm" type="submit">
                Save
              </Button>
            </HStack>
            <Text fontSize="xs" color="fg.muted" mt={2}>
              Saved queries live in this browser. Find them under Library.
            </Text>
          </form>
        </PopoverBody>
      </PopoverContent>
    </PopoverRoot>
  );
});

// --- The card ------------------------------------------------------------------------

/** The query that produced the loaded dataset (or the current query), as reproducible JSON. */
export default observer(function QueryJsonCard({ query: queryProp }: { query?: OccurrenceQuery }) {
  const { explorerStore } = useStore();
  const query = queryProp ?? explorerStore.query;
  const json = JSON.stringify(toJS(query), null, 2);
  const d = describeQuery(query);
  const facts = [
    ['Taxa', d.taxa],
    ['Area', d.area],
    ['Years', d.years],
    ...(d.depth ? [['Depth', d.depth]] : []),
  ] as [string, string][];
  return (
    <Box data-testid="query-json">
      <Flex gap={4} align="flex-start" justify="space-between" wrap="wrap">
        <Box minW={0} flex="1 1 280px">
          <Text fontSize="sm" fontWeight="medium" truncate title={queryTitle(query)}>
            {queryTitle(query) || 'Empty query'}
          </Text>
          <Flex as="dl" fontSize="xs" color="fg.muted" columnGap={3} rowGap={0.5} wrap="wrap" mt={1}>
            {facts.map(([k, v]) => (
              <HStack key={k} gap={1} minW={0}>
                <Box as="dt">{k}</Box>
                <Box as="dd" color="fg" truncate maxW="40ch" title={v}>
                  {v}
                </Box>
              </HStack>
            ))}
          </Flex>
        </Box>
        <HStack gap={2} wrap="wrap">
          <CopyButton text={json} label="Copy JSON" />
          <Button size="sm" variant="outline" onClick={() => downloadText('query.json', json, 'application/json')}>
            <LuFileDown />
            Download query.json
          </Button>
          <SaveToLibraryButton />
        </HStack>
      </Flex>
      <Box
        as="details"
        mt={3}
        css={{ '& > summary::-webkit-details-marker': { display: 'none' } }}
        borderWidth="1px"
        borderColor="border.muted"
        rounded="md"
      >
        <Box
          as="summary"
          px={3}
          py={1.5}
          fontSize="xs"
          color="fg.muted"
          cursor="pointer"
          _hover={{ color: 'fg' }}
          focusVisibleRing="inside"
          rounded="md"
        >
          Show JSON · paste it into Library → Import to rebuild this query
        </Box>
        <Code
          display="block"
          whiteSpace="pre"
          overflow="auto"
          maxH="220px"
          p={3}
          fontSize="xs"
          bg="bg.subtle"
          borderTopWidth="1px"
          borderColor="border.muted"
          roundedTop={0}
          w="full"
        >
          {json}
        </Code>
      </Box>
    </Box>
  );
});
