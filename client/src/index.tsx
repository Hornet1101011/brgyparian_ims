import 'antd/dist/reset.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import reportWebVitals from './reportWebVitals';

// Load runtime config (from /config.json) before rendering the app so
// the app can use a runtime API URL without rebuilding.
async function bootstrap() {
  try {
    const cfgModule = await import('./runtimeConfig');
    if (cfgModule && typeof cfgModule.loadRuntimeConfig === 'function') {
      await cfgModule.loadRuntimeConfig();
    }
  } catch (e) {
    console.warn('Failed to load runtime config (continuing):', e);
  }

  // Dynamically import App after runtime config is loaded so modules that
  // read window.__APP_CONFIG__ at import-time will pick up the value.
  const AppModule = await import('./App');
  const App = AppModule.default;

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  reportWebVitals();
}

bootstrap();
