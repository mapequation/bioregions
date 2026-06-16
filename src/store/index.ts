import RootStore from './RootStore';
import { createContext, useContext } from 'react';

const store = new RootStore();

export const StoreContext = createContext(store);

export const useStore = () => useContext(StoreContext);

export const useDemoStore = () => {
  // `documentationStore` is only created for non-demo RootStores; accessing
  // `.demoStore` through a bare `!` would throw if it were absent, so guard
  // explicitly to preserve that "throw on missing" behavior with a clearer message.
  const { documentationStore } = useContext(StoreContext);
  if (!documentationStore) {
    throw new Error('useDemoStore: documentationStore is not available');
  }
  return documentationStore.demoStore;
};

export default store;
