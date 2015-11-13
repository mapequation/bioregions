import paletteGenerator from './paletteGen';
import clamp from 'clamp';

/**
* Get category colors
* @param numCategories {number} The number of category colors
* @param minBrightness {number} The minimum brightness (minimum 0)
* @param maxBrightness {number} The maximum brightness (maximum 1.5)
* @return {array<chroma>} an array of chroma color objects
* Based on http://tools.medialab.sciences-po.fr/iwanthue/index.php
*/
export function categoryColors(numCategories, minBrightness = 0.5, maxBrightness = 1.25) {
  if (minBrightness > maxBrightness)
    [minBrightness, maxBrightness] = [maxBrightness, minBrightness];

  var colors = paletteGenerator.generate(
    numCategories, // Colors
    function(color){ // This function filters valid colors
      var hcl = color.hcl();
      return hcl[0]>=0 && hcl[0]<=360
        && hcl[1]>=0 && hcl[1]<=3
        && hcl[2]>=minBrightness && hcl[2]<=maxBrightness;
    },
    false, // Using Force Vector instead of k-Means
    50 // Steps (quality)
  );
  // Sort colors by differenciation first
  colors = paletteGenerator.diffSort(colors);
  return colors;
}
