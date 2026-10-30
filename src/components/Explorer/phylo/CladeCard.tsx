import { Badge, Box, Button, Collapsible, Flex, Icon, Link, Skeleton, Stack, Text } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { LuChevronRight, LuExternalLink, LuTriangleAlert } from 'react-icons/lu';
import { InfoTip } from '@/components/ui/toggle-tip';
import { useStore } from '../../../store';
import { fmtInt } from '../format';

/** CLADE (MRCA): the most recent common ancestor of the matched names, and taxa broken in synthesis. */
export default observer(function CladeCard() {
  const { phyloStore } = useStore();
  const { clade, selection, matchProgress, candidatesState } = phyloStore;
  const broken = selection?.broken ?? [];
  const synthetic = phyloStore.syntheticTree;
  const placed = synthetic?.coverageState === 'ready' ? (synthetic.coverage?.matched ?? null) : null;
  const pending = matchProgress != null || (clade == null && candidatesState === 'loading');

  return (
    <Stack data-testid="clade-card" gap={3} p={4}>
      <Flex align="center" gap={1}>
        <Text as="h3" textStyle="xs" fontWeight="semibold" letterSpacing="wider" textTransform="uppercase" color="fg.muted">
          Clade (MRCA)
        </Text>
        <InfoTip>
          The most recent common ancestor of all matched species in the Open Tree synthesis. Candidate trees are the ones
          that include this clade.
        </InfoTip>
      </Flex>

      {clade ? (
        <Stack gap={1} p={3} borderWidth="1px" borderColor="border.muted" borderRadius="md" bg="bg.subtle">
          <Flex align="center" gap={2} minW={0}>
            <Text fontWeight="semibold" textStyle="md" truncate>
              {clade.name}
            </Text>
            {clade.rank && clade.rank !== 'no rank' && (
              <Badge size="sm" variant="outline" flexShrink={0}>
                {clade.rank}
              </Badge>
            )}
            <Link
              href={`https://tree.opentreeoflife.org/opentree/argus/ottol@${clade.ottId}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`${clade.name} on Open Tree (opens in a new tab)`}
              textStyle="xs"
              color="fg.muted"
              flexShrink={0}
              ms="auto"
              _hover={{ color: 'fg' }}
            >
              Open Tree <LuExternalLink />
            </Link>
          </Flex>
          <Stack gap={0} textStyle="xs" color="fg.muted" fontVariantNumeric="tabular-nums" data-testid="clade-counts">
            <Text>
              <Text as="span" color="fg" fontWeight="medium">
                {fmtInt(clade.numTips)}
              </Text>{' '}
              species in {clade.name} on Open Tree
            </Text>
            <Text>
              {placed != null ? (
                <>
                  <Text as="span" color="fg" fontWeight="medium">
                    {fmtInt(placed)}
                  </Text>{' '}
                  of your {fmtInt(phyloStore.datasetNames.length)} species placed in the synthesis
                </>
              ) : (
                'Placing your species…'
              )}
            </Text>
          </Stack>
        </Stack>
      ) : pending ? (
        <Stack gap={2} p={3} borderWidth="1px" borderColor="border.muted" borderRadius="md" aria-busy>
          <Skeleton h="5" w="60%" />
          <Skeleton h="3" w="40%" />
        </Stack>
      ) : (
        <Text textStyle="xs" color="fg.muted">
          The clade appears once at least one name is matched.
        </Text>
      )}

      {broken.length > 0 && (
        <Collapsible.Root>
          <Flex align="center" gap={2} textStyle="xs" color="orange.fg">
            <Icon as={LuTriangleAlert} flexShrink={0} />
            <Text>
              <Text as="span" fontWeight="semibold" fontVariantNumeric="tabular-nums">
                {fmtInt(broken.length)}
              </Text>{' '}
              {broken.length === 1 ? 'taxon' : 'taxa'} placed at MRCA (broken)
            </Text>
            <Collapsible.Trigger asChild>
              <Button size="xs" variant="ghost" px={1.5} h={6} className="group" ms="auto" colorPalette="brand" _expanded={{ bg: 'transparent' }} _hover={{ bg: 'bg.muted' }}>
                <Icon as={LuChevronRight} transition="transform 0.15s" _groupExpanded={{ transform: 'rotate(90deg)' }} />
                Show
              </Button>
            </Collapsible.Trigger>
          </Flex>
          <Collapsible.Content>
            <Text textStyle="xs" color="fg.muted" mt={1.5}>
              These taxa are not monophyletic in the synthesis tree, so their species attach at the common ancestor and
              the tree is less resolved there.
            </Text>
            <Box
              as="ul"
              listStyleType="none"
              mt={1.5}
              maxH="160px"
              overflowY="auto"
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="md"
              bg="bg.subtle"
              py={1}
            >
              {broken.map((name) => (
                <Box as="li" key={name} px={2.5} py={0.5} textStyle="xs" fontStyle="italic">
                  {name}
                </Box>
              ))}
            </Box>
          </Collapsible.Content>
        </Collapsible.Root>
      )}
    </Stack>
  );
});
