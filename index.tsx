import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// These globals are injected at build time by Vite (`define` in vite.config.ts)
// from `package.json#version`. Printing them on boot makes it trivial to
// verify which build is live in a given browser tab (useful when debugging
// stale CDN caches after a deploy).
declare const __APP_VERSION__: string;
declare const __APP_BUILD_TIME__: string;

// Also pin them on window so users can query `window.__SLOP_BOARD_VERSION__`
// in DevTools without having to find the console log.
(window as unknown as Record<string, string>).__SLOP_BOARD_VERSION__ = __APP_VERSION__;
(window as unknown as Record<string, string>).__SLOP_BOARD_BUILD_TIME__ = __APP_BUILD_TIME__;

console.log(
  `%c[Slop Board Pro] v${__APP_VERSION__} · built ${__APP_BUILD_TIME__}`,
  'color:#10b981;font-weight:bold'
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(<App />);
