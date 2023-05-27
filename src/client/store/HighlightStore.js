import { observable, action, makeObservable } from "mobx";

// export default class HighlightStore {
//     @observable.ref highlightedCell = null;
//     @observable test = "test";

//     @action
//     highlightCell = (cell) => {
//       this.highlightedCell = cell;
//     }
// }
class HighlightStore {
  highlightedCell = null;

  constructor() {
    makeObservable(this, {
      highlightedCell: observable.ref,
      highlightCell: action,
    })
  }

  highlightCell = (cell) => {
    this.highlightedCell = cell;
  }
}

export default HighlightStore;
