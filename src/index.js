// import "babel-polyfill";
// import { polyfill } from "es6-promise";
// polyfill();
import { Buffer } from "buffer";
/* eslint-disable */
// @ts-ignore
window.Buffer = Buffer;

import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./client/containers/App";
import configureStore from "./client/store/configureStore";
import ExamplePhylogram from "./client/examples/ExamplePhylogram";
import HighlightStore from "./client/store/HighlightStore";
import "semantic-ui-css/semantic.min.css";
import "./index.css";

const store = configureStore();

const highlightStore = new HighlightStore();
window.hstore = highlightStore;

createRoot(document.getElementById("app")).render(
  <div>
    {/* <App /> is your app entry point */}
    <Provider store={store}>
      <App highlightStore={highlightStore} />
    </Provider>
  </div>
);

createRoot(document.getElementById("example-phylogram")).render(
  <ExamplePhylogram />
);
