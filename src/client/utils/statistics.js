import d3 from 'd3';
import R from 'ramda';
import crossfilter from 'crossfilter';


export function topSortedBy(key, limit, items) {
  var heapselectBy = crossfilter.heapselect.by(key);
  return heapselectBy(items, 0, items.length, limit)
    .sort((a, b) => key(b) - key(a));
}

export function countBy(key, items) {
  // d3.nest()
  //   .key(countBy)
  //   .entries(items)

  let getCountedItems = R.pipe(
    R.countBy(key),
    R.toPairs,
    R.map(pair => { return {name: pair[0], count: pair[1]}; })
  );
  return getCountedItems(items);
}

export function sortedCountBy(key, items) {
  return countBy(key, items).sort((a, b) => b.count - a.count);
}

export function topSortedCountBy(key, limit, items) {
  let countedItems = countBy(key, items);
  var heapselectByCount = crossfilter.heapselect.by(d => d.count);
  return heapselectByCount(countedItems, 0, countedItems.length, limit)
      .sort((a, b) => b.count - a.count);
}

export function indicatorItems(key, keyToGlobalCountMap, maxGlobalCount, maxLocalCount, localItems) {
  return localItems.map(item => {
    // tfidf-like score
    let score = (item.count / maxLocalCount) / (keyToGlobalCountMap.get(item[key]) / maxGlobalCount);
    return {[key]: item[key], score};
  });
}

export function topIndicatorItems(key, keyToGlobalCountMap, maxGlobalCount, maxLocalCount, limit, localItems) {
  const heapselectByScore = crossfilter.heapselect.by(d => d.score);

  let indicators = indicatorItems(key, keyToGlobalCountMap, maxGlobalCount, maxLocalCount, localItems)
  return heapselectByScore(indicators, 0, indicators.length, limit)
    .sort((a, b) => b.score - a.score);
}
