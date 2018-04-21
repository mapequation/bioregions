import paletteGenerator from './paletteGen';
import distinctColors from 'distinct-colors';
import iWantHue from 'iwanthue-api';
import d3 from 'd3';
import chroma from 'chroma-js';

const CAT_20 = ["#D66F87",
"#BDE628",
"#27A3E7",
"#89EBC0",
"#A0915F",
"#F6BE1D",
"#E6B9FB",
"#629E47",
"#59B5BF",
"#A581A6",
"#AEB327",
"#F3D2A3",
"#F990CE",
"#869AF4",
"#A7D2F3",
"#A18C82",
"#E2CB74",
"#F3A19B",
"#FC739B",
"#DECE4D"]

const BREWER_PASTEL1 = ['#fbb4ae','#b3cde3','#ccebc5','#decbe4','#fed9a6','#ffffcc','#e5d8bd','#fddaec','#f2f2f2'];

//Differ between implementations/examples!!
const HCL_LIMITS = {
  hueMin: 0,
  hueMax: 360,
  chromaMin: 0,
  chromaMax: 140,
  lightMin: 0,
  lightMax: 100,
};

const defaultChromaOptions = {
  hueMin: 0,
  hueMax: 360,
  chromaMin: 30,
  chromaMax: 70,
  lightMin: 50,
  lightMax: 60,
  useForceMode: true,
  quality: 50,
};

const IWantHueLimits = {
  hueMin: 0,
  hueMax: 360,
  chromaMin: 0,
  chromaMax: 3,
  lightMin: 0,
  lightMax: 1.5,
};

const defaultIWantHueOptions = {
  hueMin: 0,
  hueMax: 360,
  chromaMin: 0.2,
  chromaMax: 0.7,
  lightMin: 0.8,
  lightMax: 1.2,
  useForceMode: true,
  quality: 50,
};

export default {
  categoryColors(count, options) {
    return categoryColorsByIWantHue(count, options);
    // return extend(BREWER_PASTEL1.map(color => chroma(color)), count, options);
  }
}

function categoryColorsByD3(count, options) {
  return extend(d3.scale.category20().range().map(color => chroma(color)), count, options);
}

function extend(colors, count, options) {
  if (count > colors.length) {
    return colors.concat(categoryColorsByIWantHue(count - colors.length, options));
  }
  return colors;
}

function categoryColorsByIWantHue(count, options) {
  const o = Object.assign({}, defaultIWantHueOptions, options);
  // Generate a color palette
  const colors = iWantHue().generate(
    count,                   // Number of colors to generate
    function(color) {     // This function filters valid colors...
      const hcl = color.hcl();
      return hcl[0]>=o.hueMin && hcl[0]<=o.hueMax &&
             hcl[1]>=o.chromaMin && hcl[1]<=o.chromaMax &&
             hcl[2]>=o.lightMin && hcl[2]<=o.lightMax;
    },
    false,               // Use Force Vector (for k-Means, use true)
    50                   // Color steps (quality)
  );

  // Sort colors by differentiation
  const sortedColors = iWantHue().diffSort(colors);
  // re-create chroma objects as IWantHue depends on earlier version of chroma-js
  return sortedColors.map(color => chroma(color.hex()));
}

/**
* @param count	{integer}	0-Infinity, default	5,	The number of colors the palette should contain
* @param options {object} see below:
* @param options.hueMin	{integer}	0-360, default	0,	The minimum hue for colors in the palette.
* @param options.hueMax	{integer}	0-360, default	360,	The maximum hue for colors in the palette.
* @param options.chromaMin	{integer}	0-100, default	0,	The minimum chroma (color) for colors in the palette.
* @param options.chromaMax	{integer}	0-100, default	100,	The maximum chroma (color) for colors in the palette.
* @param options.lightMin	{integer}	0-100, default	0,	The minimum lightness for colors in the palette.
* @param options.lightMax	{integer}	0-100, default	100,	The maximum lightness for colors in the palette.
* @param options.quality	{integer}	1-Infinity, default	50,	The number of steps for k-means convergence. Will break early if the result has converged.
* @param options.samples	{integer}	1-Infinity, default	800,	The number of color samples to choose from.
*/
function categoryColorsByDistinctColors(count, options) {
  let opts = Object.assign({}, defaultChromaOptions, options, {count});
  return distinctColors(opts);
}

/**
* Get category colors
* @param numCategories {number} The number of category colors
* @param options {object} Optional constraints on the generated colors
* @return {array<chroma>} an array of chroma color objects
* Based on http://tools.medialab.sciences-po.fr/iwanthue/index.php
*/
function categoryColorsByChromasPaletteGenerator(numCategories, options) {
  const o = Object.assign({}, defaultChromaOptions, options);
  o.useForceMode = true; //TODO: k-means broken in paletteGen.

  const colors = paletteGenerator.generate(
    numCategories, // Colors
    function(color){ // This function filters valid colors
      const hcl = color.hcl();
      return hcl[0]>=o.hueMin && hcl[0]<=o.hueMax
        && hcl[1]>=o.chromaMin && hcl[1]<=o.chromaMax
        && hcl[2]>=o.lightMin && hcl[2]<=o.lightMax;
    },
    o.useForceMode, // Using Force Vector instead of k-Means
    o.quality // Steps (quality)
  );
  // Sort colors by differenciation first
  colors = paletteGenerator.diffSort(colors);
  return colors;
}
