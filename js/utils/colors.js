import paletteGenerator from './paletteGen';

const HCL_LIMITS = {
  minHue: 0,
  maxHue: 360,
  minChroma: 0,
  maxChroma: 140,
  minLightness: 0,
  maxLightness: 100
}

var defaultChromaOptions = {
  minHue: 0,
  maxHue: 360,
  minChroma: 20,
  maxChroma: 50,
  minLightness: 65,
  maxLightness: 70,
  useForceMode: true,
  quality: 50
}

module.exports = {
  /**
  * Get category colors
  * @param numCategories {number} The number of category colors
  * @param options {object} Optional constraints on the generated colors
  * @return {array<chroma>} an array of chroma color objects
  * Based on http://tools.medialab.sciences-po.fr/iwanthue/index.php
  */
  categoryColors: function(numCategories, options) {
    var o = Object.assign({}, defaultChromaOptions, options);
    o.useForceMode = true; //TODO: k-means broken in paletteGen.

    var colors = paletteGenerator.generate(
      numCategories, // Colors
      function(color){ // This function filters valid colors
        var hcl = color.hcl();
        return hcl[0]>=o.minHue && hcl[0]<=o.maxHue
          && hcl[1]>=o.minChroma && hcl[1]<=o.maxChroma
          && hcl[2]>=o.minLightness && hcl[2]<=o.maxLightness;
      },
      o.useForceMode, // Using Force Vector instead of k-Means
      o.quality // Steps (quality)
    );
    // Sort colors by differenciation first
    colors = paletteGenerator.diffSort(colors);
    return colors;
  }
};
