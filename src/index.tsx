import '@fontsource/open-sans/300.css';
import '@fontsource/philosopher/700.css';
import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './components/App';
import reportWebVitals from './reportWebVitals';
import { ChakraProvider } from '@chakra-ui/react';
import theme from './theme';
import store, { StoreContext } from './store';

ReactDOM.render(
  <ChakraProvider theme={theme}>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </ChakraProvider>,
  document.getElementById('root'),
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
