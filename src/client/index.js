// import 'babel-polyfill';
// import {polyfill} from 'es6-promise';
// polyfill();
import React from "react";
import { render } from "react-dom";
import { Provider } from "react-redux";
import App from "./containers/App";
import configureStore from "./store/configureStore";
import ExamplePhylogram from "./examples/ExamplePhylogram";
import HighlightStore from "./store/HighlightStore";

const store = configureStore();

const highlightStore = new HighlightStore();
window.hstore = highlightStore;

render(
  <div>
    {/* <App /> is your app entry point */}
    <Provider store={store}>
      <App highlightStore={highlightStore} />
    </Provider>
  </div>,
  document.getElementById("app")
);

render(<ExamplePhylogram />, document.getElementById("example-phylogram"));
