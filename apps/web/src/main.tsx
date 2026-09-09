import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { SessionProvider } from './hooks/useSession';
import './lib/installPrompt'; // tiene que engancharse antes de que el navegador dispare beforeinstallprompt
import './styles/app.scss';

// T10.1 — registro manual (injectRegister: false en vite.config.ts): así el
// resto del código de push (lib/push.ts) controla explícitamente cuándo pedir
// permiso, en vez de que el plugin lo dispare por su cuenta.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
