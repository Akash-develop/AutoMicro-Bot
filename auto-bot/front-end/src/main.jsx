import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { isTauri } from './utils/platform.js';

// Set platform immediately (before first render) so CSS can apply correctly.
document.documentElement.setAttribute(
  'data-platform',
  isTauri() ? 'tauri' : 'web'
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
