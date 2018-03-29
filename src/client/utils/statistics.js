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
    const score = (item.count / maxLocalCount) / (keyToGlobalCountMap.get(item[key]) / maxGlobalCount);
    return { [key]: item[key], score, count: item.count };
  });
}

export function topIndicatorItems(key, keyToGlobalCountMap, maxGlobalCount, maxLocalCount, limit, localItems) {
  // const heapselectByScore = crossfilter.heapselect.by(d => d.score);

  // const indicators = indicatorItems(key, keyToGlobalCountMap, maxGlobalCount, maxLocalCount, localItems);
  // return heapselectByScore(indicators, 0, indicators.length, limit)
  //   .sort((a, b) => b.score - a.score);
  const indicators = indicatorItems(key, keyToGlobalCountMap, maxGlobalCount, maxLocalCount, localItems);
  const sortedIndicators = _.sortBy(indicators, ['score', 'count']);
  return sortedIndicators.slice(-10).reverse();
}

export function aggregateFromRight(takeWhile, makeRestItem, items) {
  const rest = _.takeRightWhile(items, takeWhile);
  if (rest.length === 0) {
    return items;
  }
  const mainItems = _.take(items, items.length - rest.length);
  mainItems.push(makeRestItem(rest));
  return mainItems;
}

/**
 * Limit an array to items fulfilling a condition, put
 * the other in a 'rest' item. Rest items will only be created if more than one
 * item doesn't fulfill the condition.
 * @param takeWhile {Function}, the condition to fulfill to not move to rest items
 * @param makeRestItem {Function}, called with the rest items, should return a rest item,
 * e.g. (restItems) => { return { id: 'rest', rest: restItems } }
 * @param items {Array}, the items to limit.
 * @return limitedItems {Array}.
 */
export function limitRest(takeWhile, makeRestItem, items) {
  const limitedItems = _.takeWhile(items, takeWhile);
  if (limitedItems.length >= items.length - 1) // Don't put a single item in rest
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
  if (limitedItems.length >= items.length - 1)
    return items;
  if (limitedItems.length === 0)
    return [makeRestItem(sum, items)];
  const rest = items.slice(limitedItems.length);
  limitedItems.push(makeRestItem(sum, rest));
  return limitedItems;
}

/**
 * Loop over all items, including the rest limited. 
 */
export function forEachLimited(restItemsField = 'rest', items, callback) {
  if (callback === undefined) {
    [restItemsField, items, callback] = ['rest', restItemsField, items];
  }
  _.each(items, (item, i) => {
    if (i === items.length - 1 && item[restItemsField]) {
      _.each(item[restItemsField], callback);
    } else {
      callback(item, i, items);
    }
  });
}

/**
 * Map all items, including the rest limited. 
 */
export function mapLimited(restItemsField = 'rest', items, callback) {
  const res = [];
  forEachLimited(restItemsField, items, item => {
    res.push(callback(item));
  })
  return res;
}

/**
 * Unroll possible rest items to flatten items.
 */
export function unrollRest(restItemsField = 'rest', items) {
  if (items === undefined) {
    [restItemsField, items] = ['rest', restItemsField];
  }
  
  if (items.length === 0 || _.last(items)[restItemsField] === undefined) {
    return items;
  }
  
  const unlimited = [];
  forEachLimited(restItemsField, items, item => {
    unlimited.push(item);
  });
  return unlimited;
}
