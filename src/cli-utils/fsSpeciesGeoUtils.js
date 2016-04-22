import fsp from 'fs-promise';
import tabularStream from 'tabular-stream';
import sentenceCase from 'sentence-case';
import es from 'event-stream';
import _ from 'lodash';

/**
 * Read species records and return some statistics.
 * @param speciesPath:String The file system path to the species records file (assuming csv/tsv format)
 * @param nameColumn:String The name of the column for the species name.
 * @param normalizeNames normalises species names (Genus_species -> genus species etc). Default true
 * @return stats:Object {
 *  speciesCounts:Object, [name] -> count 
 *  uniqueCount:Number,
 *  totalCount:Number,
 * }
 */
export function getSpeciesCounts(speciesPath, nameColumn, normalizeNames = true) {
  return new Promise((resolve, reject) => {
    const speciesCounts = {};
    let totalCount = 0;
    let uniqueCount = 0;
    const normalize = normalizeNames ? sentenceCase : (name) => name;
    // console.log(`Reading species from ${speciesPath} on column ${nameColumn}...`);
    fsp.createReadStream(speciesPath)
      .pipe(tabularStream())
      .pipe(es.map((row, cb) => {
        ++totalCount;
        // if (count < 5)
        //   console.log(`${count}: ${JSON.stringify(row)} -> (${nameColumn}) ->  ${normalize(row[nameColumn])}`);
        const name = normalize(row[nameColumn]);
        if (!speciesCounts[name]) {
          speciesCounts[name] = 0;
          ++uniqueCount;
        }
        ++speciesCounts[name];
        cb(null, row);
      }))
      .on('error', reject)
      .on('end', () => {
        // console.log(`Collected ${countUnique} unique species from ${count} records.`);
        resolve({
            speciesCounts,
            uniqueCount,
            totalCount,
        });
      });
  });
}

export default {
  getSpeciesCounts,
};