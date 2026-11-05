import logoLightSrc from '../assets/logo.svg';
import logoDarkSrc from '../assets/logo-white.svg';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, setGuestLocale } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useBackButton } from '../lib/native';
import { cn } from '../lib/utils';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  // The Android app's Back leaves the app here: the history behind the login is the signed-in app.
  useBackButton(() => false);
  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      padding: '64px 24px 40px',
      background: 'var(--cream)',
    }}>
      <LanguageMenu />
      <main style={{
        width: '100%',
        maxWidth: 360,
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        animation: 'fadeIn 0.3s ease both',
      }}>
        {children}
      </main>
    </div>
  );
}

function LanguageMenu() {
  const { t, i18n } = useTranslation();
  // hover previews the menu; a click pins it open until an outside click, Escape, or a pick
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const open = hovered || pinned;

  const close = () => {
    setHovered(false);
    setPinned(false);
  };

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinned]);

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
      // hover only for real mice: a tap also fires pointerenter, which would fight the click toggle
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <button
        type="button"
        className="icon-btn icon-btn-lg"
        aria-label={t('settings.profileLanguage')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (pinned ? close() : setPinned(true))}
        style={{ width: 'auto', padding: '0 8px 0 10px', gap: 4 }}
      >
        <Globe size={18} />
        <ChevronDown size={14} style={{ transition: 'transform 0.15s ease', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        // paddingTop bridges the gap so the pointer can travel to the menu without closing it
        <div style={{ position: 'absolute', top: '100%', right: 0, paddingTop: 4 }}>
          <div className="wallet-dropdown" style={{ position: 'static', minWidth: 140, padding: 4 }}>
            {SUPPORTED_LOCALES.map((l) => (
              <button
                key={l.value}
                type="button"
                lang={l.value}
                aria-pressed={i18n.resolvedLanguage === l.value}
                className={cn('wallet-option', i18n.resolvedLanguage === l.value && 'wallet-option-active')}
                style={{ borderRadius: 'var(--radius-sm)' }}
                onClick={() => {
                  setGuestLocale(l.value);
                  close();
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AuthHeader({ title, subtitle, clientName }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  clientName?: string;
}) {
  const logoSrc = useTheme() === 'dark' ? logoDarkSrc : logoLightSrc;
  const logo = <img src={logoSrc} alt="Keni" width="44" height="44" style={{ display: 'block' }} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {clientName && (
          <>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--cream-dark)',
              border: '1px solid var(--cream-darker)',
              fontFamily: 'var(--font-display)',
              fontSize: 25,
              color: 'var(--ink)',
            }}>
              {clientName.charAt(0).toUpperCase()}
            </div>
            <span style={{ width: 34, borderTop: '1.5px dashed var(--sand)' }} />
          </>
        )}
        {logo}
      </div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 34, lineHeight: 1.1, color: 'var(--ink)' }}>
        {title}
      </h1>
      {subtitle && <p style={{ fontSize: 14, color: 'var(--ink-light)' }}>{subtitle}</p>}
    </div>
  );
}
