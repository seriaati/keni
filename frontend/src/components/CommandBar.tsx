import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Image,
  LayoutDashboard,
  Mic,
  MicOff,
  RefreshCw,
  Settings,
  Tag,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { expenses as expensesApi, categories } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from './ui/Toast';
import type { AIExpenseResponse } from '../lib/types';
import { fmt } from '../lib/utils';

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'input' | 'processing' | 'review';

interface ParsedExpense extends AIExpenseResponse {
  categoryId?: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: ['home', 'dashboard', 'overview'] },
  { label: 'Wallets', path: '/wallets', icon: Wallet, keywords: ['wallet', 'money', 'account'] },
  { label: 'Budgets', path: '/budgets', icon: Zap, keywords: ['budget', 'limit', 'spending'] },
  { label: 'Recurring', path: '/recurring', icon: RefreshCw, keywords: ['recurring', 'subscription', 'repeat'] },
  { label: 'Categories', path: '/categories', icon: Tag, keywords: ['category', 'categories'] },
  { label: 'Chat', path: '/chat', icon: Bot, keywords: ['chat', 'ask', 'question', 'ai'] },
  { label: 'Settings', path: '/settings', icon: Settings, keywords: ['settings', 'profile', 'api'] },
];

function looksLikeExpense(text: string): boolean {
  return /\d/.test(text) && !/^(go to|open|show|navigate|find)\s/i.test(text);
}

