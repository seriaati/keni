import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as Window & { __pwaPrompt?: Event }).__pwaPrompt = e;
});
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './components/ui/components.css';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ReloadPrompt } from './components/ReloadPrompt';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
        <ReloadPrompt />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
