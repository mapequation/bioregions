// import '@fontsource/open-sans/300.css';
import '@fontsource/philosopher/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './components/App';
import { Provider } from '@/components/ui/provider';
import theme from './theme';
import store, { StoreContext } from './store';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Provider system={theme}>
      <StoreContext.Provider value={store}>
        <App />
      </StoreContext.Provider>
    </Provider>
  </StrictMode>,
);
