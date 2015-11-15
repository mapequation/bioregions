import {
  CHANGE_GROUP_BY
} from '../constants/ActionTypes';

export function changeGroupBy(groupBy) {
  return {
    type: CHANGE_GROUP_BY,
    groupBy
  }
}
