import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import logoSrc from '../assets/logo-white.svg';

interface OAuthRequestInfo {
    client_id: string;
    scopes: string[];
}

export function OAuthAuthorizePage() {
    const [searchParams] = useSearchParams();
    const requestId = searchParams.get('request_id') ?? '';

    const [requestInfo, setRequestInfo] = useState<OAuthRequestInfo | null>(null);
    const [loadError, setLoadError] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [approveLoading, setApproveLoading] = useState(false);
    const [denied, setDenied] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    useEffect(() => {
        setIsLoggedIn(!!localStorage.getItem('access_token'));
    }, []);

    useEffect(() => {
        if (!requestId) {
            setLoadError('Missing request_id parameter');
            return;
        }
        fetch(`/api/oauth/requests/${requestId}`)
            .then((r) => {
                if (!r.ok) throw new Error('Request not found or expired');
                return r.json() as Promise<OAuthRequestInfo>;
            })
            .then(setRequestInfo)
            .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Failed to load request'));
    }, [requestId]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginLoading(true);
        setLoginError('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const data = (await res.json()) as { detail?: string };
                throw new Error(data.detail ?? 'Login failed');
            }
            const data = (await res.json()) as { access_token: string; refresh_token: string };
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            setIsLoggedIn(true);
        } catch (err) {
            setLoginError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleApprove = async () => {
        setApproveLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const res = await fetch('/api/oauth/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ request_id: requestId }),
            });
            if (!res.ok) throw new Error('Approval failed');
            const data = (await res.json()) as { redirect_url: string };
            window.location.href = data.redirect_url;
        } catch (err) {
            setLoginError(err instanceof Error ? err.message : 'Approval failed');
            setApproveLoading(false);
        }
    };

    const leftPanel = (
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
            <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `radial-gradient(circle at 20% 80%, oklch(42% 0.1 155 / 0.6) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, oklch(52% 0.1 155 / 0.4) 0%, transparent 50%)`,
            }} />
            <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={logoSrc} alt="" width="28" height="28" style={{ borderRadius: 6 }} />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--cream)' }}>Zeni</span>
                </div>
            </div>
            <div style={{ position: 'relative' }}>
                <p style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(24px, 2.5vw, 32px)',
                    color: 'var(--cream)',
                    lineHeight: 1.25,
                    marginBottom: 16,
                    fontStyle: 'italic',
                }}>
                    Authorize access<br />to your finances.
                </p>
                <p style={{ fontSize: 14, color: 'oklch(90% 0.04 155)', lineHeight: 1.6 }}>
                    Claude Desktop wants to read and manage your Zeni data on your behalf.
                </p>
            </div>
        </div>
    );

    if (denied) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', background: 'var(--cream)' }}>
                {leftPanel}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                    <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
                        <p style={{ fontSize: 18, color: 'var(--ink)', marginBottom: 8, fontFamily: 'var(--font-display)' }}>Authorization denied</p>
                        <p style={{ fontSize: 14, color: 'var(--ink-light)' }}>You can close this tab.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', background: 'var(--cream)' }}>
                {leftPanel}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                    <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--rose)' }}>{loadError}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!requestInfo) {
        return (
            <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream)' }}>
                <p style={{ fontSize: 14, color: 'var(--ink-light)' }}>Loading…</p>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100dvh', display: 'flex', background: 'var(--cream)' }}>
            {leftPanel}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                <div style={{ width: '100%', maxWidth: 380, animation: 'fadeIn 0.3s ease both' }}>
                    {!isLoggedIn ? (
                        <>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', marginBottom: 6, fontStyle: 'italic' }}>
                                Sign in first
                            </h1>
                            <p style={{ fontSize: 14, color: 'var(--ink-light)', marginBottom: 32 }}>
                                Log in to authorize <strong>{requestInfo.client_id}</strong>
                            </p>
                            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div className="input-group">
                                    <label className="input-label">Username</label>
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
                                    <label className="input-label">Password</label>
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
                                {loginError && <p style={{ fontSize: 13, color: 'var(--rose)', margin: 0 }}>{loginError}</p>}
                                <button type="submit" className="btn btn-primary btn-lg" disabled={loginLoading} style={{ marginTop: 4, width: '100%' }}>
                                    {loginLoading && <span className="btn-spinner" />}
                                    Sign in & continue
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--ink)', marginBottom: 6, fontStyle: 'italic' }}>
                                Authorize access
                            </h1>
                            <p style={{ fontSize: 14, color: 'var(--ink-light)', marginBottom: 8 }}>
                                <strong>{requestInfo.client_id}</strong> is requesting access to your Zeni data.
                            </p>
                            {requestInfo.scopes.length > 0 && (
                                <div style={{ marginBottom: 28, padding: '12px 16px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                    <p style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requested scopes</p>
                                    {requestInfo.scopes.map((s) => (
                                        <div key={s} style={{ fontSize: 13, color: 'var(--ink)', padding: '2px 0' }}>• {s}</div>
                                    ))}
                                </div>
                            )}
                            {loginError && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 12 }}>{loginError}</p>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <button className="btn btn-primary btn-lg" disabled={approveLoading} style={{ width: '100%' }} onClick={handleApprove}>
                                    {approveLoading && <span className="btn-spinner" />}
                                    Approve
                                </button>
                                <button className="btn btn-lg" style={{ width: '100%' }} onClick={() => setDenied(true)}>
                                    Deny
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
