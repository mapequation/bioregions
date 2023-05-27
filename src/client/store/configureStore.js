import { legacy_createStore as createStore, applyMiddleware, compose } from "redux";
import thunkMiddleware from "redux-thunk";
import rootReducer from "../reducers";
// import { configureStore } from "@reduxjs/toolkit"
// import rootReducer from "./client/reducers";

console.log("!! Configure store")
let createStoreWithMiddleware;

// Configure the dev tools when in DEV mode
if (process.env.NODE_ENV === "development") {
  createStoreWithMiddleware = compose(
    applyMiddleware(thunkMiddleware)
    // window.devToolsExtension ? window.devToolsExtension() : f => f,
    // persistState(window.location.href.match(/[?&]debug_session=([^&]+)\b/))
  )(createStore);
} else {
  // createStoreWithMiddleware = applyMiddleware(thunkMiddleware)(createStore);
  createStoreWithMiddleware = compose(
    applyMiddleware(thunkMiddleware)
    // window.devToolsExtension ? window.devToolsExtension() : f => f,
  )(createStore);
}

export default function configureStore(initialState) {
  console.log("!!! Creating store!")
  const store = createStoreWithMiddleware(rootReducer, initialState);

  if (module.hot) {
    // Enable Webpack hot module replacement for reducers
    module.hot.accept("../reducers", () => {
      const nextRootReducer = require("../reducers/index");
      store.replaceReducer(nextRootReducer);
    });
  }

  return store;
}
