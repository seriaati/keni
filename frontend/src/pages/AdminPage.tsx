import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Shield, Users } from 'lucide-react';
import { admin as adminApi, adminAiConnections as adminAiConnectionsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { AIConnectionList, AIConnectionModal } from '../components/AIConnectionModal';
import type { AIConnection, AIConnectionInput } from '../lib/types';

export function AdminPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getSettings()
      .then((s) => setSignupsEnabled(s.signups_enabled))
      .catch(() => toast(t('admin.toastLoadFailed'), 'error'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = async () => {
    setSaving(true);
    try {
      const updated = await adminApi.updateSettings({ signups_enabled: !signupsEnabled });
      setSignupsEnabled(updated.signups_enabled);
      toast(updated.signups_enabled ? t('admin.toastSignupsEnabled') : t('admin.toastSignupsDisabled'), 'success');
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
          <h1 className="page-title" style={{ margin: 0 }}>{t('admin.title')}</h1>
        </div>
        <p className="page-subtitle">{t('admin.subtitle')}</p>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 100, borderRadius: 14 }} />
      ) : (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'var(--green-tint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Users size={20} style={{ color: 'var(--forest)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                {t('admin.signupsTitle')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                {signupsEnabled ? t('admin.signupsEnabledDesc') : t('admin.signupsDisabledDesc')}
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
                background: 'var(--surface)',
                position: 'absolute',
                top: 4,
                left: signupsEnabled ? 24 : 4,
                transition: 'left 0.2s',
                boxShadow: 'var(--shadow-sm)',
              }} />
            </button>
          </div>

          <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--cream)', background: 'var(--cream)' }}>
            <p style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              {t('admin.tip')}
            </p>
          </div>
        </div>
      )}

      <SharedAIConnections />
    </div>
  );
}

function SharedAIConnections() {
  const { t } = useTranslation();
  const toast = useToast();
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AIConnection | null>(null);

  const load = () => adminAiConnectionsApi.list()
    .then(setConnections)
    .catch(() => toast(t('admin.toastLoadFailed'), 'error'));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (data: Partial<AIConnectionInput>) => {
    if (editing) await adminAiConnectionsApi.update(editing.id, data);
    else await adminAiConnectionsApi.create(data as AIConnectionInput);
    toast(t('settings.aiConnToastSaved'), 'success');
    await load();
  };

  const handleDelete = async (c: AIConnection) => {
    try {
      await adminAiConnectionsApi.delete(c.id);
      toast(t('settings.aiConnToastDeleted'), 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
  };

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{t('admin.aiConnectionsTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>{t('admin.aiConnectionsDesc')}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus size={14} /> {t('settings.aiConnAdd')}
        </button>
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 60, borderRadius: 10 }} />
      ) : connections.length === 0 ? (
        <span className="input-hint">{t('admin.aiConnectionsEmpty')}</span>
      ) : (
        <AIConnectionList
          connections={connections}
          manageShared
          onEdit={(c) => { setEditing(c); setModalOpen(true); }}
          onDelete={handleDelete}
        />
      )}
      {modalOpen && <AIConnectionModal onClose={() => setModalOpen(false)} connection={editing} onSave={handleSave} />}
    </div>
  );
}
