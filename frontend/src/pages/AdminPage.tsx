import { useEffect, useState } from 'react';
import { Shield, Users } from 'lucide-react';
import { admin as adminApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';

export function AdminPage() {
  const toast = useToast();
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getSettings()
      .then((s) => setSignupsEnabled(s.signups_enabled))
      .catch(() => toast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    setSaving(true);
    try {
      const updated = await adminApi.updateSettings({ signups_enabled: !signupsEnabled });
      setSignupsEnabled(updated.signups_enabled);
      toast(`Signups ${updated.signups_enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 560 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Shield size={20} style={{ color: 'var(--forest)' }} />
          <h1 className="page-title" style={{ margin: 0 }}>Admin Settings</h1>
        </div>
        <p className="page-subtitle">Instance-level configuration for your Zeni server</p>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />
      ) : (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'oklch(92% 0.06 155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Users size={20} style={{ color: 'var(--forest)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                New user signups
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                {signupsEnabled
                  ? 'Anyone can create a new account on this instance.'
                  : 'New signups are disabled. Only existing users can log in.'}
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={saving}
              style={{
                width: 48,
                height: 28,
                borderRadius: 100,
                background: signupsEnabled ? 'var(--forest)' : 'var(--cream-darker)',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: 'white',
                position: 'absolute',
                top: 4,
                left: signupsEnabled ? 24 : 4,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>

          <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--cream)', background: 'var(--cream)' }}>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              Tip: Disable signups once your household is set up to prevent unauthorized access.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
