import {
  hierarchy,
  cluster,
  scaleLinear,
  pointRadial,
  link as d3link,
  linkRadial,
  curveLinear,
  curveStepBefore,
  curveBumpX,
  type HierarchyPointNode,
  type HierarchyPointLink,
} from 'd3';
import type { PhyloNode } from './treeUtils';

export type LayoutNode = HierarchyPointNode<PhyloNode>;
export type LayoutLink = HierarchyPointLink<PhyloNode>;
export type LayoutMode = 'rectangular' | 'radial';
export type CurveMode = 'linear' | 'step' | 'bump';
export type SizeMode = 'screen' | 'world';

export interface Layout {
  root: LayoutNode;
  mode: LayoutMode;
  /** Canvas-centre offset baked into radial coordinates (so zoom survives a layout toggle). */
  center: [number, number];
}

/**
 * Rectangular dated phylogram. `d3.cluster` spaces the leaves on the vertical axis (`node.x`);
 * the horizontal axis (`node.y`) is the node's normalized `time` (0 = root → left, 1 = youngest
 * leaves → right), so the natural left→right phylogram needs no inversion.
 */
function layoutRectangular(
  root: PhyloNode,
  width: number,
  height: number,
  pad = 40,
  // Wider right margin than the other edges: leaf labels are drawn outward of the youngest
  // tips (time = 1), so the tips stop short of the right edge to leave room for the names.
  padRight = 150,
): LayoutNode {
  const h = cluster<PhyloNode>().size([height - 2 * pad, 1])(
    hierarchy(root, (d) => d.children),
  );
  const time = scaleLinear().domain([0, 1]).range([pad, width - padRight]);
  h.each((n) => {
    n.x += pad;
    n.y = time(n.data.time);
  });
  return h;
}

/**
 * Radial dated phylogram — a half-circle "sunset" fan (as in the d3gl ancestral-ranges example):
 * leaves span π, centred on north. d3 convention: `x` = angle, `y` = radius. The radius is the
 * node's `time` (root at the centre, youngest leaves on the rim). Cartesian positions come from
 * `d3.pointRadial(x, y)` and are origin-centred; the caller adds `center` (see `nodeXY`). Returns
 * the layout root and the rim radius `R` (used to centre the fan vertically).
 */
function layoutRadial(
  root: PhyloNode,
  width: number,
  height: number,
  pad = 50,
): { node: LayoutNode; R: number } {
  const angleExtent = Math.PI;
  const angleStart = -Math.PI / 2; // centre the half-fan on north (12 o'clock)
  const h = cluster<PhyloNode>().size([angleExtent, 1])(
    hierarchy(root, (d) => d.children),
  );
  // A half-fan only fills part of the disc, so it is bounded by half the width and the full
  // height rather than the inscribed circle.
  const R = Math.min(width / 2, height) - pad;
  const radius = scaleLinear().domain([0, 1]).range([0, R]); // root → centre, leaves → rim
  h.each((n) => {
    n.x += angleStart;
    n.y = radius(n.data.time);
  });
  return { node: h, R };
}

export function layoutTree(
  root: PhyloNode,
  mode: LayoutMode,
  width: number,
  height: number,
): Layout {
  if (mode === 'radial') {
    const { node, R } = layoutRadial(root, width, height);
    // The half-circle fan's vertical centre is (H + R) / 2 (matches the example).
    return { root: node, mode, center: [width / 2, (height + R) / 2] };
  }
  return { root: layoutRectangular(root, width, height), mode, center: [0, 0] };
}

/** Cartesian world coordinates for a node: `[horizontal, vertical]` (+ radial centre offset). */
export function nodeXY(
  n: LayoutNode,
  mode: LayoutMode,
  center: [number, number] = [0, 0],
): [number, number] {
  if (mode === 'radial') {
    const [x, y] = pointRadial(n.x, n.y);
    return [x + center[0], y + center[1]];
  }
  return [n.y, n.x];
}

/**
 * A link-drawing closure for the chosen layout + curve, ported from the d3gl ancestral-ranges
 * example. Radial layouts are origin-centred by d3-shape's `pointRadial`/`linkRadial`; each
 * radial closure does `ctx.translate(ox, oy)` once (d3gl's path context supports the canonical
 * canvas translate) to land the fan at the canvas centre `center` ([ox, oy]). The view transform
 * stays at identity, so the user's zoom survives layout/curve toggles. Rectangular needs no
 * offset (center is [0, 0]).
 */
export function makeLinkDraw(
  mode: LayoutMode,
  curve: CurveMode,
  center: [number, number],
): (ctx: CanvasRenderingContext2D, l: LayoutLink) => void {
  const [ox, oy] = center;
  if (mode === 'rectangular') {
    const factory = curve === 'linear' ? curveLinear : curve === 'step' ? curveStepBefore : curveBumpX;
    const gen = d3link<LayoutLink, LayoutNode>(factory).x((d) => d.y).y((d) => d.x);
    return (ctx, l) => {
      gen.context(ctx);
      gen(l);
    };
  }
  if (curve === 'bump') {
    // linkRadial applies the −π/2 internally, so the angle accessor is the raw cluster angle.
    const gen = linkRadial<LayoutLink, LayoutNode>().angle((d) => d.x).radius((d) => d.y);
    return (ctx, l) => {
      ctx.translate(ox, oy);
      gen.context(ctx);
      gen(l);
    };
  }
  if (curve === 'linear') {
    return (ctx, l) => {
      ctx.translate(ox, oy);
      const [sx, sy] = pointRadial(l.source.x, l.source.y);
      const [tx, ty] = pointRadial(l.target.x, l.target.y);
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    };
  }
  // radial "step": arc along the parent radius to the child angle, then a radial line out.
  // The arc angles use −π/2 to match pointRadial's orientation.
  return (ctx, l) => {
    ctx.translate(ox, oy);
    const r0 = l.source.y;
    const sa = l.source.x - Math.PI / 2;
    const ta = l.target.x - Math.PI / 2;
    ctx.moveTo(r0 * Math.cos(sa), r0 * Math.sin(sa));
    ctx.arc(0, 0, r0, sa, ta, ta < sa);
    const [tx, ty] = pointRadial(l.target.x, l.target.y);
    ctx.lineTo(tx, ty);
  };
}

/**
 * Constant screen-px offset from the node: rightward (rectangular) or outward along the radius
 * (radial). `a` is the screen-direction angle (cluster angle − π/2).
 */
export function labelOffset(
  mode: LayoutMode,
  a: number,
  gap: number,
  height: number,
): [number, number] {
  if (mode !== 'radial') return [gap, -height / 2];
  return [Math.cos(a) * gap, Math.sin(a) * gap];
}
