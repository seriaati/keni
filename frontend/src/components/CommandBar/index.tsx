import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Crop,
  RotateCcw,
  FileText,
  Image,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  RotateCw,
  X,
  Zap,
} from 'lucide-react';
import { expenses as expensesApi, recurring as recurringApi, categories as categoriesApi, tags as tagsApi, wallets as walletsApi } from '../../lib/api';
import { useWallet } from '../../contexts/WalletContext';
import { useToast } from '../ui/Toast';
import type { AIParseResponse, CategoryResponse, TagResponse, WalletResponse } from '../../lib/types';
import { localDateStr } from '../../lib/utils';
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
  const [enlargedPreviewIndex, setEnlargedPreviewIndex] = useState<number | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [preCropSnapshot, setPreCropSnapshot] = useState<{ url: string; file: File } | null>(null);

  const [singleExpense, setSingleExpense] = useState<EditableExpense | null>(null);
  const [multiExpenses, setMultiExpenses] = useState<EditableExpense[]>([]);
  const [groupParent, setGroupParent] = useState<EditableExpense | null>(null);
  const [groupItems, setGroupItems] = useState<EditableExpense[]>([]);
  const [recurringExpense, setRecurringExpense] = useState<EditableRecurring | null>(null);

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
  const lightboxImgRef = useRef<HTMLImageElement>(null);
  const cropOverlayRef = useRef<HTMLDivElement>(null);
  const cropDragMovedRef = useRef(false);

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
    setError('');
    setAttachedFiles([]);
    setFilePreviews((prev) => { prev.forEach((url) => { if (url) URL.revokeObjectURL(url); }); return []; });
    setPreCropSnapshot((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setEnlargedPreviewIndex(null);
    setCropMode(false);
    setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
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
    if (result.result_type === 'single') {
      setSingleExpense(makeEditable(result.expenses[0]));
    } else if (result.result_type === 'multiple') {
      setMultiExpenses(result.expenses.map(makeEditable));
    } else if (result.result_type === 'recurring') {
      if (result.recurring) setRecurringExpense(makeEditableRecurring(result.recurring));
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

  const openManualEntry = () => {
    setSelectedWalletId(activeWallet?.id ?? null);
    const today = localDateStr();
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
        type: 'expense',
      }),
      _editing: true,
      _isNew: true,
    };
    setSingleExpense(blank);
    setParseResult({ result_type: 'single', expenses: [blank], group: null, recurring: null, suggested_wallet_id: null });
    setMode('review');
  };

  const enlargedPreview = enlargedPreviewIndex !== null ? (filePreviews[enlargedPreviewIndex] ?? null) : null;

  const openLightbox = (index: number) => {
    setEnlargedPreviewIndex(index);
    setCropMode(false);
    setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  };

  const closeLightbox = () => {
    setPreCropSnapshot((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setEnlargedPreviewIndex(null);
    setCropMode(false);
    setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  };

  const rotateImageCW = () => {
    if (enlargedPreviewIndex === null || !lightboxImgRef.current) return;
    const idx = enlargedPreviewIndex;
    const imgEl = lightboxImgRef.current;
    if (imgEl.naturalWidth === 0) return;
    const url = filePreviews[idx];
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalHeight;
    canvas.height = imgEl.naturalWidth;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const newUrl = URL.createObjectURL(blob);
      if (url) URL.revokeObjectURL(url);
      setFilePreviews((prev) => { const n = [...prev]; n[idx] = newUrl; return n; });
      const origFile = attachedFiles[idx];
      setAttachedFiles((prev) => {
        const n = [...prev];
        n[idx] = new File([blob], origFile?.name ?? 'image.png', { type: 'image/png' });
        return n;
      });
    }, 'image/png');
  };

  const applyCrop = () => {
    if (enlargedPreviewIndex === null || !lightboxImgRef.current) return;
    const idx = enlargedPreviewIndex;
    const imgEl = lightboxImgRef.current;
    if (imgEl.naturalWidth === 0) return;
    const url = filePreviews[idx];
    const origFile = attachedFiles[idx];
    const { naturalWidth, naturalHeight } = imgEl;
    const sx = Math.round(cropRect.x * naturalWidth);
    const sy = Math.round(cropRect.y * naturalHeight);
    const sw = Math.max(1, Math.round(cropRect.w * naturalWidth));
    const sh = Math.max(1, Math.round(cropRect.h * naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const newUrl = URL.createObjectURL(blob);
      setPreCropSnapshot((prev) => { if (prev) URL.revokeObjectURL(prev.url); return { url, file: origFile }; });
      setFilePreviews((prev) => { const n = [...prev]; n[idx] = newUrl; return n; });
      setAttachedFiles((prev) => {
        const n = [...prev];
        n[idx] = new File([blob], origFile?.name ?? 'image.png', { type: 'image/png' });
        return n;
      });
      setCropMode(false);
      setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    }, 'image/png');
  };

  const resetCrop = () => {
    if (!preCropSnapshot || enlargedPreviewIndex === null) return;
    const idx = enlargedPreviewIndex;
    const currentUrl = filePreviews[idx];
    if (currentUrl && currentUrl !== preCropSnapshot.url) URL.revokeObjectURL(currentUrl);
    setFilePreviews((prev) => { const n = [...prev]; n[idx] = preCropSnapshot.url; return n; });
    setAttachedFiles((prev) => { const n = [...prev]; n[idx] = preCropSnapshot.file; return n; });
    setPreCropSnapshot(null);
  };

  const startCropDrag = (e: React.PointerEvent, action: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!cropOverlayRef.current) return;
    const overlayRect = cropOverlayRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...cropRect };
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const MIN = 0.05;
    cropDragMovedRef.current = false;
    const onMove = (e2: PointerEvent) => {
      cropDragMovedRef.current = true;
      const dx = (e2.clientX - startX) / overlayRect.width;
      const dy = (e2.clientY - startY) / overlayRect.height;
      let { x, y, w, h } = startRect;
      if (action === 'move') {
        x = clamp(x + dx, 0, 1 - w);
        y = clamp(y + dy, 0, 1 - h);
      } else if (action === 'nw') {
        const nx = clamp(x + dx, 0, x + w - MIN);
        const ny = clamp(y + dy, 0, y + h - MIN);
        w = w + (x - nx); h = h + (y - ny); x = nx; y = ny;
      } else if (action === 'ne') {
        const ny = clamp(y + dy, 0, y + h - MIN);
        h = h + (y - ny); y = ny;
        w = clamp(w + dx, MIN, 1 - x);
      } else if (action === 'se') {
        w = clamp(w + dx, MIN, 1 - x);
        h = clamp(h + dy, MIN, 1 - y);
      } else if (action === 'sw') {
        const nx = clamp(x + dx, 0, x + w - MIN);
        w = w + (x - nx); x = nx;
        h = clamp(h + dy, MIN, 1 - y);
      }
      setCropRect({ x, y, w, h });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
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
            background: 'oklch(18% 0.02 80 / 0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (cropDragMovedRef.current) { cropDragMovedRef.current = false; return; }
            if (e.target === e.currentTarget) closeLightbox();
          }}
        >
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <img
              ref={lightboxImgRef}
              src={enlargedPreview}
              alt="Receipt enlarged"
              style={{
                maxWidth: '90vw',
                maxHeight: '70vh',
                display: 'block',
                borderRadius: cropMode ? 0 : 12,
                boxShadow: cropMode ? 'none' : '0 32px 80px oklch(18% 0.02 80 / 0.4)',
              }}
              onClick={(e) => e.stopPropagation()}
            />
            {cropMode && (
              <div
                ref={cropOverlayRef}
                style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${cropRect.y * 100}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: `${cropRect.y * 100}%`, left: 0, width: `${cropRect.x * 100}%`, height: `${cropRect.h * 100}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: `${cropRect.y * 100}%`, left: `${(cropRect.x + cropRect.w) * 100}%`, right: 0, height: `${cropRect.h * 100}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: `${(cropRect.y + cropRect.h) * 100}%`, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
                <div
                  style={{
                    position: 'absolute',
                    left: `${cropRect.x * 100}%`,
                    top: `${cropRect.y * 100}%`,
                    width: `${cropRect.w * 100}%`,
                    height: `${cropRect.h * 100}%`,
                    border: '2px solid white',
                    boxSizing: 'border-box',
                    cursor: 'move',
                  }}
                  onPointerDown={(e) => startCropDrag(e, 'move')}
                >
                  {(['nw', 'ne', 'se', 'sw'] as const).map((corner) => (
                    <div
                      key={corner}
                      onPointerDown={(e) => startCropDrag(e, corner)}
                      style={{
                        position: 'absolute',
                        width: 14,
                        height: 14,
                        background: 'white',
                        borderRadius: 2,
                        ...(corner[0] === 'n' ? { top: -7 } : { bottom: -7 }),
                        ...(corner[1] === 'w' ? { left: -7 } : { right: -7 }),
                        cursor: `${corner}-resize`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn btn-sm btn-secondary"
              style={{ border: 'none' }}
              onClick={(e) => { e.stopPropagation(); rotateImageCW(); }}
              title="Rotate 90° clockwise"
            >
              <RotateCw size={14} />
              Rotate
            </button>
            {cropMode ? (
              <>
                <button
                  className="btn btn-sm btn-primary"
                  style={{ border: 'none' }}
                  onClick={(e) => { e.stopPropagation(); applyCrop(); }}
                  title="Apply crop"
                >
                  <Check size={14} />
                  Apply Crop
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ border: 'none' }}
                  onClick={(e) => { e.stopPropagation(); setCropMode(false); }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ border: 'none' }}
                  onClick={(e) => { e.stopPropagation(); setCropMode(true); setCropRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 }); }}
                  title="Crop image"
                >
                  <Crop size={14} />
                  Crop
                </button>
                {preCropSnapshot && (
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ border: 'none' }}
                    onClick={(e) => { e.stopPropagation(); resetCrop(); }}
                    title="Restore image before crop"
                  >
                    <RotateCcw size={14} />
                    Reset Crop
                  </button>
                )}
              </>
            )}
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
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
                      onClick={() => openLightbox(i)}
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
                    onClick={openManualEntry}
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
                    onClick={openManualEntry}
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
