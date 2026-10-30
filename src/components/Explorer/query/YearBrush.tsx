import { Box, Button, Flex, HStack, Skeleton, Stack, Text } from '@chakra-ui/react';
import { scaleLinear, scaleSqrt } from 'd3';
import { observer } from 'mobx-react';
import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { useStore } from '../../../store';
import { Tooltip } from '../../ui/tooltip';
import { chartColors } from '../charts/colors';
import { fmtInt, fmtPct } from '../format';
import NumberField from './NumberField';
import { brushDomain, rangeShare } from './yearBrushMath';

const CHART_H = 56;
const AXIS_H = 16;
const HANDLE_W = 12;
const RECENT_YEARS = 15;

type Handle = 'from' | 'to';

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Year histogram (all years, ignoring the year filter) with a two-handle brush. */
export default observer(function YearBrush() {
  const { explorerStore } = useStore();
  const [sqrt, setSqrt] = useState(true);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [drag, setDrag] = useState<{ handle: Handle; from: number; to: number } | null>(null);

  const bins = explorerStore.mergedYearsAll;
  const [qFrom, qTo] = explorerStore.query.years;
  const currentYear = new Date().getFullYear();
  const [lo, hi] = brushDomain(bins, qFrom, currentYear);
  const state = explorerStore.previewState;

  const from = drag ? drag.from : Math.max(lo, qFrom ?? lo);
  const to = drag ? drag.to : Math.min(hi, qTo ?? hi);

  const inset = HANDLE_W / 2;
  const x = scaleLinear().domain([lo, hi + 1]).range([inset, Math.max(inset + 1, width - inset)]);
  // Lump the long early tail into the first bar so the brush stays readable.
  const counts = new Map<number, number>();
  for (const b of bins) {
    const y = Math.max(lo, Math.min(hi, b.year));
    counts.set(y, (counts.get(y) ?? 0) + b.count);
  }
  const maxCount = Math.max(1, ...counts.values());
  const y = (sqrt ? scaleSqrt() : scaleLinear()).domain([0, maxCount]).range([0, CHART_H - 2]);
  const barW = Math.max(0.5, x(lo + 1) - x(lo) - (width / (hi - lo + 1) > 3 ? 1 : 0));
  // Inner ticks must keep clear of the edge labels (about 34 px each).
  const ticks = x.ticks(4).filter((t) => Number.isInteger(t) && x(t) - x(lo) > 60 && x(hi + 1) - x(t) > 44);

  const commit = (f: number, t: number) => {
    explorerStore.setYears([f <= lo ? null : f, t >= hi ? null : t]);
  };

  const yearAt = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return Math.round(x.invert(clientX - rect.left) - 0.5);
  };
  const moveTo = (handle: Handle, year: number, base: { from: number; to: number }) => {
    const yv = Math.max(lo, Math.min(hi, year));
    return handle === 'from' ? { handle, from: Math.min(yv, base.to), to: base.to } : { handle, from: base.from, to: Math.max(yv, base.from) };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || width === 0) return;
    const el = e.currentTarget;
    const yr = yearAt(e.clientX, el);
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle as Handle | undefined;
    const handle: Handle = hit ?? (Math.abs(yr - from) <= Math.abs(yr - to) ? 'from' : 'to');
    el.setPointerCapture(e.pointerId);
    setDrag(hit ? { handle, from, to } : moveTo(handle, yr, { from, to }));
    (el.querySelector(`[data-handle=${handle}]`) as HTMLElement | null)?.focus();
    e.preventDefault();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag(moveTo(drag.handle, yearAt(e.clientX, e.currentTarget), drag));
  };
  const onPointerUp = () => {
    if (!drag) return;
    commit(drag.from, drag.to);
    setDrag(null);
  };

  const onKey = (handle: Handle) => (e: KeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 10 : 1;
    const cur = handle === 'from' ? from : to;
    let next: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = cur - big;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = cur + big;
    else if (e.key === 'PageDown') next = cur - 10;
    else if (e.key === 'PageUp') next = cur + 10;
    else if (e.key === 'Home') next = lo;
    else if (e.key === 'End') next = hi;
    if (next == null) return;
    e.preventDefault();
    const m = moveTo(handle, next, { from, to });
    commit(m.from, m.to);
  };

  const total = [...counts.values()].reduce((s, c) => s + c, 0);
  const inRange = rangeShare(bins, qFrom, qTo);
  const cutoff = currentYear - RECENT_YEARS;
  const recent = explorerStore.yearShareAfter(cutoff);
  const hasData = total > 0;
  const busy = state === 'stale' || state === 'first';

  const handleBox = (handle: Handle) => {
    const v = handle === 'from' ? from : to;
    const px = handle === 'from' ? x(v) : x(v + 1);
    const open = handle === 'from' ? qFrom == null && !drag : qTo == null && !drag;
    return (
      <Box
        key={handle}
        data-handle={handle}
        role="slider"
        tabIndex={0}
        aria-label={handle === 'from' ? 'From year' : 'To year'}
        aria-valuemin={handle === 'from' ? lo : from}
        aria-valuemax={handle === 'from' ? to : hi}
        aria-valuenow={v}
        aria-valuetext={open ? (handle === 'from' ? 'from the earliest year' : 'to the latest year') : `${handle} ${v}`}
        onKeyDown={onKey(handle)}
        position="absolute"
        top={0}
        h={`${CHART_H}px`}
        w={`${HANDLE_W}px`}
        left={`${px - HANDLE_W / 2}px`}
        cursor="ew-resize"
        outline="none"
        display="flex"
        justifyContent="center"
        zIndex={1}
        css={{
          '&:focus-visible > div:last-of-type': { outline: '2px solid var(--chakra-colors-brand-focus-ring)', outlineOffset: '1px' },
        }}
      >
        <Box w="2px" h="full" bg="fg" opacity={0.8} />
        <Box
          position="absolute"
          top="50%"
          transform="translateY(-50%)"
          w="10px"
          h="20px"
          borderRadius="sm"
          bg="bg"
          borderWidth="1.5px"
          borderColor="fg"
          boxShadow="xs"
        />
      </Box>
    );
  };

  return (
    <Stack gap={2}>
      <HStack justify="space-between" minH={6}>
        <Text fontSize="xs" color="fg.muted">
          Records per year
        </Text>
        <Tooltip content={sqrt ? 'Square-root scale: sparse years stay visible. Click for linear.' : 'Linear scale. Click for square root.'} openDelay={300}>
          <Button
            size="xs"
            variant={sqrt ? 'subtle' : 'ghost'}
            h={6}
            minW={0}
            px={2}
            aria-pressed={sqrt}
            aria-label="Square-root scale"
            onClick={() => setSqrt(!sqrt)}
            fontVariantNumeric="tabular-nums"
          >
            √ scale
          </Button>
        </Tooltip>
      </HStack>

      <Box ref={ref} data-testid="year-brush" position="relative" h={`${CHART_H + AXIS_H}px`} aria-busy={busy}>
        {!hasData ? (
          state === 'first' ? (
            <Skeleton h={`${CHART_H}px`} borderRadius="sm" />
          ) : (
            <Flex
              h={`${CHART_H}px`}
              align="center"
              justify="center"
              borderWidth="1px"
              borderStyle="dashed"
              borderRadius="sm"
              fontSize="xs"
              color="fg.muted"
              px={3}
              textAlign="center"
            >
              {state === 'empty' ? 'Records per year appear once a preview runs.' : 'No dated records.'}
            </Flex>
          )
        ) : (
          <Box
            position="absolute"
            inset={0}
            opacity={busy ? 0.5 : 1}
            transition="opacity 0.15s"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            touchAction="none"
            userSelect="none"
            cursor="crosshair"
          >
            <svg width={width} height={CHART_H + AXIS_H} role="img" aria-label="Year histogram">
              <title>
                {`Records per year, ${lo}–${hi}: ${fmtInt(total)} dated records. Selected ${from}–${to} (${fmtPct(inRange)}).`}
              </title>
              <rect
                x={x(from)}
                y={0}
                width={Math.max(0, x(to + 1) - x(from))}
                height={CHART_H}
                fill="var(--chakra-colors-brand-subtle)"
              />
              {[...counts.entries()].map(([yr, c]) => {
                const h = Math.max(c > 0 ? 1 : 0, y(c));
                const inside = yr >= from && yr <= to;
                return (
                  <rect
                    key={yr}
                    x={x(yr)}
                    y={CHART_H - h}
                    width={barW}
                    height={h}
                    fill={inside ? chartColors.accepted : chartColors.outline}
                    opacity={inside ? 1 : 0.35}
                  />
                );
              })}
              <line x1={inset} x2={width - inset} y1={CHART_H + 0.5} y2={CHART_H + 0.5} stroke={chartColors.grid} />
              {[lo, ...ticks, hi].map((t, i, arr) => (
                <text
                  key={t}
                  x={i === 0 ? 0 : i === arr.length - 1 ? width : x(t)}
                  y={CHART_H + AXIS_H - 3}
                  fontSize={10}
                  fill={chartColors.text}
                  textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {i === 0 && bins.some((b) => b.year < lo) ? `≤${t}` : t}
                </text>
              ))}
            </svg>
            {width > 0 && handleBox('from')}
            {width > 0 && handleBox('to')}
          </Box>
        )}
      </Box>

      <HStack gap={2}>
        <NumberField
          label="From year"
          testId="year-from"
          value={qFrom}
          placeholder="Earliest"
          min={1500}
          max={currentYear}
          w="96px"
          onCommit={(v) => explorerStore.setYears([v, qTo])}
        />
        <Text color="fg.muted" aria-hidden>
          –
        </Text>
        <NumberField
          label="To year"
          testId="year-to"
          value={qTo}
          placeholder="Latest"
          min={1500}
          max={currentYear}
          w="96px"
          onCommit={(v) => explorerStore.setYears([qFrom, v])}
        />
      </HStack>
      <Text fontSize="xs" color="fg.muted" fontVariantNumeric="tabular-nums" minH={4} opacity={busy ? 0.5 : 1}>
        {hasData ? (
          <>
            {qFrom != null || qTo != null ? `${fmtPct(inRange)} of dated records in range · ` : ''}
            {fmtPct(recent)} after {cutoff - 1}
          </>
        ) : (
          ' '
        )}
      </Text>
    </Stack>
  );
});
