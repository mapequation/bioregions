import RootStore from './RootStore';
import { createContext, useContext } from 'react';

const store = new RootStore();

export const StoreContext = createContext(store);

export const useStore = () => useContext(StoreContext);

export const useDemoStore = () =>
  useContext(StoreContext).documentationStore!.demoStore;

export default store;
