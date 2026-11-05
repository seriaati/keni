import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Pencil, Plug, Trash2 } from 'lucide-react';
import { aiConnections as aiConnectionsApi } from '../lib/api';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import type { AIConnection, AIConnectionInput, AIConnectionKind } from '../lib/types';
import { AI_BASE_URL_KINDS, AI_KEY_PLACEHOLDERS, AI_PROVIDERS, aiProviderLabel } from '../lib/utils';

const DEFAULT_BASE_URL_PLACEHOLDER: Partial<Record<AIConnectionKind, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  openai_compatible: 'http://localhost:11434/v1',
};

interface AIConnectionModalProps {
  onClose: () => void;
  /** Connection being edited; null to create a new one. */
  connection: AIConnection | null;
  onSave: (data: Partial<AIConnectionInput>) => Promise<void>;
}

export function AIConnectionModal({ onClose, connection, onSave }: AIConnectionModalProps) {
  const { t } = useTranslation();
  // Mounted only while open, so initial state comes straight from the props.
  const [name, setName] = useState(connection?.name ?? '');
  const [kind, setKind] = useState<AIConnectionKind>(connection?.kind ?? 'openai_compatible');
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supportsBaseUrl = AI_BASE_URL_KINDS.includes(kind);
  const baseUrlRequired = kind === 'openai_compatible';
  const keyOptional = kind === 'openai_compatible';
  const editing = connection !== null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { models } = await aiConnectionsApi.testModels({
        kind,
        base_url: supportsBaseUrl ? baseUrl.trim() || null : null,
        api_key: clearKey ? '' : apiKey || undefined,
        connection_id: editing && !clearKey && !apiKey ? connection.id : undefined,
      });
      setTestResult({ ok: true, message: t('settings.aiConnTestOk', { count: models.length }) });
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : t('settings.aiConnTestFailed') });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError(t('settings.aiConnNameRequired')); return; }
    if (baseUrlRequired && !baseUrl.trim()) { setError(t('settings.aiConnBaseUrlRequired')); return; }
    if (!editing && !keyOptional && !apiKey) { setError(t('settings.aiToastKeyRequired')); return; }
    setSaving(true);
    setError(null);
    try {
      const data: Partial<AIConnectionInput> = {
        name: name.trim(),
        kind,
        base_url: supportsBaseUrl ? baseUrl.trim() || null : null,
      };
      if (apiKey) data.api_key = apiKey;
      else if (clearKey) data.api_key = '';
      await onSave(data);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('settings.aiConnEditTitle') : t('settings.aiConnAddTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={handleTest} loading={testing} style={{ marginRight: 'auto' }}>
            <Plug size={14} /> {t('settings.aiConnTest')}
          </Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} loading={saving}>{t('common.save')}</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="input-group">
          <label className="input-label">{t('settings.aiProviderLabel')}</label>
          <Select value={kind} onChange={(v) => { setKind(v as AIConnectionKind); setTestResult(null); }} options={AI_PROVIDERS} />
        </div>

        <div className="input-group">
          <label className="input-label">{t('settings.aiConnNameLabel')}</label>
          <input
            className="input"
            value={name}
            maxLength={100}
            placeholder={kind === 'openai_compatible' ? 'Ollama' : aiProviderLabel(kind)}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {supportsBaseUrl && (
          <div className="input-group">
            <label className="input-label">
              {t('settings.aiConnBaseUrlLabel')} {!baseUrlRequired && t('settings.aiConnOptional')}
            </label>
            <input
              className="input"
              type="url"
              value={baseUrl}
              maxLength={500}
              placeholder={DEFAULT_BASE_URL_PLACEHOLDER[kind]}
              onChange={(e) => { setBaseUrl(e.target.value); setTestResult(null); }}
            />
            <span className="input-hint">{t('settings.aiConnBaseUrlHint')}</span>
          </div>
        )}

        <div className="input-group">
          <label className="input-label">
            {t('settings.aiKeyLabel')}{' '}
            {editing && connection.has_api_key ? t('settings.aiKeyKeepCurrent') : keyOptional && t('settings.aiConnOptional')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              placeholder={editing && connection.api_key_masked ? connection.api_key_masked : AI_KEY_PLACEHOLDERS[kind]}
              value={apiKey}
              disabled={clearKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowKey(!showKey)}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {editing && connection.has_api_key && keyOptional && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13, color: 'var(--ink-light)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => { setClearKey(e.target.checked); if (e.target.checked) setApiKey(''); }}
                style={{ accentColor: 'var(--forest)' }}
              />
              {t('settings.aiConnClearKey')}
            </label>
          )}
        </div>

        {testResult && (
          <span className="input-hint" style={{ color: testResult.ok ? 'var(--forest)' : 'var(--rose)' }}>
            {testResult.message}
          </span>
        )}
        {error && <span className="input-hint" style={{ color: 'var(--rose)' }}>{error}</span>}
      </div>
    </Modal>
  );
}

interface AIConnectionListProps {
  connections: AIConnection[];
  onEdit: (connection: AIConnection) => void;
  onDelete: (connection: AIConnection) => void;
  /** Allow editing shared connections (admin view). */
  manageShared?: boolean;
}

export function AIConnectionList({ connections, onEdit, onDelete, manageShared = false }: AIConnectionListProps) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {connections.map((c) => {
        const editable = manageShared || !c.shared;
        const details = [aiProviderLabel(c.kind), c.base_url, c.api_key_masked].filter(Boolean).join(' · ');
        return (
          <div
            key={c.id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--cream-darker)', background: 'var(--cream)' }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{c.name}</span>
                {c.shared && !manageShared && <span className="badge badge-green">{t('settings.aiConnShared')}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {details}
              </div>
            </div>
            {editable && (
              <>
                <button className="icon-btn" onClick={() => onEdit(c)} aria-label={t('common.edit')}>
                  <Pencil size={15} />
                </button>
                <button className="icon-btn" onClick={() => onDelete(c)} aria-label={t('common.delete')} style={{ color: 'var(--rose)' }}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
