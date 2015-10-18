import { combineReducers } from 'redux';
import files from './files';
import data from './data';
import worldmap from './worldmap';
import RESET_ERROR_MESSAGE from '../constants/ActionTypes'


// Updates error message to notify about the failed fetches.
function errorMessage(state = null, action) {
  const { type, error } = action;

  if (type === RESET_ERROR_MESSAGE) {
    return null;
  } else if (error) {
    return error;
  }

  return state;
}


const rootReducer = combineReducers({
  files,
  data,
  worldmap,
  errorMessage,
});

export default rootReducer;
