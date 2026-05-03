import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import logoSrc from '../assets/logo-white.svg';

export function LoginPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await signup(username, password, displayName || undefined);
      }
      navigate('/');
    } catch (err) {
      toast(err instanceof Error ? err.message : t('login.errorGeneric'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      background: 'var(--cream)',
    }}>
      {/* Left panel — decorative */}
      <div style={{
        flex: '0 0 420px',
        background: 'var(--forest)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px',
        position: 'relative',
        overflow: 'hidden',
      }} className="auth-panel-left">
        {/* Background texture */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle at 20% 80%, oklch(42% 0.1 155 / 0.6) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, oklch(52% 0.1 155 / 0.4) 0%, transparent 50%)`,
        }} />

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src={logoSrc} alt="" width="28" height="28" style={{ borderRadius: 6 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--cream)' }}>Keni</span>
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <p style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 3vw, 38px)',
            color: 'var(--cream)',
            lineHeight: 1.25,
            marginBottom: 20,
            fontStyle: 'italic',
          }}>
            {t('login.tagline').split('\n').map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
            ))}
          </p>
          <p style={{ fontSize: 14, color: 'oklch(90% 0.04 155)', lineHeight: 1.6 }}>
            {t('login.taglineDesc').split('\n').map((line, i, arr) => (
              <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
            ))}
          </p>
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            t('login.featureAi'),
            t('login.featureReceipt'),
            t('login.featureChat'),
            t('login.featureWallets'),
          ].map((feat) => (
            <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber-light)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'oklch(88% 0.04 155)' }}>{feat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 380, animation: 'fadeIn 0.3s ease both' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            color: 'var(--ink)',
            marginBottom: 6,
            fontStyle: 'italic',
          }}>
            {mode === 'login' ? t('login.titleLogin') : t('login.titleSignup')}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--ink-light)', marginBottom: 32 }}>
            {mode === 'login'
              ? t('login.subtitleLogin')
              : t('login.subtitleSignup')}
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mode === 'signup' && (
              <div className="input-group">
                <label className="input-label">{t('login.displayNameLabel')}</label>
                <input
                  className="input"
                  type="text"
                  placeholder={t('login.displayNamePlaceholder')}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}

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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ marginTop: 4, width: '100%' }}
            >
              {loading && <span className="btn-spinner" />}
              {mode === 'login' ? t('login.submitLogin') : t('login.submitSignup')}
            </button>
          </form>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: 'var(--ink-light)' }}>
            {mode === 'login' ? (
              <>
                {t('login.noAccount')}{' '}
                <button
                  onClick={() => setMode('signup')}
                  style={{ color: 'var(--forest)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}
                >
                  {t('login.signUp')}
                </button>
              </>
            ) : (
              <>
                {t('login.haveAccount')}{' '}
                <button
                  onClick={() => setMode('login')}
                  style={{ color: 'var(--forest)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontSize: 'inherit' }}
                >
                  {t('login.signIn')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .auth-panel-left { display: none !important; }
        }
      `}</style>
    </div>
  );
}
