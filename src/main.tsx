// import '@fontsource/open-sans/300.css';
import '@fontsource/philosopher/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './components/App';
import reportWebVitals from './reportWebVitals';
import { Provider } from '@/components/ui/provider';
import theme from './theme';
import store, { StoreContext } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider system={theme}>
      <StoreContext.Provider value={store}>
        <App />
      </StoreContext.Provider>
    </Provider>
  </StrictMode>,
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
