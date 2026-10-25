import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useToast } from '../components/ui/Toast';
import { users } from '../lib/api';
import type { UserResponse } from '../lib/types';
import { AuthHeader, AuthLayout } from '../components/AuthLayout';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

function getAccessToken(): string | null {
  return localStorage.getItem('access_token');
}

type Mode = 'loading' | 'logged-in' | 'login-required' | 'denied' | 'error';

interface AuthorizationRequest {
  client_name: string | null;
  redirect_uri: string;
  scopes: string[];
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

export function OAuthAuthorizePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request') ?? '';

  const [mode, setMode] = useState<Mode>('loading');
  const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(null);
  const [currentUser, setCurrentUser] = useState<UserResponse | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!requestId) {
      setMode('error');
      return;
    }
    // Client name and redirect URI come from the server, never from the link, so a crafted link
    // can't show one app's name while sending access somewhere else.
    fetch(`${BASE}/oauth/requests/${encodeURIComponent(requestId)}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<AuthorizationRequest>;
      })
      .then(async (req) => {
        setAuthRequest(req);
        if (!getAccessToken()) {
          setMode('login-required');
          return;
        }
        try {
          setCurrentUser(await users.me());
          setMode('logged-in');
        } catch {
          setMode('login-required');
        }
      })
      .catch(() => setMode('error'));
  }, [requestId]);

  const handleDeny = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/oauth/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? t('oauth.authFailed'));
      }
      const { redirect_uri } = await res.json();
      setMode('denied');
      window.location.href = redirect_uri;
    } catch (err) {
      toast(err instanceof Error ? err.message : t('oauth.authFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveWithSession = async () => {
    setSubmitting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${BASE}/oauth/approve/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? t('oauth.authFailed'));
      }
      const { redirect_uri } = await res.json();
      window.location.href = redirect_uri;
    } catch (err) {
      toast(err instanceof Error ? err.message : t('oauth.authFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveWithCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/oauth/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? t('oauth.invalidCredentials'));
      }
      const { redirect_uri } = await res.json();
      window.location.href = redirect_uri;
    } catch (err) {
      toast(err instanceof Error ? err.message : t('oauth.authFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const scopeLabels: Record<string, string> = {
    user: t('oauth.scopeUser'),
  };
  const clientName = authRequest?.client_name || t('oauth.unknownClient');
  const scopes = authRequest?.scopes ?? [];

  const clientStrong = <strong style={{ color: 'var(--ink)', fontWeight: 600 }} />;

  const requesting = (
    <Trans i18nKey="oauth.requesting" values={{ client: clientName }} components={{ b: clientStrong }} />
  );

  const permissions = (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--cream-darker)',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t('oauth.permissionsRequested')}
      </p>
      {scopes.map((s) => (
        <div key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0, marginTop: 7 }} />
          <span style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
            {scopeLabels[s] ?? s}
          </span>
        </div>
      ))}
      {authRequest && (
        <p style={{ fontSize: 12, color: 'var(--ink-light)', borderTop: '1px solid var(--cream-darker)', paddingTop: 8, marginTop: 2 }}>
          <Trans
            i18nKey="oauth.accessGoesTo"
            values={{ host: hostOf(authRequest.redirect_uri) }}
            components={{ b: <strong title={authRequest.redirect_uri} style={{ color: 'var(--ink-mid)', fontWeight: 600, wordBreak: 'break-all' }} /> }}
          />
        </p>
      )}
    </div>
  );

  return (
    <AuthLayout>
      {mode === 'loading' && (
        <p style={{ color: 'var(--ink-light)', fontSize: 14, textAlign: 'center' }}>{t('oauth.loading')}</p>
      )}

      {mode === 'error' && (
        <AuthHeader title={t('oauth.errorTitle')} subtitle={t('oauth.errorDesc')} />
      )}

      {mode === 'denied' && (
        <AuthHeader
          clientName={clientName}
          title={t('oauth.deniedTitle')}
          subtitle={<Trans i18nKey="oauth.deniedDesc" values={{ client: clientName }} components={{ b: clientStrong }} />}
        />
      )}

      {mode === 'logged-in' && currentUser && (
        <>
          <AuthHeader
            clientName={clientName}
            title={t('oauth.greeting', { name: currentUser.display_name ?? currentUser.username })}
            subtitle={requesting}
          />

          {permissions}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleApproveWithSession}
              disabled={submitting}
              style={{ width: '100%' }}
            >
              {submitting && <span className="btn-spinner" />}
              {t('oauth.authorize')}
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={handleDeny}
              disabled={submitting}
              style={{ width: '100%' }}
            >
              {t('oauth.deny')}
            </button>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => { setCurrentUser(null); setMode('login-required'); }}
              style={{ fontSize: 13, color: 'var(--ink-light)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--sand)', textUnderlineOffset: 3 }}
            >
              {t('oauth.notYou')}
            </button>
          </div>
        </>
      )}

      {mode === 'login-required' && (
        <>
          <AuthHeader clientName={clientName} title={t('oauth.signInTitle')} subtitle={requesting} />

          {permissions}

          <form onSubmit={handleApproveWithCredentials} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label className="input-label">{t('login.usernameLabel')}</label>
              <input
                className="input"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
              />
            </div>

            <div className="input-group">
              <label className="input-label">{t('login.passwordLabel')}</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={submitting}
                style={{ width: '100%' }}
              >
                {submitting && <span className="btn-spinner" />}
                {t('oauth.signInAuthorize')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={handleDeny}
                disabled={submitting}
                style={{ width: '100%' }}
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
