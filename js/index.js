import 'babel-core/polyfill';
import {polyfill} from 'es6-promise';
polyfill();
import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import App from './containers/App';
import configureStore from './store/configureStore';
import {renderDevTools} from './utils/devTools';
import ExamplePhylogram from './examples/ExamplePhylogram';

const store = configureStore();

render(
  <div>
    {/* <App /> is your app entry point */}
    <Provider store={store}>
      <App />
    </Provider>

    {/* only renders when running in DEV mode */
      renderDevTools(store)
    }
  </div>,
  document.getElementById('app')
);

render(
  <ExamplePhylogram/>,
  document.getElementById('example-phylogram')
)
