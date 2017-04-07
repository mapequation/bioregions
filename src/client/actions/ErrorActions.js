import { ERROR_MESSAGE, RESET_ERROR_MESSAGE } from '../constants/ActionTypes';

/**
* Create error action
* @param message {String}
*/
export function setError(message) {
  return {
    type: ERROR_MESSAGE,
    message,
  };
}

export function resetError() {
  return {
    type: RESET_ERROR_MESSAGE,
  };
}
