import { combineReducers } from 'redux';
import files from './files';
import data from './data';
import worldmap from './worldmap';
import phylogram from './phylogram';
import { ERROR_MESSAGE, RESET_ERROR_MESSAGE } from '../constants/ActionTypes';


// Updates error message to notify about the failed fetches.
function errorMessage(state = null, action) {
  const { type, message } = action;

  if (type === ERROR_MESSAGE) {
    console.log("Got error:", message);
    // window.alert(`Internal error:\n  ${message}\n\nPlease contact us with the message above.`);
    return message;
  }
  if (type === RESET_ERROR_MESSAGE) {
    console.log("Reset errors");
    return null;
  }

  return state;
}


const rootReducer = combineReducers({
  files,
  data,
  worldmap,
  phylogram,
  errorMessage,
});

export default rootReducer;
