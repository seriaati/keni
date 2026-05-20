import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  FileText,
  Image,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { expenses as expensesApi, recurring as recurringApi, categories as categoriesApi, tags as tagsApi, wallets as walletsApi } from '../../lib/api';
import { useWallet } from '../../contexts/WalletContext';
import { useToast } from '../ui/Toast';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { CategorySelect } from '../ui/CategorySelect';
import { TagMultiSelect } from './TagMultiSelect';
import type { AIParseResponse, CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { NAV_ITEMS_STATIC, looksLikeExpense, makeEditable, commitEditable, makeEditableRecurring } from './utils';
import { SingleReview } from './SingleReview';
import { MultipleReview } from './MultipleReview';
import { RecurringReview } from './RecurringReview';
import { GroupReview } from './GroupReview';
import type { CommandBarProps, EditableExpense, EditableRecurring, Mode } from './types';

export function CommandBar({ open, onClose, onExpenseAdded, initialPayload }: CommandBarProps) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('input');
  const [parseResult, setParseResult] = useState<AIParseResponse | null>(null);
  const [transcript, setTranscript] = useState('');
  const [enlargedPreview, setEnlargedPreview] = useState<string | null>(null);

  const [singleExpense, setSingleExpense] = useState<EditableExpense | null>(null);
  const [multiExpenses, setMultiExpenses] = useState<EditableExpense[]>([]);
  const [groupParent, setGroupParent] = useState<EditableExpense | null>(null);
  const [groupItems, setGroupItems] = useState<EditableExpense[]>([]);
  const [recurringExpense, setRecurringExpense] = useState<EditableRecurring | null>(null);
  const [transferForm, setTransferForm] = useState<{
    fromWalletId: string;
    toWalletId: string;
    amount: string;
    toAmount: string;
    categoryName: string;
    tagNames: string;
    description: string;
    date: string;
    aiContext: string | null;
  } | null>(null);

  const [error, setError] = useState('');
  const [selectedNavIndex, setSelectedNavIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [wallets, setWallets] = useState<WalletResponse[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { t } = useTranslation();
  const { activeWallet } = useWallet();
  const navigate = useNavigate();
  const toast = useToast();

  const reset = useCallback(() => {
    setText('');
    setMode('input');
    setParseResult(null);
    setTranscript('');
    setSelectedNavIndex(0);
    setSingleExpense(null);
    setMultiExpenses([]);
    setGroupParent(null);
    setGroupItems([]);
    setRecurringExpense(null);
    setTransferForm(null);
    setError('');
    setAttachedFiles([]);
    setFilePreviews((prev) => { prev.forEach((url) => { if (url) URL.revokeObjectURL(url); }); return []; });
    setEnlargedPreview(null);
    setSaving(false);
    setSelectedWalletId(null);
  }, []);

  useEffect(() => {
    if (open) {
      reset();
      if (initialPayload?.text) setText(initialPayload.text);
      if (initialPayload?.files?.length) {
        setAttachedFiles(initialPayload.files);
        setFilePreviews(
          initialPayload.files.map((f) =>
            f.type.startsWith('image/') ? URL.createObjectURL(f) : '',
          ),
        );
      }
      setTimeout(() => inputRef.current?.focus(), 50);
      categoriesApi.list().then(setCategories).catch(() => {});
      tagsApi.list().then(setAllTags).catch(() => {});
      walletsApi.list().then(setWallets).catch(() => {});
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

  const applyParseResult = (result: AIParseResponse) => {
    setParseResult(result);
    setSelectedWalletId(result.suggested_wallet_id ?? activeWallet?.id ?? null);
    setSingleExpense(null);
    setMultiExpenses([]);
    setGroupParent(null);
    setGroupItems([]);
    setRecurringExpense(null);
    setTransferForm(null);
    if (result.result_type === 'single') {
      setSingleExpense(makeEditable(result.expenses[0]));
    } else if (result.result_type === 'multiple') {
      setMultiExpenses(result.expenses.map(makeEditable));
    } else if (result.result_type === 'recurring') {
      if (result.recurring) setRecurringExpense(makeEditableRecurring(result.recurring));
    } else if (result.result_type === 'transfer' && result.transfer) {
      const fromWalletId = result.transfer.from_wallet_id ?? activeWallet?.id ?? '';
      const fallbackToWallet = wallets.find((w) => w.id !== fromWalletId);
      setTransferForm({
        fromWalletId,
        toWalletId: result.transfer.to_wallet_id ?? fallbackToWallet?.id ?? '',
        amount: String(result.transfer.amount),
        toAmount: result.transfer.to_amount != null ? String(result.transfer.to_amount) : '',
        categoryName: 'Transfer',
        tagNames: '',
        description: result.transfer.description ?? '',
        date: result.transfer.date ? result.transfer.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
        aiContext: result.transfer.ai_context,
      });
    } else {
      setGroupParent(result.group ? makeEditable(result.group) : null);
      setGroupItems(result.expenses.map(makeEditable));
    }
    setMode('review');
  };

  const transactionsNavItem = {
    label: 'Transactions',
    path: activeWallet ? `/wallets/${activeWallet.id}` : '/wallets',
    icon: ArrowLeftRight,
    keywords: ['transactions', 'expenses', 'wallet', 'money', 'account'],
  };
  const NAV_ITEMS = [NAV_ITEMS_STATIC[0], transactionsNavItem, ...NAV_ITEMS_STATIC.slice(1)];
  const navSuggestions = text.trim()
    ? NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(text.toLowerCase()) ||
        item.keywords.some((k) => k.includes(text.toLowerCase())),
    )
    : NAV_ITEMS.slice(0, 4);

  const handleSubmit = async () => {
    if (!text.trim() && !attachedFiles.length) return;
    if (!activeWallet) { setError('No wallet selected'); return; }

    if (!attachedFiles.length && !looksLikeExpense(text)) {
      const match = navSuggestions[0];
      if (match) { navigate(match.path); onClose(); return; }
    }

    setMode('processing');
    setError('');
    try {
      const result = await expensesApi.aiParse(activeWallet.id, text || undefined, attachedFiles.length ? attachedFiles : undefined);
      applyParseResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse expense');
      setMode('input');
    }
  };

  const handleSaveSingle = async () => {
    if (!singleExpense || !selectedWalletId) return;
    setSaving(true);
    try {
      const exp = singleExpense._editing ? commitEditable(singleExpense) : singleExpense;
      await expensesApi.create(selectedWalletId, {
        category_name: exp.category_name ?? 'Others',
        category_icon: exp.suggested_icon ?? undefined,
        amount: exp.amount ?? 0,
        type: exp.type ?? 'expense',
        description: exp.description ?? undefined,
        date: exp.date ?? undefined,
        tag_names: exp.suggested_tags.map((t) => t.name),
        ai_context: exp.ai_context ?? undefined,
      });
      toast(t('commandBar.toastSaved'), 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMultiple = async () => {
    if (!selectedWalletId) return;
    setSaving(true);
    try {
      const committed = multiExpenses.map((e) => e._editing ? commitEditable(e) : e);
      await Promise.all(committed.map((exp) =>
        expensesApi.create(selectedWalletId, {
          category_name: exp.category_name ?? 'Others',
          category_icon: exp.suggested_icon ?? undefined,
          amount: exp.amount ?? 0,
          type: exp.type ?? 'expense',
          description: exp.description ?? undefined,
          date: exp.date ?? undefined,
          tag_names: exp.suggested_tags.map((t) => t.name),
          ai_context: exp.ai_context ?? undefined,
        }),
      ));
      toast(t('commandBar.toastMultiSaved', { count: committed.length }), 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRecurring = async () => {
    if (!recurringExpense || !selectedWalletId) return;
    setSaving(true);
    try {
      const tags = recurringExpense._editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await recurringApi.create(selectedWalletId, {
        category_name: recurringExpense._editCategory.trim() || recurringExpense.category_name,
        category_icon: recurringExpense.suggested_icon ?? undefined,
        amount: parseFloat(recurringExpense._editAmount) || recurringExpense.amount,
        type: recurringExpense.type,
        description: recurringExpense._editDescription.trim() || undefined,
        frequency: recurringExpense._editFrequency,
        next_due: new Date(recurringExpense._editNextDue).toISOString(),
        tag_names: tags,
      });
      toast(t('commandBar.toastRecurringSaved'), 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveGroup = async () => {
    if (!groupParent || !selectedWalletId) return;
    const parent = groupParent._editing ? commitEditable(groupParent) : groupParent;
    const items = groupItems.map((e) => e._editing ? commitEditable(e) : e);

    const itemsSum = items.reduce((s, e) => s + (e.amount ?? 0), 0);
    if (Math.abs(itemsSum - (parent.amount ?? 0)) > 0.001) {
      setError(`Items sum (${itemsSum.toFixed(2)}) must equal group total (${(parent.amount ?? 0).toFixed(2)})`);
      return;
    }

    setSaving(true);
    try {
      await expensesApi.createGroup(selectedWalletId, {
        group: {
          category_name: parent.category_name ?? 'Others',
          category_icon: parent.suggested_icon ?? undefined,
          amount: parent.amount ?? 0,
          description: parent.description ?? undefined,
          date: parent.date ?? undefined,
          tag_names: parent.suggested_tags.map((t) => t.name),
          tag_ids: [],
        },
        items: items.map((e) => ({
          category_name: e.category_name ?? 'Others',
          category_icon: e.suggested_icon ?? undefined,
          amount: e.amount ?? 0,
          description: e.description ?? undefined,
          tag_names: e.suggested_tags.map((t) => t.name),
          tag_ids: [],
        })),
      });
      toast(t('commandBar.toastGroupSaved'), 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (!dropped.length) return;
    setAttachedFiles((prev) => [...prev, ...dropped]);
    setFilePreviews((prev) => [
      ...prev,
      ...dropped.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')),
    ]);
  }, []);

  useEffect(() => {
    if (!open) return;
    const el = dropZoneRef.current;
    if (!el) return;
    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('drop', handleDrop);
    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('drop', handleDrop);
    };
  }, [open, handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const handleImagePaste = useCallback((e: ClipboardEvent) => {
    if (!open) return;
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    setAttachedFiles((prev) => [...prev, file]);
    setFilePreviews((prev) => [...prev, URL.createObjectURL(file)]);
  }, [open]);

  useEffect(() => {
    document.addEventListener('paste', handleImagePaste);
    return () => document.removeEventListener('paste', handleImagePaste);
  }, [handleImagePaste]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    setAttachedFiles((prev) => [...prev, ...selected]);
    setFilePreviews((prev) => [
      ...prev,
      ...selected.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')),
    ]);
    e.target.value = '';
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
          setTranscript(result.transcript);
          setText(result.transcript);
          applyParseResult(result);
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

  const openManualEntry = (type: 'expense' | 'income' = 'expense') => {
    setSelectedWalletId(activeWallet?.id ?? null);
    setTransferForm(null);
    const today = new Date().toISOString().slice(0, 10);
    const blank = {
      ...makeEditable({
        amount: null,
        currency: activeWallet?.currency ?? null,
        category_name: null,
        is_new_category: false,
        description: null,
        date: today,
        ai_context: null,
        suggested_tags: [],
        suggested_icon: null,
        type,
      }),
      _editing: true,
      _isNew: true,
    };
    setSingleExpense(blank);
    setParseResult({ result_type: 'single', expenses: [blank], group: null, recurring: null, transfer: null, suggested_wallet_id: null });
    setMode('review');
  };

  const openTransferEntry = () => {
    if (!activeWallet) { setError('No wallet selected'); return; }
    const destinationWallet = wallets.find((w) => w.id !== activeWallet.id);
    if (!destinationWallet) { setError('Create another wallet before adding a transfer'); return; }
    setSingleExpense(null);
    setMultiExpenses([]);
    setGroupParent(null);
    setGroupItems([]);
    setRecurringExpense(null);
    setTransferForm({
      fromWalletId: activeWallet.id,
      toWalletId: destinationWallet.id,
      amount: '',
      toAmount: '',
      categoryName: 'Transfer',
      tagNames: '',
      description: '',
      date: new Date().toISOString().slice(0, 10),
      aiContext: null,
    });
    setParseResult(null);
    setMode('review');
  };

  const handleSaveTransfer = async () => {
    if (!transferForm) return;
    const amount = Number(transferForm.amount);
    const toAmount = transferForm.toAmount.trim() ? Number(transferForm.toAmount) : undefined;
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a transfer amount');
      return;
    }
    if (toAmount !== undefined && (!Number.isFinite(toAmount) || toAmount <= 0)) {
      setError('Enter a valid destination amount');
      return;
    }
    if (!transferForm.fromWalletId || !transferForm.toWalletId) {
      setError('Choose source and destination wallets');
      return;
    }
    if (transferForm.fromWalletId === transferForm.toWalletId) {
      setError('Choose two different wallets');
      return;
    }

    setSaving(true);
    try {
      await expensesApi.createTransfer(transferForm.fromWalletId, {
        to_wallet_id: transferForm.toWalletId,
        category_name: transferForm.categoryName.trim() || 'Transfer',
        amount,
        to_amount: toAmount,
        description: transferForm.description.trim() || undefined,
        date: transferForm.date ? new Date(transferForm.date).toISOString() : undefined,
        ai_context: transferForm.aiContext ?? undefined,
        tag_names: transferForm.tagNames
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      toast('Transfer saved', 'success');
      onExpenseAdded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save transfer');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const resultType = parseResult?.result_type;
  const activeWalletCurrency = wallets.find((w) => w.id === selectedWalletId)?.currency ?? activeWallet?.currency;

  return (
    <>
      {enlargedPreview && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'oklch(18% 0.02 80 / 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setEnlargedPreview(null)}
        >
          <img
            src={enlargedPreview}
            alt="Receipt enlarged"
            style={{
              maxWidth: '90vw',
              maxHeight: '85vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 32px 80px oklch(18% 0.02 80 / 0.4)',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setEnlargedPreview(null)}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'oklch(18% 0.02 80 / 0.6)',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <X size={18} />
          </button>
        </div>,
        document.body
      )}
      <div
        ref={dropZoneRef}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'oklch(18% 0.02 80 / 0.45)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 'clamp(60px, 12vh, 140px) 16px 16px',
          backdropFilter: 'blur(3px)',
          animation: 'fadeIn 0.15s ease both',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: resultType === 'group' || resultType === 'multiple' ? 680 : 580,
            background: 'white',
            borderRadius: 20,
            boxShadow: '0 24px 80px oklch(18% 0.02 80 / 0.22), 0 4px 16px oklch(18% 0.02 80 / 0.1)',
            overflow: 'hidden',
            animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
            position: 'relative',
          }}
        >
          {dragging && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              borderRadius: 20,
              border: '2.5px dashed var(--forest)',
              background: '#F9F5EC',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              pointerEvents: 'none',
            }}>
              <Image size={28} style={{ color: 'var(--forest)' }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>Drop file to attach</span>
              <span style={{ fontSize: 12, color: 'var(--ink-light)' }}>Image or PDF</span>
            </div>
          )}

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
              onChange={(e) => { setText(e.target.value); setSelectedNavIndex(0); }}
              onKeyDown={(e) => {
                if (mode === 'input') {
                  const isExpense = !!(text.trim() && looksLikeExpense(text));
                  const totalItems = isExpense
                    ? 2
                    : navSuggestions.length + (text.trim() ? 1 : 0) + 1;
                  const manualIndex = totalItems - 1;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedNavIndex((i) => Math.min(i + 1, totalItems - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedNavIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Enter') {
                    if (selectedNavIndex === manualIndex) { openManualEntry(); return; }
                    if (isExpense) { handleSubmit(); return; }
                    if (text.trim()) {
                      if (selectedNavIndex === navSuggestions.length) { handleSubmit(); return; }
                      const item = navSuggestions[selectedNavIndex];
                      if (item) { navigate(item.path); onClose(); return; }
                    }
                    handleSubmit();
                    return;
                  }
                }
                if (e.key === 'Enter' && mode === 'review') handleSubmit();
              }}
              placeholder={
                mode === 'processing' ? 'Processing…' :
                  mode === 'review' ? 'Edit text and press Enter to re-parse…' :
                    'Type a transaction or navigate…'
              }
              disabled={mode === 'processing'}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 15,
                fontFamily: 'var(--font-body)',
                color: mode === 'review' ? 'var(--ink-mid)' : 'var(--ink)',
                background: 'transparent',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button className="icon-btn" onClick={() => fileInputRef.current?.click()} title="Attach image or PDF">
                <Paperclip size={16} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={handleImageSelect} />

              {text.trim() || attachedFiles.length ? (
                <button
                  className="icon-btn"
                  onClick={handleSubmit}
                  title="Send"
                  style={{ color: 'var(--ink)', background: 'var(--cream)' }}
                >
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="icon-btn"
                  onClick={recording ? stopRecording : startRecording}
                  title={recording ? 'Stop recording' : 'Record voice'}
                  style={recording ? { color: 'var(--rose)', background: 'var(--rose-light)' } : {}}
                >
                  {recording ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
            </div>
          </div>

          {/* File previews */}
          {attachedFiles.length > 0 && (
            <div style={{ padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 8, background: 'var(--cream)', alignItems: 'flex-start' }}>
              {attachedFiles.map((file, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', flexShrink: 0 }}
                  title={file.name}
                >
                  {filePreviews[i] ? (
                    <img
                      src={filePreviews[i]}
                      alt={file.name}
                      onClick={() => setEnlargedPreview(filePreviews[i])}
                      style={{ height: 48, width: 48, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', display: 'block' }}
                    />
                  ) : (
                    <div style={{ height: 48, width: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--cream-darker)', borderRadius: 6 }}>
                      <FileText size={20} style={{ color: 'var(--ink-mid)' }} />
                    </div>
                  )}
                  <button
                    className="icon-btn"
                    onClick={() => {
                      if (filePreviews[i]) URL.revokeObjectURL(filePreviews[i]);
                      setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i));
                      setFilePreviews((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    style={{
                      position: 'absolute', top: -6, right: -6,
                      width: 18, height: 18, borderRadius: '50%',
                      background: 'var(--ink)', color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 0, flexShrink: 0,
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Transcript badge */}
          {transcript && mode === 'review' && (
            <div style={{ padding: '6px 16px', background: 'oklch(96% 0.04 155)', borderBottom: '1px solid oklch(88% 0.06 155)', fontSize: 12, color: 'var(--forest)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mic size={12} />
              <span style={{ fontStyle: 'italic' }}>{transcript}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 16px', background: 'var(--rose-light)', color: 'var(--rose)', fontSize: 13 }}>
              {error}
            </div>
          )}

          {/* Review: single */}
          {mode === 'review' && resultType === 'single' && singleExpense && (
            <SingleReview
              expense={singleExpense}
              onChange={setSingleExpense}
              activeWalletCurrency={activeWalletCurrency}
              onSave={handleSaveSingle}
              saving={saving}
              categories={categories}
              allTags={allTags}
              wallets={wallets}
              selectedWalletId={selectedWalletId}
              onWalletChange={setSelectedWalletId}
              onTransferClick={openTransferEntry}
            />
          )}

          {/* Review: multiple */}
          {mode === 'review' && resultType === 'multiple' && (
            <MultipleReview
              expenses={multiExpenses}
              onChange={setMultiExpenses}
              activeWalletCurrency={activeWalletCurrency}
              onSave={handleSaveMultiple}
              saving={saving}
              categories={categories}
              allTags={allTags}
              wallets={wallets}
              selectedWalletId={selectedWalletId}
              onWalletChange={setSelectedWalletId}
            />
          )}

          {/* Review: recurring */}
          {mode === 'review' && resultType === 'recurring' && recurringExpense && (
            <RecurringReview
              recurring={recurringExpense}
              onChange={setRecurringExpense}
              activeWalletCurrency={activeWalletCurrency}
              onSave={handleSaveRecurring}
              saving={saving}
              categories={categories}
              allTags={allTags}
              wallets={wallets}
              selectedWalletId={selectedWalletId}
              onWalletChange={setSelectedWalletId}
            />
          )}

          {/* Review: group */}
          {mode === 'review' && resultType === 'group' && groupParent && (
            <GroupReview
              parent={groupParent}
              items={groupItems}
              onChangeParent={setGroupParent}
              onChangeItems={setGroupItems}
              activeWalletCurrency={activeWalletCurrency}
              onSave={handleSaveGroup}
              saving={saving}
              error={error}
              categories={categories}
              allTags={allTags}
              wallets={wallets}
              selectedWalletId={selectedWalletId}
              onWalletChange={setSelectedWalletId}
            />
          )}

          {mode === 'review' && (resultType === 'transfer' || !resultType) && transferForm && (
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'var(--cream)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, border: '1.5px solid var(--forest)' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</div>
                  <div className="tabs" style={{ display: 'inline-flex' }}>
                    <button
                      type="button"
                      className="tab"
                      onClick={() => openManualEntry('expense')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <TrendingDown size={12} /> Expense
                    </button>
                    <button
                      type="button"
                      className="tab"
                      onClick={() => openManualEntry('income')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <TrendingUp size={12} /> Income
                    </button>
                    <button
                      type="button"
                      className="tab tab-active"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <ArrowLeftRight size={12} /> Transfer
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount</div>
                    <input
                      type="number"
                      step="0.01"
                      value={transferForm.amount}
                      onChange={(e) => setTransferForm((f) => f ? { ...f, amount: e.target.value } : f)}
                      style={{ width: '100%', fontSize: 16, color: 'var(--ink)', background: 'white', border: '1px solid var(--sand)', borderRadius: 6, padding: '3px 7px', outline: 'none', fontFamily: 'var(--font-display)' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destination amount</div>
                    <input
                      type="number"
                      step="0.01"
                      value={transferForm.toAmount}
                      onChange={(e) => setTransferForm((f) => f ? { ...f, toAmount: e.target.value } : f)}
                      placeholder="Same as amount if empty"
                      style={{ width: '100%', fontSize: 16, color: 'var(--ink)', background: 'white', border: '1px solid var(--sand)', borderRadius: 6, padding: '3px 7px', outline: 'none', fontFamily: 'var(--font-display)' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>From</div>
                    <Select
                      value={transferForm.fromWalletId}
                      onChange={(fromWalletId) => setTransferForm((f) => f ? { ...f, fromWalletId } : f)}
                      options={wallets.map((w) => ({ value: w.id, label: `${w.name} (${w.currency})` }))}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>To</div>
                    <Select
                      value={transferForm.toWalletId}
                      onChange={(toWalletId) => setTransferForm((f) => f ? { ...f, toWalletId } : f)}
                      options={wallets.map((w) => ({ value: w.id, label: `${w.name} (${w.currency})` }))}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</div>
                  <CategorySelect
                    value={transferForm.categoryName}
                    categories={categories}
                    matchBy="name"
                    size="sm"
                    onSelect={(cat) => setTransferForm((f) => f ? { ...f, categoryName: cat.name } : f)}
                    onCreate={(name) => setTransferForm((f) => f ? { ...f, categoryName: name } : f)}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</div>
                  <DatePicker
                    value={transferForm.date}
                    onChange={(date) => setTransferForm((f) => f ? { ...f, date } : f)}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</div>
                  <textarea
                    value={transferForm.description}
                    onChange={(e) => setTransferForm((f) => f ? { ...f, description: e.target.value } : f)}
                    placeholder="Optional"
                    rows={3}
                    style={{ width: '100%', fontSize: 13, color: 'var(--ink)', background: 'white', border: '1px solid var(--sand)', borderRadius: 6, padding: '3px 7px', outline: 'none', fontFamily: 'var(--font-body)', resize: 'vertical' }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 10, color: 'var(--ink-light)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tags</div>
                  <TagMultiSelect
                    value={transferForm.tagNames}
                    onChange={(tagNames) => setTransferForm((f) => f ? { ...f, tagNames } : f)}
                    allTags={allTags}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setMode('input')} disabled={saving}>Cancel</button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button className="btn btn-primary btn-sm" style={{ fontSize: 12, padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={handleSaveTransfer} disabled={saving}>
                  {saving && <span className="btn-spinner" />}
                  <ArrowLeftRight size={13} />
                  Save transfer
                </button>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--ink-faint)' }}>
                <span><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Edit text above</kbd> + Enter to re-parse</span>
                <span style={{ marginLeft: 'auto' }}><kbd style={{ background: 'var(--cream-dark)', padding: '1px 5px', borderRadius: 4, fontFamily: 'inherit' }}>Esc</kbd> to go back</span>
              </div>
            </div>
          )}

          {/* Navigation suggestions */}
          {mode === 'input' && (
            <div style={{ padding: '6px 8px 8px' }}>
              {text.trim() && looksLikeExpense(text) ? (
                <>
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
                    <span>Parse "{text}" as transaction</span>
                    <ArrowRight size={14} style={{ marginLeft: 'auto' }} />
                  </button>
                  <div style={{ height: 1, background: 'var(--cream-darker)', margin: '4px 4px 2px' }} />
                  <button
                    onClick={() => openManualEntry()}
                    onMouseEnter={() => setSelectedNavIndex(1)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: selectedNavIndex === 1 ? 'var(--cream)' : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink-light)',
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                  >
                    <Plus size={14} style={{ flexShrink: 0 }} />
                    Add transaction manually
                  </button>
                </>
              ) : (
                <>
                  {navSuggestions.length > 0 && (
                    <div style={{ padding: '4px 8px 2px', fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {text ? 'Navigate to' : 'Quick navigation'}
                    </div>
                  )}
                  {navSuggestions.map((item, i) => (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); onClose(); }}
                      onMouseEnter={() => setSelectedNavIndex(i)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: selectedNavIndex === i ? 'var(--cream)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontFamily: 'var(--font-body)',
                        color: 'var(--ink-mid)',
                        textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                    >
                      <item.icon size={15} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
                      {item.label}
                      <ArrowRight size={12} style={{ marginLeft: 'auto', color: 'var(--ink-faint)' }} />
                    </button>
                  ))}
                  {text.trim() && (
                    <button
                      onClick={handleSubmit}
                      onMouseEnter={() => setSelectedNavIndex(navSuggestions.length)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: selectedNavIndex === navSuggestions.length ? 'var(--cream)' : 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 14,
                        fontFamily: 'var(--font-body)',
                        color: 'var(--forest)',
                        textAlign: 'left',
                      }}
                    >
                      <Zap size={15} style={{ flexShrink: 0 }} />
                      Add as transaction
                    </button>
                  )}
                  <div style={{ height: 1, background: 'var(--cream-darker)', margin: '4px 4px 2px' }} />
                  <button
                    onClick={() => openManualEntry()}
                    onMouseEnter={() => setSelectedNavIndex(navSuggestions.length + (text.trim() ? 1 : 0))}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: selectedNavIndex === navSuggestions.length + (text.trim() ? 1 : 0) ? 'var(--cream)' : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontFamily: 'var(--font-body)',
                      color: 'var(--ink-light)',
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                  >
                    <Plus size={14} style={{ flexShrink: 0 }} />
                    Add transaction manually
                  </button>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
