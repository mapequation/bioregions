import { observable, action, decorate } from "mobx";

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

  highlightCell = (cell) => {
    this.highlightedCell = cell;
  }
}

export default decorate(HighlightStore, {
  highlightedCell: observable.ref,
  highlightCell: action,
});
