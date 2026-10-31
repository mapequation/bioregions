import { Box, Button, Clipboard, chakra, Flex, Icon, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useId } from 'react';
import { LuCheck, LuChevronUp, LuCopy } from 'react-icons/lu';
import { useStore } from '@/store';

const EMPTY_TEXT = 'The methods paragraph is drafted once you add a taxon or choose an area';

/** Sticky methods draft: one line collapsed (32 px), a 180 px reading panel expanded. */
export default observer(function MethodsStrip() {
  const { explorerStore: ex } = useStore();
  const panelId = useId();
  // Until the query is runnable (and nothing is loaded) there is nothing to describe yet.
  const draftable = ex.loaded != null || ex.previewState !== 'empty';
  const text = draftable ? ex.methodsText.trim() : '';
  const expanded = ex.methodsExpanded;
  // Same text as the store (and the Cite tab); "draft" until it describes the loaded data.
  const loaded = ex.loadedMatchesQuery;
  const title = loaded ? 'Methods' : 'Methods draft';

  return (
    <Flex direction="column" h={expanded ? '180px' : '32px'} data-testid="methods-strip">
      <Flex align="center" h="32px" flexShrink={0} px={3} gap={2}>
        <chakra.button
          type="button"
          onClick={() => ex.setMethodsExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls={panelId}
          display="flex"
          alignItems="center"
          gap={2}
          flex="1"
          minW={0}
          h="full"
          textAlign="start"
          cursor="pointer"
          borderRadius="sm"
          focusVisibleRing="outside"
          _hover={{ '& .methods-title': { color: 'fg' } }}
        >
          <Icon
            as={LuChevronUp}
            boxSize={3.5}
            color="fg.muted"
            flexShrink={0}
            transform={expanded ? 'rotate(180deg)' : undefined}
            transition="transform 0.15s"
          />
          <Text
            className="methods-title"
            fontSize="xs"
            fontWeight="semibold"
            textTransform="uppercase"
            letterSpacing="wider"
            color="fg.muted"
            flexShrink={0}
          >
            {title}
          </Text>
          {!expanded && (
            <Text
              fontSize="xs"
              color="fg.muted"
              fontStyle={text ? undefined : 'italic'}
              truncate
              minW={0}
            >
              {text ? `“${text}”` : EMPTY_TEXT}
            </Text>
          )}
          <Box as="span" srOnly>
            {expanded ? 'Collapse' : 'Expand'}
          </Box>
        </chakra.button>
        {text && (
        <Clipboard.Root value={text} timeout={2000}>
          <Clipboard.Context>
            {(c) => (
              <Clipboard.Trigger asChild>
                <Button
                  size="xs"
                  variant={c.copied ? 'subtle' : 'ghost'}
                  colorPalette={c.copied ? 'green' : undefined}
                  data-testid="copy-methods"
                  data-copied={c.copied || undefined}
                  flexShrink={0}
                  minW="5.5rem"
                  aria-label={c.copied ? 'Methods paragraph copied' : 'Copy the methods paragraph'}
                >
                  {c.copied ? <LuCheck /> : <LuCopy />}
                  {c.copied ? 'Copied' : 'Copy'}
                </Button>
              </Clipboard.Trigger>
            )}
          </Clipboard.Context>
          <Clipboard.Context>
            {(c) => (
              <Box srOnly role="status">
                {c.copied ? 'Methods paragraph copied' : ''}
              </Box>
            )}
          </Clipboard.Context>
        </Clipboard.Root>
        )}
      </Flex>
      {expanded && (
        <Box id={panelId} flex="1" minH={0} overflowY="auto" px={3} pb={3} ps={9} tabIndex={0} role="region" aria-label={title} focusVisibleRing="inside">
          {text ? (
            <Text fontSize="sm" lineHeight="tall" maxW="90ch" color="fg" userSelect="text">
              {text}
            </Text>
          ) : (
            <Text fontSize="sm" color="fg.muted" fontStyle="italic">
              {EMPTY_TEXT}
            </Text>
          )}
          {text && (
          <Text fontSize="xs" color="fg.muted" mt={2}>
            {loaded
              ? 'Describes the loaded dataset. The full citation set is on Cite & reproduce.'
              : 'Rewrites after every edit. The final text and citations are on Cite & reproduce after loading.'}
          </Text>
          )}
        </Box>
      )}
    </Flex>
  );
});
