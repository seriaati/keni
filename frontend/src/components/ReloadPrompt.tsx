import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './ui/Toast';

export function ReloadPrompt() {
  const toast = useToast();

  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      if (r) {
        setInterval(() => r.update(), 60 * 60 * 1000);
      }
    },
  });

  useEffect(() => {
    if (offlineReady) {
      toast('App installed', 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  if (!needRefresh) return null;

  return (
    <div className="toast-container">
      <div className="toast">
        <RefreshCw size={16} />
        <span style={{ flex: 1 }}>New version available</span>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: 'var(--cream)',
            color: 'var(--ink)',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '4px 10px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
