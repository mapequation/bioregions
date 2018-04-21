import {
  CHANGE_INFO_BY,
} from '../constants/ActionTypes';


export function changeInfoBy(infoBy) {
  return {
    type: CHANGE_INFO_BY,
    infoBy,
  };
}
