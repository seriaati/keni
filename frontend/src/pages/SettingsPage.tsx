import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Eye, EyeOff, Info, Key, Plus, Trash2, User, Bot, Check } from 'lucide-react';
import { users as usersApi, aiProvider as aiProviderApi, tokens as tokensApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { DatePicker } from '../components/ui/DatePicker';
import type { AIProviderResponse, APITokenCreateResponse, APITokenResponse } from '../lib/types';
import { AI_PROVIDERS, fmtDate } from '../lib/utils';
import { getSupportedCurrencies } from '../lib/fx';

export function SettingsPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'ai' | 'tokens'>('profile');

  return (
    <div className="animate-fade-in" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="page-subtitle">{t('settings.subtitle')}</p>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        <button className={`tab ${activeTab === 'profile' ? 'tab-active' : ''}`} onClick={() => setActiveTab('profile')}>
          <User size={14} /> {t('settings.tabProfile')}
        </button>
        <button className={`tab ${activeTab === 'ai' ? 'tab-active' : ''}`} onClick={() => setActiveTab('ai')}>
          <Bot size={14} /> {t('settings.tabAi')}
        </button>
        <button className={`tab ${activeTab === 'tokens' ? 'tab-active' : ''}`} onClick={() => setActiveTab('tokens')}>
          <Key size={14} /> {t('settings.tabTokens')}
        </button>
      </div>

      {activeTab === 'profile' && <ProfileTab user={user} refreshUser={refreshUser} toast={toast} />}
      {activeTab === 'ai' && <AIProviderTab user={user} refreshUser={refreshUser} toast={toast} />}
      {activeTab === 'tokens' && <TokensTab toast={toast} />}
    </div>
  );
}

function InfoTooltip({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setVisible(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [visible]);

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={(e) => { e.stopPropagation(); setVisible((v) => !v); }}
    >
      <Info size={13} style={{ color: 'var(--ink-faint)', cursor: 'help', flexShrink: 0, verticalAlign: 'middle' }} />
      {visible && (
        <span className="info-tooltip-content">{children}</span>
      )}
    </span>
  );
}

const TIMEZONES = Intl.supportedValuesOf('timeZone');

