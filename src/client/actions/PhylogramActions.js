import {
  SHOW_CLUSTERED_NODES
} from '../constants/ActionTypes';

export function setShowClusteredNodes(showClusteredNodes) {
  return {
    type: SHOW_CLUSTERED_NODES,
    showClusteredNodes,
  }
}
