import { useEffect, useRef, useState, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
import { createPortal } from 'react-dom';
import logoSrc from '../assets/logo.svg';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Bot,
  ChevronDown,
  Copy,
  Download,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  Tag,
  Tags,
  Zap,
  Command,
  PlusCircle,
  Plug,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { CommandBar } from './CommandBar';
import { Modal } from './ui/Modal';
import { getInitials } from '../lib/utils';
import './layout.css';

const NAV_AFTER_TRANSACTIONS = [
  { to: '/budgets', icon: Zap, label: 'Budgets' },
  { to: '/recurring', icon: RefreshCw, label: 'Recurring' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/tags', icon: Tags, label: 'Tags' },
  { to: '/chat', icon: Bot, label: 'Chat' },
];

export interface LayoutOutletContext {
  expenseAddedKey: number;
  onExpenseAdded: () => void;
}

export function Layout() {
  const { user, logout } = useAuth();
  const { wallets, activeWallet, setActiveWallet } = useWallet();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expenseAddedKey, setExpenseAddedKey] = useState(0);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => ((window as Window & { __pwaPrompt?: BeforeInstallPromptEvent }).__pwaPrompt ?? null)
  );
  const navigate = useNavigate();
  const walletSelectorRef = useRef<HTMLDivElement>(null);

  const handleExpenseAdded = useCallback(() => {
    setExpenseAddedKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!walletMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (walletSelectorRef.current && !walletSelectorRef.current.contains(e.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [walletMenuOpen]);

  useEffect(() => {
    const handler = (e: Event) => {
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const clearPrompt = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', clearPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', clearPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstallPrompt(null);
  };

  const mcpUrl = (import.meta.env.VITE_MCP_URL as string | undefined) ?? 'http://localhost:8000/mcp';

  const handleCopyMcpUrl = () => {
    void navigator.clipboard.writeText(mcpUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      {/* Sidebar */}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <Link to="/" className="sidebar-logo">
            <img src={logoSrc} alt="" className="sidebar-logo-img" />
            <span className="sidebar-logo-name">Keni</span>
          </Link>
        </div>

        {/* Wallet selector */}
        {wallets.length > 0 && (
          <div className="wallet-selector" ref={walletSelectorRef} onClick={() => setWalletMenuOpen(!walletMenuOpen)}>
            <div className="wallet-selector-inner">
              <div className="wallet-dot" style={{ background: activeWallet ? 'var(--forest)' : 'var(--sand)' }} />
              <div className="wallet-info">
                <span className="wallet-name">{activeWallet?.name ?? 'No wallet'}</span>
                <span className="wallet-currency">{activeWallet?.currency ?? ''}</span>
              </div>
              <ChevronDown size={14} style={{ color: 'var(--ink-faint)', transition: 'transform 0.2s', transform: walletMenuOpen ? 'rotate(180deg)' : 'none' }} />
            </div>
            {walletMenuOpen && (
              <div className="wallet-dropdown">
                {wallets.map((w) => (
                  <button
                    key={w.id}
                    className={`wallet-option ${w.id === activeWallet?.id ? 'wallet-option-active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setActiveWallet(w); setWalletMenuOpen(false); }}
                  >
                    <div className="wallet-dot" style={{ background: w.is_default ? 'var(--forest)' : 'var(--sand-dark)' }} />
                    <span>{w.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-faint)' }}>{w.currency}</span>
                  </button>
                ))}
                <button
                  className="wallet-option"
                  onClick={(e) => { e.stopPropagation(); navigate('/wallets'); setWalletMenuOpen(false); }}
                >
                  <PlusCircle size={13} style={{ color: 'var(--ink-faint)' }} />
                  <span style={{ color: 'var(--ink-light)' }}>Manage wallets</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick add button */}
        <button className="quick-add-btn" onClick={() => setCmdOpen(true)}>
          <span>Add transaction</span>
          <kbd className="kbd-hint">⌘ K</kbd>
        </button>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </NavLink>
          <NavLink
            to={activeWallet ? `/wallets/${activeWallet.id}` : '/wallets'}
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <ArrowLeftRight size={16} />
            Transactions
          </NavLink>
          {NAV_AFTER_TRANSACTIONS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="sidebar-bottom">
          {installPrompt && (
            <button className="nav-item pwa-install-btn" onClick={handleInstall}>
              <Download size={16} />
              Install app
            </button>
          )}
          <button className="nav-item" onClick={() => setMcpOpen(true)}>
            <Plug size={16} />
            MCP
          </button>
          <a
            href="https://github.com/seriaati/keni"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </a>
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <Settings size={16} />
            Settings
          </NavLink>
          {user?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <Settings size={16} />
              Admin
            </NavLink>
          )}
          <div className="user-row">
            <div className="avatar avatar-sm">
              {getInitials(user?.display_name ?? user?.username ?? 'U')}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.display_name ?? user?.username}</span>
              {user?.is_admin && <span className="user-role">Admin</span>}
            </div>
            <button className="icon-btn" onClick={handleLogout} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div className="mobile-overlay" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Main content */}
      <main className="main-content">
        {/* Mobile header */}
        <header className="mobile-header">
          <button className="icon-btn icon-btn-lg" onClick={() => setMobileNavOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link to="/" className="sidebar-logo mobile-header-logo">
            <img src={logoSrc} alt="" className="sidebar-logo-img" />
            <span className="sidebar-logo-name">Keni</span>
          </Link>
          <div className="icon-btn icon-btn-lg" style={{ visibility: 'hidden' }} />
        </header>

        <div className="page-content">
          <Outlet context={{ expenseAddedKey, onExpenseAdded: handleExpenseAdded } satisfies LayoutOutletContext} />
        </div>
      </main>

      {/* Mobile FAB */}
      {createPortal(
        <button className="fab" onClick={() => setCmdOpen(true)} aria-label="Quick add transaction">
          <Command size={22} />
        </button>,
        document.body,
      )}

      <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} onExpenseAdded={handleExpenseAdded} />

      <Modal open={mcpOpen} onClose={() => setMcpOpen(false)} title="MCP Integration" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ color: 'var(--ink-light)', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
            Keni exposes a Model Context Protocol (MCP) server, letting AI assistants like Claude Desktop, Cursor, or any MCP-compatible client read and write your financial data. Authentication is handled via OAuth, no API tokens required.
          </p>

          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Server URL</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--cream-dark, #f5f0e8)', borderRadius: '8px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all' }}>
              <span style={{ flex: 1, color: 'var(--ink)' }}>{mcpUrl}</span>
              <button className="icon-btn" onClick={handleCopyMcpUrl} title="Copy URL" style={{ flexShrink: 0 }}>
                {copied ? <span style={{ fontSize: '11px', color: 'var(--forest)' }}>Copied!</span> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Setup Guide</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--forest)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>1</div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>Configure your MCP client</p>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--ink-light)', lineHeight: '1.5' }}>
                    Add the following to your client's MCP configuration (e.g. <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '4px' }}>claude_desktop_config.json</code> or <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: '4px' }}>mcp.json</code>):
                  </p>
                  <pre style={{ margin: 0, background: 'var(--cream-dark, #f5f0e8)', borderRadius: '8px', padding: '12px', fontSize: '12px', fontFamily: 'monospace', lineHeight: '1.6', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{`{
  "mcpServers": {
    "keni": {
      "type": "http",
      "url": "${mcpUrl}"
    }
  }
}`}</pre>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--forest)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>2</div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>Authorize via OAuth</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-light)', lineHeight: '1.5' }}>
                    Restart your client. The first time it connects, it will open a browser window asking you to sign in and grant access (the OAuth flow). No API token needed.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--forest)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>3</div>
                <div>
                  <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>Start using it</p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink-light)', lineHeight: '1.5' }}>
                    Keni's tools will appear automatically. Ask your AI assistant to list expenses, add transactions, or check budgets.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
