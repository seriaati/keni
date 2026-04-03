import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bot,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  Tag,
  Tags,
  Wallet,
  Zap,
  Command,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '../contexts/WalletContext';
import { CommandBar } from './CommandBar';
import { getInitials } from '../lib/utils';
import './layout.css';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/wallets', icon: Wallet, label: 'Wallets' },
  { to: '/budgets', icon: Zap, label: 'Budgets' },
  { to: '/recurring', icon: RefreshCw, label: 'Recurring' },
  { to: '/categories', icon: Tag, label: 'Categories' },
  { to: '/tags', icon: Tags, label: 'Tags' },
  { to: '/chat', icon: Bot, label: 'Chat with AI' },
];

export function Layout() {
  const { user, logout } = useAuth();
  const { wallets, activeWallet, setActiveWallet } = useWallet();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();

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
            <span className="sidebar-logo-mark">Z</span>
            <span className="sidebar-logo-text">Zeni</span>
          </Link>
        </div>

        {/* Wallet selector */}
        {wallets.length > 0 && (
          <div className="wallet-selector" onClick={() => setWalletMenuOpen(!walletMenuOpen)}>
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
          <Command size={14} />
          <span>Quick add</span>
          <kbd className="kbd-hint">⌘K</kbd>
        </button>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
          <Link to="/" className="sidebar-logo">
            <span className="sidebar-logo-mark">Z</span>
            <span className="sidebar-logo-text">Zeni</span>
          </Link>
          <button className="icon-btn icon-btn-lg" onClick={() => setCmdOpen(true)}>
            <Command size={18} />
          </button>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* Mobile FAB */}
      <button className="fab" onClick={() => setCmdOpen(true)} aria-label="Quick add expense">
        <Command size={22} />
      </button>

      <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
