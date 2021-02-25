import React from 'react';
import './App.css';
import store from '../store';

interface AppProps {}

function App({}: AppProps) {
  // Create the count state.

  return (
    <div className="App">
      Bioregions 2
      { store.result }
    </div>
  );
}

export default App;
