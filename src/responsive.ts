// Shared responsive-layout constants for the map and tree views. Both render through d3gl's
// `aspectRatio` sizing mode (d3gl 0.6+): the host fills the available width up to MAX_WIDTH and
// keeps this width÷height ratio, resizing the engine in place on container changes.
export const MAX_WIDTH = 1200;
export const ASPECT_RATIO = 2;
