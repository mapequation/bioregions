import {ERROR_MESSAGE} from '../constants/ActionTypes';

/**
* Create error action
* @param error {Error|string}
*/
export function setError(error, subMessage = "") {
  return {
    type: ERROR_MESSAGE,
    message: error.toString(),
    subMessage
  }
}
