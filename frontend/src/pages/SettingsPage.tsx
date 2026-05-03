import { useEffect, useRef, useState } from 'react';
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
  const { user, refreshUser } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'ai' | 'tokens'>('profile');

  return (
    <div className="animate-fade-in" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Manage your profile, AI provider, and API access</p>
      </div>

      <div className="tabs" style={{ marginBottom: 24 }}>
        <button className={`tab ${activeTab === 'profile' ? 'tab-active' : ''}`} onClick={() => setActiveTab('profile')}>
          <User size={14} /> Profile
        </button>
        <button className={`tab ${activeTab === 'ai' ? 'tab-active' : ''}`} onClick={() => setActiveTab('ai')}>
          <Bot size={14} /> AI Provider
        </button>
        <button className={`tab ${activeTab === 'tokens' ? 'tab-active' : ''}`} onClick={() => setActiveTab('tokens')}>
          <Key size={14} /> API Tokens
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
      toast('Passwords do not match', 'error');
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
      toast('Profile updated', 'success');
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
          <label className="input-label">Username</label>
          <input className="input" value={user?.username ?? ''} disabled style={{ opacity: 0.6 }} />
          <span className="input-hint">Username cannot be changed</span>
        </div>
        <div className="input-group">
          <label className="input-label">Display name</label>
          <input
            className="input"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>        <div className="input-group">
          <label className="input-label">Timezone</label>
          <SearchableSelect
            value={timezone}
            onChange={setTimezone}
            options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
            placeholder={`Browser default (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
          />
          <span className="input-hint">Used for "today's date" in AI transaction parsing</span>
        </div>
        <div className="input-group">
          <label className="input-label">Global currency</label>
          <SearchableSelect
            value={globalCurrency}
            onChange={setGlobalCurrency}
            options={[{ value: '', label: '— None —' }, ...currencyOptions.map((c) => ({ value: c, label: c }))]}
            placeholder={currencyOptions.length === 0 ? 'Loading…' : '— None —'}
          />
          <span className="input-hint">When set, transaction amounts are shown with a converted value next to them</span>
        </div>
        <hr className="divider" />
        <div className="input-group">
          <label className="input-label">New password</label>
          <input
            className="input"
            type="password"
            placeholder="Leave blank to keep current"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {password && (
          <div className="input-group">
            <label className="input-label">Confirm password</label>
            <input
              className="input"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving}>
            {saving && <span className="btn-spinner" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function AIProviderTab({ user, refreshUser, toast }: { user: any; refreshUser: () => Promise<void>; toast: (msg: string, type?: any) => void }) {
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
    if (!form.api_key && !provider) { toast('API key is required', 'error'); return; }
    if (!form.model) { toast('Select a model', 'error'); return; }
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
      toast('AI provider saved', 'success');
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
      toast('AI provider removed', 'success');
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
                {AI_PROVIDERS.find((p) => p.value === provider.provider)?.label ?? provider.provider} configured
              </span>
              <span style={{ fontSize: 12, color: 'var(--forest-light)', display: 'block' }}>
                Model: {provider.model} · Key: {provider.api_key_masked} · OCR: {provider.ocr_enabled ? 'on' : 'off'}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleDelete} disabled={saving} style={{ marginLeft: 'auto', color: 'var(--rose)' }}>
              Remove
            </button>
          </div>
        )}

        <div className="input-group">
          <label className="input-label">Provider</label>
          <Select
            value={form.provider}
            onChange={(v) => setForm({ ...form, provider: v, model: '' })}
            options={AI_PROVIDERS}
          />
        </div>

        <div className="input-group">
          <label className="input-label">API Key {provider && '(leave blank to keep current)'}</label>
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
            <span className="input-hint">Fetching available models…</span>
          )}
          {!fetchingModels && models.length === 0 && form.api_key && (
            <span className="input-hint" style={{ color: 'var(--rose)' }}>Could not fetch models — check your API key</span>
          )}
          <span className="input-hint">
            Need a free API key?{' '}
            <a href="https://www.seria.moe/posts/share/free-llm" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--forest)' }}>
              Learn how to get one for free
            </a>
          </span>
        </div>

        <div className="input-group">
          <label className="input-label">Model</label>
          <SearchableSelect
            value={form.model}
            onChange={(v) => setForm({ ...form, model: v })}
            options={modelOptions.map((m) => ({ value: m, label: m }))}
            placeholder={fetchingModels ? '— loading models… —' : '— enter API key to load models —'}
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
                Use OCR for image parsing
              </span>
            </label>
            <InfoTooltip>
              By turning this on, Keni will parse the provided image with OCR, then give the LLM the extracted text. This can save tokens by not using the LLM's vision model. However, OCR only works well against digital content like screenshots — results are often bad for real-life photos like receipts. Based on personal experience, Gemini has the best vision model.
            </InfoTooltip>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving}>
              {saving && <span className="btn-spinner" />}
              {provider ? 'Update provider' : 'Save provider'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Custom AI Prompt</div>
          <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Instructions applied to every AI expense parsing (e.g. "Always use USD", "Categorize Uber as Transport")</div>
        </div>
        <div className="input-group" style={{ marginBottom: 0 }}>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            placeholder='e.g. "Always use JPY as currency" or "Categorize Uber as Transport"'
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
              toast('Custom prompt saved', 'success');
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Failed', 'error');
            } finally {
              setSavingPrompt(false);
            }
          }} disabled={savingPrompt}>
            {savingPrompt && <span className="btn-spinner" />}
            Save prompt
          </button>
        </div>
      </div>
    </>
  );
}

function TokensTab({ toast }: { toast: (msg: string, type?: any) => void }) {
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
    catch { toast('Failed to load tokens', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

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
      toast('Token revoked', 'success');
      await load();
    } catch {
      toast('Failed to revoke', 'error');
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
            ✓ Token created — copy it now, it won't be shown again
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 12, background: 'white', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--cream-darker)', wordBreak: 'break-all', color: 'var(--ink)' }}>
              {newToken.token}
            </code>
            <button className="btn btn-secondary btn-sm" onClick={copyToken}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setNewToken(null)} style={{ marginTop: 8 }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary btn-md" onClick={() => { setForm({ name: '', expires_at: '' }); setShowCreate(true); }}>
          <Plus size={16} /> New token
        </button>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      ) : tokenList.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 16px', background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)' }}>
          <Key size={32} className="empty-state-icon" />
          <p className="empty-state-title">No API tokens</p>
          <p className="empty-state-desc">Create tokens to connect external tools or AI assistants to your Keni.</p>
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
                  Created {fmtDate(token.created_at)}
                  {token.last_used && ` · Last used ${fmtDate(token.last_used)}`}
                  {token.expires_at && ` · Expires ${fmtDate(token.expires_at)}`}
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
        title="New API token"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={handleCreate} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />} Create token
            </button>
          </>
        }
      >
        <div className="input-group">
          <label className="input-label">Token name</label>
          <input className="input" placeholder="e.g. Claude Desktop" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </div>
        <div className="input-group">
          <label className="input-label">Expiry date (optional)</label>
          <DatePicker
            value={form.expires_at}
            onChange={(v) => setForm({ ...form, expires_at: v })}
          />
        </div>
      </Modal>
    </div>
  );
}