function ProfileTab({ user, refreshUser, toast }: { user: any; refreshUser: () => Promise<void>; toast: (msg: string, type?: any) => void }) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [timezone, setTimezone] = useState<string>(user?.timezone ?? '');
  const [globalCurrency, setGlobalCurrency] = useState<string>(user?.global_currency ?? '');
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSupportedCurrencies().then(setCurrencyOptions);
  }, []);

  const handleSave = async () => {
    if (password && password !== confirmPassword) {
      toast(t('settings.toastPasswordsMismatch'), 'error');
      return;
    }
    setSaving(true);
    try {
      await usersApi.update({
        display_name: displayName || undefined,
        password: password || undefined,
        timezone: timezone || null,
        global_currency: globalCurrency || null,
      });
      await refreshUser();
      setPassword('');
      setConfirmPassword('');
      toast(t('settings.toastProfileSaved'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="input-group">
          <label className="input-label">{t('settings.profileUsername')}</label>
          <input className="input" value={user?.username ?? ''} disabled style={{ opacity: 0.6 }} />
          <span className="input-hint">{t('settings.profileUsernameHint')}</span>
        </div>
        <div className="input-group">
          <label className="input-label">{t('settings.profileDisplayName')}</label>
          <input
            className="input"
            placeholder={t('settings.profileDisplayNamePlaceholder')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>        <div className="input-group">
          <label className="input-label">{t('settings.profileTimezone')}</label>
          <SearchableSelect
            value={timezone}
            onChange={setTimezone}
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
            placeholder={`Browser default (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          />
          <span className="input-hint">{t('settings.profileTimezoneHint')}</span>
        </div>
        <div className="input-group">
          <label className="input-label">{t('settings.profileGlobalCurrency')}</label>
          <SearchableSelect
            value={globalCurrency}
            onChange={setGlobalCurrency}
            options={[{ value: '', label: t('settings.profileGlobalCurrencyNone') }, ...currencyOptions.map((c) => ({ value: c, label: c }))]}
            placeholder={currencyOptions.length === 0 ? 'Loading…' : t('settings.profileGlobalCurrencyNone')}
          />
          <span className="input-hint">{t('settings.profileGlobalCurrencyHint')}</span>
        </div>
        <hr className="divider" />
        <div className="input-group">
          <label className="input-label">{t('settings.profilePassword')}</label>
          <input
            className="input"
            type="password"
            placeholder={t('settings.profilePasswordPlaceholder')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {password && (
          <div className="input-group">
            <label className="input-label">{t('settings.profileConfirmPassword')}</label>
            <input
              className="input"
              type="password"
              placeholder={t('settings.profileConfirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving}>
            {saving && <span className="btn-spinner" />}
            {t('settings.profileSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AIProviderTab({ user, refreshUser, toast }: { user: any; refreshUser: () => Promise<void>; toast: (msg: string, type?: any) => void }) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<AIProviderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({ provider: 'anthropic', model: '', api_key: '', ocr_enabled: false });
  const [customPrompt, setCustomPrompt] = useState<string>(user?.custom_ai_prompt ?? '');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    aiProviderApi.get()
      .then(async (p) => {
        setProvider(p);
        setForm({ provider: p.provider, model: p.model, api_key: '', ocr_enabled: p.ocr_enabled });
        // Fetch available models using the stored key so the user can change model
        setFetchingModels(true);
        try {
          const { models: fetched } = await aiProviderApi.listModels();
          setModels(fetched);
        } catch {
          setModels([]);
        } finally {
          setFetchingModels(false);
        }
      })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!form.api_key) return;
    const timer = setTimeout(async () => {
      setFetchingModels(true);
      try {
        const { models: fetched } = await aiProviderApi.listModels(form.api_key, form.provider);
        setModels(fetched);
        setForm((f) => ({ ...f, model: fetched.includes(f.model) ? f.model : (fetched[0] ?? '') }));
      } catch {
        setModels([]);
      } finally {
        setFetchingModels(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.api_key, form.provider]);

  const handleSave = async () => {
    if (!form.api_key && !provider) { toast(t('settings.aiToastKeyRequired'), 'error'); return; }
    if (!form.model) { toast(t('settings.aiToastModelRequired'), 'error'); return; }
    setSaving(true);
    try {
      const updated = await aiProviderApi.upsert({
        provider: form.provider,
        model: form.model,
        api_key: form.api_key || undefined,
        ocr_enabled: form.ocr_enabled,
      });
      setProvider(updated);
      setForm((f) => ({ ...f, api_key: '' }));
      // Re-fetch models using the (possibly new) stored key
      setFetchingModels(true);
      try {
        const { models: fetched } = await aiProviderApi.listModels();
        setModels(fetched);
      } catch {
        setModels([]);
      } finally {
        setFetchingModels(false);
      }
      toast(t('settings.aiToastSaved'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await aiProviderApi.delete();
      setProvider(null);
      setModels([]);
      setForm({ provider: 'anthropic', model: '', api_key: '', ocr_enabled: true });
      toast(t('settings.aiToastRemoved'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="skeleton" style={{ height: 200, borderRadius: 14 }} />;

  const modelOptions = models.length > 0 ? models : (provider && !form.api_key ? [provider.model] : []);

  return (
    <>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {provider && (
          <div style={{ background: 'oklch(96% 0.04 155)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Check size={16} style={{ color: 'var(--forest)' }} />
            <div>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--forest)' }}>
                {t('settings.aiConfigured', { provider: AI_PROVIDERS.find((p) => p.value === provider.provider)?.label ?? provider.provider })}
              </span>
              <span style={{ fontSize: 12, color: 'var(--forest-light)', display: 'block' }}>
                {t('settings.aiConfiguredDetails', {
                  model: provider.model,
                  key: provider.api_key_masked,
                  ocr: provider.ocr_enabled ? t('settings.aiOcrOn') : t('settings.aiOcrOff'),
                })}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={saving} style={{ marginLeft: 'auto', color: 'var(--rose)' }}>
              {t('settings.aiRemove')}
            </button>
          </div>
        )}

        <div className="input-group">
          <label className="input-label">{t('settings.aiProviderLabel')}</label>
          <Select
            value={form.provider}
            onChange={(v) => setForm({ ...form, provider: v, model: '' })}
            options={AI_PROVIDERS}
          />
        </div>

        <div className="input-group">
          <label className="input-label">{t('settings.aiKeyLabel')} {provider && t('settings.aiKeyKeepCurrent')}</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showKey ? 'text' : 'password'}
              placeholder={provider ? '••••••••••••' : { anthropic: 'sk-ant-...', gemini: 'AIza...', openai: 'sk-...', openrouter: 'sk-or-...' }[form.provider] ?? 'API key...'}
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              style={{ paddingRight: 40 }}
            />
            <button
              className="icon-btn"
              onClick={() => setShowKey(!showKey)}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          {fetchingModels && (
            <span className="input-hint">{t('settings.aiKeyFetching')}</span>
          )}
          {!fetchingModels && models.length === 0 && form.api_key && (
            <span className="input-hint" style={{ color: 'var(--rose)' }}>{t('settings.aiKeyFetchFailed')}</span>
          )}
          <span className="input-hint">
            {t('settings.aiKeyHintText')}{' '}
            <a href="https://www.seria.moe/posts/share/free-llm" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--forest)' }}>
              {t('settings.aiKeyHintLink')}
            </a>
          </span>
        </div>

        <div className="input-group">
          <label className="input-label">{t('settings.aiModelLabel')}</label>
          <SearchableSelect
            value={form.model}
            onChange={(v) => setForm({ ...form, model: v })}
            options={modelOptions.map((m) => ({ value: m, label: m }))}
            placeholder={fetchingModels ? t('settings.aiModelLoading') : t('settings.aiModelPlaceholder')}
            disabled={modelOptions.length === 0}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={form.ocr_enabled}
                onChange={(e) => setForm({ ...form, ocr_enabled: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--forest)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 14, color: 'var(--ink)' }}>
                {t('settings.aiOcrLabel')}
              </span>
            </label>
            <InfoTooltip>
              {t('settings.aiOcrTooltip')}
            </InfoTooltip>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving}>
              {saving && <span className="btn-spinner" />}
              {provider ? t('settings.aiUpdate') : t('settings.aiSave')}
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{t('settings.customPromptTitle')}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{t('settings.customPromptDesc')}</div>
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder={t('settings.customPromptPlaceholder')}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'right', marginTop: 4 }}>{customPrompt.length}/500</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-md" onClick={async () => {
            setSavingPrompt(true);
            try {
              await usersApi.update({ custom_ai_prompt: customPrompt || null });
              await refreshUser();
              toast(t('settings.toastPromptSaved'), 'success');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Failed', 'error');
            } finally {
              setSavingPrompt(false);
            }
          }} disabled={savingPrompt}>
            {savingPrompt && <span className="btn-spinner" />}
            {t('settings.customPromptSave')}
          </button>
        </div>
      </div>
    </>
  );
}

function TokensTab({ toast }: { toast: (msg: string, type?: any) => void }) {
  const { t } = useTranslation();
  const [tokenList, setTokenList] = useState<APITokenResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newToken, setNewToken] = useState<APITokenCreateResponse | null>(null);
  const [form, setForm] = useState({ name: '', expires_at: '' });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setTokenList(await tokensApi.list()); }
    catch { toast(t('settings.toastTokenLoadFailed'), 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const created = await tokensApi.create({ name: form.name, expires_at: form.expires_at || undefined });
      setNewToken(created);
      setShowCreate(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await tokensApi.revoke(id);
      toast(t('settings.toastTokenRevoked'), 'success');
      await load();
    } catch {
      toast(t('settings.toastTokenRevokeFailed'), 'error');
    }
  };

  const copyToken = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {newToken && (
        <div style={{ background: 'oklch(96% 0.04 155)', borderRadius: 12, border: '1px solid oklch(88% 0.06 155)', padding: '16px 20px' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--forest)', marginBottom: 8 }}>
            {t('settings.tokenCreatedBanner')}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 12, background: 'white', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cream-darker)', wordBreak: 'break-all', color: 'var(--ink)' }}>
              {newToken.token}
            </code>
            <button className="btn btn-secondary btn-sm" onClick={copyToken}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('common.copied') : t('common.copy')}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setNewToken(null)} style={{ marginTop: 8 }}>
            {t('common.dismiss')}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-md" onClick={() => { setForm({ name: '', expires_at: '' }); setShowCreate(true); }}>
          <Plus size={16} /> {t('settings.tokensNew')}
        </button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      ) : tokenList.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px', background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)' }}>
          <Key size={32} className="empty-state-icon" />
          <p className="empty-state-title">{t('settings.tokensEmptyTitle')}</p>
          <p className="empty-state-desc">{t('settings.tokensEmptyDesc')}</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
          {tokenList.map((token, i) => (
            <div
              key={token.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderBottom: i < tokenList.length - 1 ? '1px solid var(--cream)' : 'none',
              }}
            >
              <Key size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{token.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  {t('settings.tokenCreatedDate', { date: fmtDate(token.created_at) })}
                  {token.last_used && ` · ${t('settings.tokenLastUsed', { date: fmtDate(token.last_used) })}`}
                  {token.expires_at && ` · ${t('settings.tokenExpires', { date: fmtDate(token.expires_at) })}`}
                </div>
              </div>
              <button className="icon-btn" onClick={() => handleRevoke(token.id)} style={{ color: 'var(--rose)' }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={t('settings.tokenModalTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-md" onClick={handleCreate} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />} {t('settings.tokenCreateBtn')}
            </button>
          </>
        }
      >
        <div className="input-group">
          <label className="input-label">{t('settings.tokenNameLabel')}</label>
          <input className="input" placeholder={t('settings.tokenNamePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">{t('settings.tokenExpiryLabel')}</label>
          <DatePicker
            value={form.expires_at}
            onChange={(v) => setForm({ ...form, expires_at: v })}
          />
        </div>
      </Modal>
    </div>
  );
}
