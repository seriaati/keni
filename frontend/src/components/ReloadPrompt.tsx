import { useTranslation } from 'react-i18next';
import { Download, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { applyAppUpdate, useAppUpdate } from '../lib/native';

const BUTTON_STYLE = {
  background: 'var(--cream)',
  color: 'var(--ink)',
  border: 'none',
  borderRadius: 'var(--radius)',
  padding: '4px 10px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export function ReloadPrompt() {
  const { t } = useTranslation();
  const appUpdate = useAppUpdate();

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
  });

  // One at a time, the app first: installing it restarts the app, which also loads the new Keni.
  if (appUpdate) {
    return (
      <div className="toast-container">
        <div className="toast">
          <Download size={16} />
          <span style={{ flex: 1 }}>{t('nav.appUpdateAvailable')}</span>
          <button onClick={() => applyAppUpdate(appUpdate)} style={BUTTON_STYLE}>
            {t('nav.update')}
          </button>
        </div>
      </div>
    );
  }

  if (!needRefresh) return null;

  return (
    <div className="toast-container">
      <div className="toast">
        <RefreshCw size={16} />
        <span style={{ flex: 1 }}>New version available</span>
        <button
          onClick={() => updateServiceWorker(true)}
          style={BUTTON_STYLE}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
