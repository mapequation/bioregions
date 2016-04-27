import d3 from 'd3';
import R from 'ramda';
import crossfilter from 'crossfilter';
import _ from 'lodash';

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

export function aggregateFromRight(takeWhile, makeRestItem, items) {
  const rest = _.takeRightWhile(items, takeWhile);
  if (rest.length === 0)
    return items;
  let mainItems = _.take(items, items.length - rest.length);
  mainItems.push(makeRestItem(rest));
  return mainItems;
}

export function limitRest(takeWhile, makeRestItem, items) {
  const limitedItems = _.takeWhile(items, takeWhile);
  if (limitedItems.length === items.length)
    return items;
  if (limitedItems.length === 0)
    return [makeRestItem(items)];
  const rest = items.slice(limitedItems.length);
  limitedItems.push(makeRestItem(rest));
  return limitedItems;
}

export function reduceLimitRest(initial, acc, takeWhile, makeRestItem, items) {
  let sum = initial;  
  const limitedItems = _.takeWhile(items, item => {
    const nextSum = acc(sum, item);
    if (takeWhile(nextSum, item)) {
      sum = nextSum;
      return true;
    }
    return false;
  });
  if (limitedItems.length === items.length)
    return items;
  if (limitedItems.length === 0)
    return [makeRestItem(sum, items)];
  const rest = items.slice(limitedItems.length);
  limitedItems.push(makeRestItem(sum, rest));
  return limitedItems;
}
