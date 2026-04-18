import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './ui/Toast';

export function ReloadPrompt() {
  const toast = useToast();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
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
      toast('Ready to work offline', 'success');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (needRefresh) {
      toast('New version available — reload to update', 'info');
      updateServiceWorker(true);
      setNeedRefresh(false);
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker, toast]);

  return null;
}