export function CommandBar({ open, onClose }: CommandBarProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('input');
  const [parsed, setParsed] = useState<ParsedExpense | null>(null);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { activeWallet, wallets, setActiveWallet } = useWallet();
  const navigate = useNavigate();
  const toast = useToast();

  const reset = useCallback(() => {
    setText('');
    setMode('input');
    setParsed(null);
    setError('');
    setImageFile(null);
    setImagePreview(null);
    setSaving(false);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'review') { setMode('input'); return; }
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, mode]);

  const navSuggestions = text.trim()
    ? NAV_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(text.toLowerCase()) ||
          item.keywords.some((k) => k.includes(text.toLowerCase())),
      )
    : NAV_ITEMS.slice(0, 4);

  const handleSubmit = async () => {
    if (!text.trim() && !imageFile) return;
    if (!activeWallet) { setError('No wallet selected'); return; }

    if (!imageFile && !looksLikeExpense(text)) {
      const match = navSuggestions[0];
      if (match) { navigate(match.path); onClose(); return; }
    }

    setMode('processing');
    setError('');
    try {
      const result = await expensesApi.aiParse(activeWallet.id, text || undefined, imageFile || undefined);
      setParsed(result);
      setMode('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse expense');
      setMode('input');
    }
  };

  const handleSave = async () => {
    if (!parsed || !activeWallet) return;
    setSaving(true);
    try {
      const cats = await categories.list();
      const matchedCat = cats.find(
        (c) => c.name.toLowerCase() === (parsed.category_name ?? '').toLowerCase(),
      );
      const othersCat = cats.find((c) => c.is_system);
      const categoryId = matchedCat?.id ?? othersCat?.id;
      if (!categoryId) throw new Error('No category found');

      await expensesApi.create(activeWallet.id, {
        category_id: categoryId,
        amount: parsed.amount ?? 0,
        description: parsed.description ?? undefined,
        date: parsed.date ?? undefined,
        tag_ids: [],
      });
      toast('Expense saved!', 'success');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleImagePaste = useCallback((e: ClipboardEvent) => {
    if (!open) return;
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, [open]);

  useEffect(() => {
    document.addEventListener('paste', handleImagePaste);
    return () => document.removeEventListener('paste', handleImagePaste);
  }, [handleImagePaste]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (!activeWallet) return;
        setMode('processing');
        try {
          const result = await expensesApi.voiceParse(activeWallet.id, blob);
          setText(result.transcript);
          setParsed(result);
          setMode('review');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Voice processing failed');
          setMode('input');
        }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setError('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'oklch(18% 0.02 80 / 0.45)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'clamp(60px, 12vh, 140px)',
        padding: 'clamp(60px, 12vh, 140px) 16px 16px',
        backdropFilter: 'blur(3px)',
        animation: 'fadeIn 0.15s ease both',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 580,
          background: 'white',
          borderRadius: 20,
          boxShadow: '0 24px 80px oklch(18% 0.02 80 / 0.22), 0 4px 16px oklch(18% 0.02 80 / 0.1)',
          overflow: 'hidden',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--cream-darker)' }}>
          {mode === 'processing' ? (
            <div style={{ width: 20, height: 20, border: '2px solid var(--forest)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />
          ) : (
            <Zap size={18} style={{ color: 'var(--forest)', flexShrink: 0 }} />
          )}

          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'input') handleSubmit(); }}
            placeholder={
              mode === 'processing' ? 'Processing…' :
              mode === 'review' ? 'Expense parsed — review below' :
              'Type an expense or navigate… (e.g. "coffee 4.50")'
            }
            disabled={mode === 'processing' || mode === 'review'}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 15,
              fontFamily: 'var(--font-body)',
              color: 'var(--ink)',
              background: 'transparent',
            }}
          />

          {/* Wallet selector */}
          {wallets.length > 1 && (
            <select
              value={activeWallet?.id ?? ''}
              onChange={(e) => {
                const w = wallets.find((w) => w.id === e.target.value);
                if (w) setActiveWallet(w);
              }}
              style={{
                fontSize: 12,
                border: '1px solid var(--sand)',
                borderRadius: 6,
                padding: '3px 6px',
                background: 'var(--cream)',
                color: 'var(--ink-mid)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}

          {/* Image button */}
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
          >
            <Image size={16} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />

          {/* Mic button */}
          <button
            className="icon-btn"
            onClick={recording ? stopRecording : startRecording}
            title={recording ? 'Stop recording' : 'Record voice'}
            style={recording ? { color: 'var(--rose)', background: 'var(--rose-light)' } : {}}
          >
            {recording ? <MicOff size={16} /> : <Mic size={16} />}
          </button>

          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--cream)' }}>
            <img src={imagePreview} alt="Receipt" style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 6 }} />
            <span style={{ fontSize: 13, color: 'var(--ink-mid)' }}>Receipt attached</span>
            <button className="icon-btn" onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ marginLeft: 'auto' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '8px 16px', background: 'var(--rose-light)', color: 'var(--rose)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Review mode */}
        {mode === 'review' && parsed && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--cream)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div>
                <div style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                  {parsed.amount != null ? fmt(parsed.amount, parsed.currency ?? activeWallet?.currency) : '—'}
                </div>
              </div>
              <div style={{ background: 'var(--cream)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{parsed.category_name ?? 'Others'}</div>
              </div>
            </div>
            {parsed.description && (
              <div style={{ background: 'var(--cream)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-light)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
                <div style={{ fontSize: 14, color: 'var(--ink)' }}>{parsed.description}</div>
              </div>
            )}
            {parsed.ai_context && (
              <div style={{ fontSize: 12, color: 'var(--ink-light)', fontStyle: 'italic', padding: '0 2px' }}>
                AI understood: {parsed.ai_context}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setMode('input')}>Edit</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving && <span className="btn-spinner" />}
                Save expense
              </button>
            </div>
          </div>
        )}

        {/* Navigation suggestions */}
        {mode === 'input' && (
          <div style={{ padding: '6px 8px 8px' }}>
            {text.trim() && looksLikeExpense(text) ? (
              <button
                onClick={handleSubmit}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--forest)',
                  color: 'var(--cream)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                }}
              >
                <Zap size={16} />
                <span>Parse "{text}" as expense</span>
                <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
              </button>
            ) : (
              <>
                {navSuggestions.length > 0 && (
                  <div style={{ padding: '4px 8px 2px', fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {text ? 'Navigate to' : 'Quick navigation'}
                  </div>
                )}
                {navSuggestions.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); onClose(); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink-mid)',
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <item.icon size={15} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                    {item.label}
                    <ArrowRight size={12} style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }} />
                  </button>
                ))}
                {text.trim() && (
                  <button
                    onClick={handleSubmit}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontFamily: 'var(--font-body)',
                      color: 'var(--forest)',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <Zap size={15} style={{ flexShrink: 0 }} />
                    Add as expense
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer hint */}
        {mode === 'input' && (
          <div style={{ padding: '6px 16px 10px', display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-faint)' }}>
            <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Enter</kbd> to submit</span>
            <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Esc</kbd> to close</span>
            <span style={{ marginLeft: 'auto' }}>Paste an image to scan a receipt</span>
          </div>
        )}
      </div>
    </div>
  );
}
