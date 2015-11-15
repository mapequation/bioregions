import {ERROR_MESSAGE} from '../constants/ActionTypes';

/**
* Create error action
* @param error {Error|string}
*/
export function setError(error) {
  return {
    type: ERROR_MESSAGE,
    message: error.toString()
  }
}
