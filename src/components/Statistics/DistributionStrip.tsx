import { Box } from '@chakra-ui/react';
import { observer } from 'mobx-react';
import { useStore } from '@/store';
import { Tooltip } from '../ui/tooltip';
import { formatShare } from './format';

// Shares below this are merged into one neutral "other" segment.
const MIN_SHARE = 0.04;
const OTHER_COLOR = 'var(--chakra-colors-gray-muted)';

type Segment = { id: number; share: number };

/** Split a species' records over bioregions: `firstId` first, then by share descending. */
export function distributionSegments(
  countPerRegion: ReadonlyMap<number, number> | undefined,
  firstId?: number,
): Segment[] {
  if (!countPerRegion || countPerRegion.size === 0) return [];
  let total = 0;
  for (const count of countPerRegion.values()) total += count;
  if (total === 0) return [];

  const segments: Segment[] = [];
  let other = 0;
  for (const [id, count] of countPerRegion) {
    const share = count / total;
    if (share < MIN_SHARE && id !== firstId) other += share;
    else segments.push({ id, share });
  }
  segments.sort((a, b) =>
    a.id === firstId ? -1 : b.id === firstId ? 1 : b.share - a.share,
  );
  if (other > 0) segments.push({ id: -1, share: other });
  return segments;
}

export function distributionLabel(segments: Segment[]) {
  return segments
    .map(
      ({ id, share }) =>
        `${id === -1 ? 'other' : `Bioregion ${id}`} ${formatShare(share)}`,
    )
    .join(' · ');
}

/**
 * A `width`×8px stacked bar (72px by default) of where a species' records fall across bioregions. Plain divs so a list
 * can render hundreds; the Tooltip is opt-in (`tooltip`) so a parent can arm it lazily.
 */
export const DistributionStrip = observer(function DistributionStrip({
  speciesName,
  bioregionId,
  tooltip = true,
  width = 72,
}: {
  speciesName: string;
  bioregionId?: number;
  tooltip?: boolean;
  width?: number;
}) {
  const { speciesStore, colorStore } = useStore();
  const { colorBioregion } = colorStore;
  const segments = distributionSegments(
    speciesStore.speciesMap.get(speciesName)?.countPerRegion,
    bioregionId,
  );
  const label = distributionLabel(segments);

  const strip = (
    <Box
      role="img"
      aria-label={label ? `Records by bioregion: ${label}` : 'No records'}
      tabIndex={tooltip ? 0 : undefined}
      display="flex"
      gap="1px"
      w={`${width}px`}
      h="8px"
      flexShrink={0}
      rounded="2px"
      overflow="hidden"
      bg="bg.muted"
      _dark={{
        outline: '1px solid',
        outlineColor: 'whiteAlpha.300',
        outlineOffset: '-1px',
      }}
      _focusVisible={{
        outline: '2px solid',
        outlineColor: 'colorPalette.focusRing',
        outlineOffset: '2px',
      }}
    >
      {segments.map(({ id, share }) => (
        <div
          key={id}
          style={{
            flex: `${share} 1 0`,
            minWidth: 1,
            background: id === -1 ? OTHER_COLOR : colorBioregion(id),
          }}
        />
      ))}
    </Box>
  );

  return (
    <Tooltip
      disabled={!tooltip || !label}
      content={label}
      openDelay={150}
      closeDelay={0}
      positioning={{ placement: 'top' }}
      contentProps={{ fontSize: 'xs' }}
    >
      {strip}
    </Tooltip>
  );
});
