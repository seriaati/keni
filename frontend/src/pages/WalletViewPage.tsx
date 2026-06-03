import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, useOutletContext, useNavigate, type NavigateFunction } from 'react-router-dom';
import { ArrowLeftRight, Check, Command, Filter, FolderOpen, Layers, Plus, Search, SortAsc, SortDesc, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { expenses as expensesApi, categories as categoriesApi, wallets as walletsApi, tags as tagsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Select } from '../components/ui/Select';
import { DatePicker } from '../components/ui/DatePicker';
import { Modal } from '../components/ui/Modal';
import { CategorySelect } from '../components/ui/CategorySelect';
import { MultiCategorySelect } from '../components/ui/MultiCategorySelect';
import type { CategoryResponse, TransactionListResponse, TransactionResponse, TagResponse, TagBrief, WalletSummary } from '../lib/types';
import { fmt, fmtRelative } from '../lib/utils';
import { CategoryIcon } from '../lib/categoryIcons';
import { getExchangeRate } from '../lib/fx';
import type { LayoutOutletContext } from '../components/Layout';

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export function WalletViewPage() {
  const { t } = useTranslation();
  const { walletId } = useParams<{ walletId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { user } = useAuth();
  const { expenseAddedKey } = useOutletContext<LayoutOutletContext>();
  const navigate = useNavigate();

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [fxRate, setFxRate] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const [showConverted, setShowConverted] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // --- Bulk selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const lastClickedIndexRef = useRef<number>(-1);

  // --- Bulk delete modal ---
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // --- Bulk actions bar ---
  const [showActionsBar, setShowActionsBar] = useState(false);

  // --- Bulk edit modals ---
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [showEditLabelModal, setShowEditLabelModal] = useState(false);
  const [bulkEditCategoryId, setBulkEditCategoryId] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const newTagInputRef = useRef<HTMLInputElement>(null);
  const [bulkAddTagIds, setBulkAddTagIds] = useState<Set<string>>(new Set());
  const [bulkRemoveTagIds, setBulkRemoveTagIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkAISuggesting, setBulkAISuggesting] = useState(false);
  const [showAISuggestModal, setShowAISuggestModal] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleToggleConverted = () => {
    if (switching) return;
    setSwitching(true);
    setTimeout(() => setShowConverted((v) => !v), 112);
    setTimeout(() => setSwitching(false), 320);
  };

  const [data, setData] = useState<TransactionListResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state derived from URL params
  const search = searchParams.get('q') ?? '';
  const selectedCategoryIds = useMemo(() => searchParams.getAll('category_ids'), [searchParams]);

  // Local state for search input — decoupled from URL to avoid interrupting IME composition (e.g. Zhuyin)
  const [searchInput, setSearchInput] = useState(() => search);
  const isComposingRef = useRef(false);
  useEffect(() => {
    if (!isComposingRef.current) setSearchInput(search);
  }, [search]);
  const selectedTagIds = useMemo(() => searchParams.getAll('tag_ids'), [searchParams]);
  const sortBy = searchParams.get('sort_by') ?? 'date';
  const sortOrder = (searchParams.get('sort_order') ?? 'desc') as 'asc' | 'desc';
  const page = Number(searchParams.get('page') ?? '1');
  const startDate = searchParams.get('start_date') ?? '';
  const endDate = searchParams.get('end_date') ?? '';
  const minAmount = searchParams.get('min_amount') ?? '';
  const maxAmount = searchParams.get('max_amount') ?? '';

  const PAGE_SIZE = 20;

  const setParam = (updates: Record<string, string | string[] | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else if (Array.isArray(value)) {
          next.delete(key);
          for (const v of value) next.append(key, v);
        } else {
          next.set(key, value);
        }
      }
      return next;
    }, { replace: true });
  };

  const load = useCallback(async () => {
    if (!walletId) return;
    setLoading(true);
    try {
      const [w, cats, tagList, list] = await Promise.all([
        walletsApi.get(walletId),
        categoriesApi.list(),
        tagsApi.list(),
        expensesApi.list(walletId, {
          page,
          page_size: PAGE_SIZE,
          search: search || undefined,
          category_ids: selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
          tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          min_amount: minAmount ? Number(minAmount) : undefined,
          max_amount: maxAmount ? Number(maxAmount) : undefined,
        }),
      ]);
      setWallet(w);
      setCategories(cats);
      setAllTags(tagList);
      setData(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('walletView.toastLoadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [walletId, page, search, selectedCategoryIds, selectedTagIds, sortBy, sortOrder, startDate, endDate, minAmount, maxAmount, toast, expenseAddedKey]);

  useEffect(() => { load(); }, [load]);

  // Clear selection when page data changes
  useEffect(() => {
    setSelectedIds(new Set());
    setIsSelecting(false);
    lastClickedIndexRef.current = -1;
  }, [data]);

  useEffect(() => {
    const globalCurrency = user?.global_currency;
    const walletCurrency = wallet?.currency;
    if (!globalCurrency || !walletCurrency || globalCurrency === walletCurrency) {
      setFxRate(null);
      return;
    }
    const date = user?.fx_use_historical_rates && endDate ? endDate : undefined;
    getExchangeRate(walletCurrency, globalCurrency, date).then(setFxRate);
  }, [wallet?.currency, user?.global_currency, user?.fx_use_historical_rates, endDate]);

  const toggleTag = (id: string) => {
    const next = selectedTagIds.includes(id)
      ? selectedTagIds.filter((tId) => tId !== id)
      : [...selectedTagIds, id];
    setParam({ tag_ids: next, page: null });
  };

  // --- Bulk selection handlers ---
  const handleSelect = useCallback((id: string, e: React.MouseEvent) => {
    const items = data?.items ?? [];
    const clickedIndex = items.findIndex((item) => item.id === id);

    if (!isSelecting) {
      // Enter selecting mode
      setIsSelecting(true);
      setSelectedIds(new Set([id]));
      lastClickedIndexRef.current = clickedIndex;
      return;
    }

    if (!isMobile && e.shiftKey && lastClickedIndexRef.current >= 0) {
      // Shift-click: select range
      const from = Math.min(lastClickedIndexRef.current, clickedIndex);
      const to = Math.max(lastClickedIndexRef.current, clickedIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = from; i <= to; i++) {
          next.add(items[i].id);
        }
        return next;
      });
    } else {
      // Toggle single item
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        // Exit selecting mode if nothing selected
        if (next.size === 0) {
          setIsSelecting(false);
        }
        return next;
      });
    }
    lastClickedIndexRef.current = clickedIndex;
  }, [data, isSelecting, isMobile]);

  const handleSelectAll = useCallback(() => {
    if (!data) return;
    setSelectedIds(new Set(data.items.map((item) => item.id)));
    setIsSelecting(true);
  }, [data]);

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
    setIsSelecting(false);
    lastClickedIndexRef.current = -1;
  };

  // Ctrl+A / Cmd+A selects all items on the current page (works even before entering select mode)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setIsSelecting(false);
        lastClickedIndexRef.current = -1;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleSelectAll]);

  // --- Bulk delete ---
  const handleBulkDelete = async () => {
    if (!walletId || selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await expensesApi.bulkDelete(walletId, Array.from(selectedIds));
      const count = selectedIds.size;
      const plural = count === 1 ? '' : 's';
      toast(t('walletView.bulkDeleteToast', { count, plural }), 'success');
      setShowDeleteModal(false);
      handleDeselectAll();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.failed'), 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // --- Bulk edit ---
  const openEditCategoryModal = () => {
    setBulkEditCategoryId('');
    setShowEditCategoryModal(true);
  };

  const openEditLabelModal = () => {
    setBulkAddTagIds(new Set());
    setBulkRemoveTagIds(new Set());
    setIsCreatingTag(false);
    setNewTagName('');
    setShowEditLabelModal(true);
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) { setIsCreatingTag(false); setNewTagName(''); return; }
    try {
      const tag = await tagsApi.create({ name });
      setAllTags((prev) => [...prev, tag]);
      setBulkAddTagIds((prev) => { const next = new Set(prev); next.add(tag.id); return next; });
      setIsCreatingTag(false);
      setNewTagName('');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.failed'), 'error');
    }
  };

  const toggleAddTag = (id: string) => {
    setBulkAddTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Remove from remove-set if added
    setBulkRemoveTagIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleRemoveTag = (id: string) => {
    setBulkRemoveTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Remove from add-set if toggled into remove
    setBulkAddTagIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBulkUpdate = async () => {
    if (!walletId || selectedIds.size === 0) return;
    const payload: {
      transaction_ids: string[];
      category_id?: string;
      add_tag_ids?: string[];
      remove_tag_ids?: string[];
    } = { transaction_ids: Array.from(selectedIds) };
    if (bulkEditCategoryId) payload.category_id = bulkEditCategoryId;
    if (bulkAddTagIds.size > 0) payload.add_tag_ids = Array.from(bulkAddTagIds);
    if (bulkRemoveTagIds.size > 0) payload.remove_tag_ids = Array.from(bulkRemoveTagIds);

    if (!payload.category_id && !payload.add_tag_ids && !payload.remove_tag_ids) {
      toast(t('walletView.bulkEditNoChange'), 'error');
      return;
    }

    setBulkUpdating(true);
    try {
      const res = await expensesApi.bulkUpdate(walletId, payload);
      const count = res.updated_count;
      const plural = count === 1 ? '' : 's';
      toast(t('walletView.bulkUpdateToast', { count, plural }), 'success');
      setShowEditCategoryModal(false);
      setShowEditLabelModal(false);
      handleDeselectAll();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.failed'), 'error');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkAISuggest = async () => {
    if (!walletId || selectedIds.size === 0) return;
    setShowAISuggestModal(false);
    setBulkAISuggesting(true);

    const selectedItems = (data?.items ?? []).filter((item) => selectedIds.has(item.id));
    setProcessingIds(new Set(selectedItems.map((item) => item.id)));
    const localCategories = [...categories];
    const localTags = [...allTags];
    let successCount = 0;
    let failCount = 0;

    for (const item of selectedItems) {
      try {
        const result = await expensesApi.aiCategorize(walletId, item.id);

        let categoryId = item.category.id;
        if (result.is_new_category) {
          const existing = localCategories.find((c) => c.name.toLowerCase() === result.category_name.toLowerCase());
          if (existing) {
            categoryId = existing.id;
          } else {
            const newCat = await categoriesApi.create({ name: result.category_name });
            localCategories.push(newCat);
            categoryId = newCat.id;
          }
        } else {
          const match = localCategories.find((c) => c.name.toLowerCase() === result.category_name.toLowerCase());
          if (match) categoryId = match.id;
        }

        const tagIds = item.tags.map((t) => t.id);
        for (const tag of result.suggested_tags) {
          if (tag.is_new) {
            const existing = localTags.find((t) => t.name.toLowerCase() === tag.name.toLowerCase());
            if (existing) {
              if (!tagIds.includes(existing.id)) tagIds.push(existing.id);
            } else {
              const newTag = await tagsApi.create({ name: tag.name });
              localTags.push(newTag);
              if (!tagIds.includes(newTag.id)) tagIds.push(newTag.id);
            }
          } else {
            const match = localTags.find((t) => t.name.toLowerCase() === tag.name.toLowerCase());
            if (match && !tagIds.includes(match.id)) tagIds.push(match.id);
          }
        }

        await expensesApi.update(walletId, item.id, { category_id: categoryId, tag_ids: tagIds });
        successCount++;
      } catch {
        failCount++;
      } finally {
        setProcessingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
      }
    }

    setCategories(localCategories);
    setAllTags(localTags);
    setProcessingIds(new Set());
    if (successCount > 0) toast(t('walletView.bulkAISuggestToast', { count: successCount, plural: successCount === 1 ? '' : 's' }), 'success');
    if (failCount > 0) toast(t('walletView.bulkAISuggestFailed', { count: failCount }), 'error');
    handleDeselectAll();
    await load();
    setBulkAISuggesting(false);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const hasFilters = search || selectedCategoryIds.length > 0 || selectedTagIds.length > 0 || startDate || endDate || minAmount || maxAmount;
  // Count of filters controlled by the advanced panel (search & category have their own UI)
  const panelFilterCount =
    (startDate ? 1 : 0) + (endDate ? 1 : 0) + (minAmount ? 1 : 0) + (maxAmount ? 1 : 0) + selectedTagIds.length;
  const selCount = selectedIds.size;

  // Tags that can still match given the other active filters; ineligible ones are dimmed, not hidden.
  const availableTagIds = useMemo(() => new Set(data?.available_tag_ids ?? []), [data]);

  const selectedTransactionTags = useMemo(() => {
    if (!data) return [] as TagBrief[];
    const seen = new Map<string, TagBrief>();
    for (const item of data.items) {
      if (selectedIds.has(item.id)) {
        for (const tag of item.tags) seen.set(tag.id, tag);
      }
    }
    return [...seen.values()];
  }, [data, selectedIds]);

  // Net amount of selected transactions (income positive, expense negative)
  const selectedSum = useMemo(() => {
    if (!data) return 0;
    let total = 0;
    for (const item of data.items) {
      if (selectedIds.has(item.id)) {
        total += item.type === 'income' ? item.amount : -item.amount;
      }
    }
    return total;
  }, [data, selectedIds]);

  // Bulk action toolbar (floating, Linear-style)
  const bulkToolbar = selCount > 0 ? (
    <div
      role="toolbar"
      aria-label={t('walletView.bulkSelected', { count: selCount })}
      style={{
        position: 'fixed',
        bottom: isMobile
          ? 'calc(60px + env(safe-area-inset-bottom, 0px) + 8px)'
          : '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'white',
        border: '1px solid var(--cream-darker)',
        borderRadius: 100,
        padding: '6px 8px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', padding: '0 4px 0 6px' }}>
        {t('walletView.bulkSelected', { count: selCount })}
      </span>
      <div style={{ width: 1, height: 18, background: 'var(--cream-darker)', flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', padding: '0 4px', display: 'flex', alignItems: 'baseline', gap: 6 }}>
        {fmt(selectedSum, wallet?.currency ?? 'USD')}
        {fxRate != null && user?.global_currency && (
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
            ≈ {fmt(selectedSum * fxRate, user.global_currency)}
          </span>
        )}
      </span>
      <button
        className="btn btn-secondary btn-sm"
        style={{ borderRadius: 100, fontSize: 13, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
        onClick={() => setShowActionsBar((v) => !v)}
      >
        <Command size={13} />
        {t('walletView.bulkActions')}
      </button>
      <div style={{ width: 1, height: 18, background: 'var(--cream-darker)', flexShrink: 0 }} />
      <button
        className="btn btn-ghost btn-sm"
        style={{ borderRadius: 100, padding: '5px 8px', lineHeight: 0, border: '1px solid var(--cream-darker)' }}
        onClick={handleDeselectAll}
        title={t('walletView.bulkDeselectAll')}
      >
        <X size={14} />
      </button>
    </div>
  ) : null;

  // Bulk delete confirmation modal
  const deleteModal = (
    <Modal
      open={showDeleteModal}
      onClose={() => setShowDeleteModal(false)}
      title={t('walletView.bulkDeleteConfirmTitle')}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-md" onClick={() => setShowDeleteModal(false)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-md"
            style={{ background: 'var(--rose)', color: 'white', border: 'none' }}
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? '…' : t('walletView.bulkDelete')}
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
        {t('walletView.bulkDeleteConfirmBody', { count: selCount, plural: selCount === 1 ? '' : 's' })}
      </p>
    </Modal>
  );

  // Bulk edit category modal
  const editCategoryObj = categories.find((c) => c.id === bulkEditCategoryId) ?? null;
  const editCategoryModal = (
    <Modal
      open={showEditCategoryModal}
      onClose={() => setShowEditCategoryModal(false)}
      title={t('walletView.bulkEditTitle', { count: selCount, plural: selCount === 1 ? '' : 's' })}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-md" onClick={() => setShowEditCategoryModal(false)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary btn-md"
            onClick={handleBulkUpdate}
            disabled={bulkUpdating}
          >
            {bulkUpdating ? '…' : t('walletView.bulkEditApply')}
          </button>
        </div>
      }
    >
      <div className="input-group">
        <label className="input-label">{t('walletView.bulkEditCategoryLabel')}</label>
        <CategorySelect
          value={editCategoryObj?.name ?? ''}
          categories={categories}
          onSelect={(cat) => setBulkEditCategoryId(cat.id)}
          matchBy="name"
          size="md"
        />
        {bulkEditCategoryId && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 4, fontSize: 12 }}
            onClick={() => setBulkEditCategoryId('')}
          >
            <X size={12} /> {t('walletView.bulkEditCategoryPlaceholder')}
          </button>
        )}
      </div>
    </Modal>
  );

  // Bulk edit labels modal
  const editLabelsModal = (
    <Modal
      open={showEditLabelModal}
      onClose={() => setShowEditLabelModal(false)}
      title={t('walletView.bulkEditTitle', { count: selCount, plural: selCount === 1 ? '' : 's' })}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-md" onClick={() => setShowEditLabelModal(false)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary btn-md"
            onClick={handleBulkUpdate}
            disabled={bulkUpdating}
          >
            {bulkUpdating ? '…' : t('walletView.bulkEditApply')}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Add tags section */}
        <div className="input-group">
          <label className="input-label">{t('walletView.bulkEditAddTagsLabel')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {/* Inline create-tag pill */}
            {isCreatingTag ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                border: '1.5px solid var(--forest)', background: 'white',
              }}>
                <Plus size={11} style={{ color: 'var(--forest)', flexShrink: 0 }} />
                <input
                  ref={newTagInputRef}
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void handleCreateTag(); }
                    if (e.key === 'Escape') { setIsCreatingTag(false); setNewTagName(''); }
                  }}
                  onBlur={() => { if (!newTagName.trim()) { setIsCreatingTag(false); setNewTagName(''); } }}
                  placeholder={t('walletView.bulkEditCreateTagPlaceholder')}
                  style={{ border: 'none', outline: 'none', fontSize: 12, fontFamily: 'var(--font-body)', background: 'transparent', color: 'var(--ink)', width: 80 }}
                />
              </div>
            ) : (
              <button
                onClick={() => { setIsCreatingTag(true); setNewTagName(''); setTimeout(() => newTagInputRef.current?.focus(), 20); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', border: '1.5px dashed var(--cream-darker)',
                  background: 'transparent', color: 'var(--ink-faint)', transition: 'all 0.15s',
                }}
              >
                <Plus size={11} />
                {t('walletView.bulkEditCreateTag')}
              </button>
            )}
            {allTags.map((tag) => {
              const active = bulkAddTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleAddTag(tag.id)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 100, fontSize: 12,
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer', transition: 'all 0.15s',
                    border: `1.5px solid ${tag.color ? (active ? tag.color : `${tag.color}50`) : (active ? 'var(--ink-light)' : 'var(--cream-darker)')}`,
                    background: tag.color ? `${tag.color}14` : 'var(--cream-dark)',
                    color: active ? 'var(--ink)' : 'var(--ink-mid)',
                  }}
                >
                  {active
                    ? <Check size={13} strokeWidth={2.1} style={{ color: tag.color ?? 'var(--ink)', flexShrink: 0, display: 'block' }} />
                    : <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--sand-dark)', flexShrink: 0 }} />
                  }
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Remove tags section — only shows tags present on the selected transactions */}
        <div className="input-group">
          <label className="input-label">{t('walletView.bulkEditRemoveTagsLabel')}</label>
          {selectedTransactionTags.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', margin: 0 }}>
              {t('walletView.bulkEditRemoveTagsEmpty')}
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedTransactionTags.map((tag) => {
                const active = bulkRemoveTagIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleRemoveTag(tag.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.15s',
                      border: `1.5px solid ${tag.color ? `${tag.color}50` : 'var(--cream-darker)'}`,
                      background: tag.color ? `${tag.color}14` : 'var(--cream-dark)',
                      color: 'var(--ink-mid)',
                      textDecoration: active ? 'line-through' : 'none',
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );

  const aiSuggestModal = (
    <Modal
      open={showAISuggestModal}
      onClose={() => setShowAISuggestModal(false)}
      title={t('walletView.bulkAISuggestTitle')}
      size="sm"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-md" onClick={() => setShowAISuggestModal(false)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary btn-md"
            onClick={handleBulkAISuggest}
            disabled={bulkAISuggesting}
          >
            {bulkAISuggesting ? '…' : <><Sparkles size={13} /> {t('walletView.bulkAISuggestConfirm')}</>}
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>
        {t('walletView.bulkAISuggestBody', { count: selCount, plural: selCount === 1 ? '' : 's' })}
      </p>
    </Modal>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{wallet?.name ?? t('walletView.titleFallback')}</h1>
          <p className="page-subtitle">
            {wallet ? `${fmt(wallet.balance, wallet.currency)} balance · ${fmt(wallet.total_income, wallet.currency)} income · ${fmt(wallet.total_expenses, wallet.currency)} expenses` : ''}
          </p>
        </div>
      </div>

      {/* Search & filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <form
          style={{ flex: 1, minWidth: 200, position: 'relative' }}
          onSubmit={(e) => { e.preventDefault(); setParam({ q: searchInput, page: null }); }}
        >
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)' }} />
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder={t('walletView.searchPlaceholder')}
            enterKeyHint="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false;
              setSearchInput((e.target as HTMLInputElement).value);
            }}
          />
        </form>

        <MultiCategorySelect
          value={selectedCategoryIds}
          categories={categories}
          onChange={(ids) => setParam({ category_ids: ids, page: null })}
          placeholder={t('walletView.filterAllCategories')}
        />

        <button
          className={`btn btn-secondary btn-md ${showFilters ? 'btn-active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          style={{ position: 'relative', ...(showFilters ? { background: 'var(--cream-darker)' } : {}) }}
        >
          <Filter size={14} />
          {t('walletView.filterFilters')}
          {panelFilterCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 8,
                background: 'var(--forest)',
                color: 'white',
                fontSize: 10,
                fontWeight: 600,
                lineHeight: '16px',
                textAlign: 'center',
              }}
            >
              {panelFilterCount}
            </span>
          )}
        </button>

        <button
          className="btn btn-secondary btn-md"
          onClick={() => setParam({ sort_order: sortOrder === 'desc' ? 'asc' : 'desc' })}
          title="Toggle sort order"
        >
          {sortOrder === 'desc' ? <SortDesc size={14} /> : <SortAsc size={14} />}
        </button>
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div style={{
          background: 'white',
          border: '1px solid var(--cream-darker)',
          borderRadius: 12,
          padding: '16px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          animation: 'slideDown 0.2s ease both',
        }}>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterFromDate')}</label>
            <DatePicker value={startDate} onChange={(v) => setParam({ start_date: v, page: null })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterToDate')}</label>
            <DatePicker value={endDate} onChange={(v) => setParam({ end_date: v, page: null })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterMinAmount')}</label>
            <input className="input" type="number" placeholder="0" value={minAmount} onChange={(e) => setParam({ min_amount: e.target.value, page: null })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterMaxAmount')}</label>
            <input className="input" type="number" placeholder="∞" value={maxAmount} onChange={(e) => setParam({ max_amount: e.target.value, page: null })} />
          </div>
          <div className="input-group">
            <label className="input-label">{t('walletView.filterSortBy')}</label>
            <Select
              value={sortBy}
              onChange={(v) => setParam({ sort_by: v })}
              options={[{ value: 'date', label: t('walletView.filterSortDate') }, { value: 'amount', label: t('walletView.filterSortAmount') }]}
            />
          </div>
          {allTags.length > 0 && (
            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
              <label className="input-label">{t('walletView.filterTags')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map((tag) => {
                  const active = selectedTagIds.includes(tag.id);
                  const eligible = active || availableTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 10px',
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: active ? 600 : 500,
                        cursor: 'pointer',
                        border: `1.5px solid ${tag.color ? (active ? tag.color : `${tag.color}50`) : (active ? 'var(--ink-light)' : 'var(--cream-darker)')}`,
                        background: tag.color ? `${tag.color}14` : 'var(--cream-dark)',
                        color: active ? 'var(--ink)' : 'var(--ink-mid)',
                        opacity: eligible ? 1 : 0.4,
                        transition: 'all 0.15s',
                      }}
                    >
                      {active
                        ? <Check size={13} strokeWidth={2.1} style={{ color: tag.color ?? 'var(--ink)', flexShrink: 0, display: 'block' }} />
                        : <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color ?? 'var(--sand-dark)', flexShrink: 0 }} />
                      }
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {hasFilters && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-ghost btn-md"
                onClick={() => setParam({ q: null, category_ids: null, tag_ids: null, start_date: null, end_date: null, min_amount: null, max_amount: null, page: null })}
              >
                <X size={14} /> {t('walletView.filterClearAll')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Expense list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">{t('walletView.noTransactionsTitle')}</p>
          <p className="empty-state-desc">
            {hasFilters ? t('walletView.noTransactionsDescFiltered') : t('walletView.noTransactionsDescEmpty')}
          </p>
        </div>
      ) : (
        <>


          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={isSelecting ? handleDeselectAll : () => setIsSelecting(true)}
              >
                {isSelecting ? t('common.cancel') : t('walletView.bulkEnterSelect')}
              </button>
              {fxRate != null && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handleToggleConverted}
                  style={{ gap: 5, fontSize: 12 }}
                >
                  <ArrowLeftRight size={12} />
                  {showConverted ? `${user?.global_currency} (converted)` : `${wallet?.currency} (original)`}
                </button>
              )}
            </div>
          )}
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
            {data.items.map((expense, i) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                currency={wallet?.currency ?? 'USD'}
                walletId={walletId!}
                isLast={i === data.items.length - 1}
                fxRate={fxRate}
                globalCurrency={user?.global_currency ?? null}
                isMobile={isMobile}
                showConverted={showConverted}
                switching={switching}
                isSelected={selectedIds.has(expense.id)}
                isSelecting={isSelecting}
                isProcessing={processingIds.has(expense.id)}
                onSelect={handleSelect}
                onNavigate={navigate}
                backSearch={searchParams.toString()}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setParam({ page: String(page - 1) })}
              >
                {t('walletView.paginationPrev')}
              </button>
              <span style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                {t('walletView.paginationPage', { page, total: totalPages })}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                disabled={page === totalPages}
                onClick={() => setParam({ page: String(page + 1) })}
              >
                {t('walletView.paginationNext')}
              </button>
            </div>
          )}

          <p style={{ fontSize: 12, color: 'var(--ink-faint)', textAlign: 'center', marginTop: 12 }}>
            {t('walletView.showingCount', { shown: data.items.length, total: data.total })}
          </p>
        </>
      )}

      {bulkToolbar}
      {deleteModal}
      {editCategoryModal}
      {editLabelsModal}
      {aiSuggestModal}
      <BulkActionsBar
        open={showActionsBar}
        onClose={() => setShowActionsBar(false)}
        isMobile={isMobile}
        onDeleteSelected={() => { setShowActionsBar(false); setShowDeleteModal(true); }}
        onEditCategory={() => { setShowActionsBar(false); openEditCategoryModal(); }}
        onEditLabels={() => { setShowActionsBar(false); openEditLabelModal(); }}
        onAISuggest={() => { setShowActionsBar(false); setShowAISuggestModal(true); }}
      />
    </div>
  );
}

function ExpenseRow({
  expense,
  currency,
  walletId,
  isLast,
  fxRate,
  globalCurrency,
  isMobile,
  showConverted,
  switching,
  isSelected,
  isSelecting,
  isProcessing,
  onSelect,
  onNavigate,
  backSearch,
}: {
  expense: TransactionResponse;
  currency: string;
  walletId: string;
  isLast: boolean;
  fxRate: number | null;
  globalCurrency: string | null;
  isMobile: boolean;
  showConverted: boolean;
  switching: boolean;
  isSelected: boolean;
  isSelecting: boolean;
  isProcessing: boolean;
  onSelect: (id: string, e: React.MouseEvent) => void;
  onNavigate: NavigateFunction;
  backSearch: string;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const convertedAmount = fxRate != null ? expense.amount * fxRate : null;
  const hasConversion = convertedAmount != null && globalCurrency != null;
  const sign = expense.type === 'income' ? '+' : '';
  const amountColor = expense.type === 'income' ? 'var(--forest)' : 'var(--ink)';

  // Long-press state for mobile multi-select entry
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  // Track whether a long-press fired so the pointerUp click is suppressed
  const longPressDidFireRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMobile) return;
    longPressDidFireRef.current = false;
    pressStartPosRef.current = { x: e.clientX, y: e.clientY };
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      longPressDidFireRef.current = true;
      onSelect(expense.id, e as unknown as React.MouseEvent);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pressStartPosRef.current) return;
    const dx = e.clientX - pressStartPosRef.current.x;
    const dy = e.clientY - pressStartPosRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    }
  };

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    pressStartPosRef.current = null;
  };

  const showCheckbox = isSelecting || (!isMobile && isHovered);

  const rowContent = (
    <>
      {/* Left-zone click overlay — desktop hover mode only; covers padding + checkbox + gap */}
      {!isMobile && showCheckbox && !isSelecting && (
        <div
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, cursor: 'pointer', zIndex: 1 }}
          onClick={(e) => { e.stopPropagation(); onSelect(expense.id, e as React.MouseEvent); }}
        />
      )}
      {/* Checkbox — slides in from the left on desktop hover or when selecting */}
      <div
        style={{
          width: showCheckbox ? 20 : 0,
          height: 20,
          borderRadius: '50%',
          border: showCheckbox ? (isSelected ? 'none' : '2px solid var(--ink-light)') : 'none',
          background: isSelected ? 'var(--forest)' : 'transparent',
          flexShrink: 0,
          transition: 'width 0.15s, margin-right 0.15s, opacity 0.15s',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: showCheckbox ? 0 : -12,
          opacity: showCheckbox ? 1 : 0,
        }}
      >
        {isSelected && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ position: 'relative', flexShrink: 0 }}>
        <CategoryIcon
          iconName={expense.category.icon}
          color={expense.category.color}
          size={17}
          containerSize={38}
          borderRadius={10}
          fallbackLetter={expense.category.name[0]}
        />
        {isProcessing && (
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.75)',
          }}>
            <span className="btn-spinner" style={{ color: 'var(--forest)' }} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {expense.description ?? expense.category.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', display: 'flex', gap: 6, alignItems: 'center', overflow: 'hidden', flexWrap: 'nowrap' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
            {expense.category.name}
          </span>
          {expense.children && expense.children.length > 0 && (
            <>
              <span style={{ flexShrink: 0 }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, whiteSpace: 'nowrap' }}>
                <Layers size={11} />
                {expense.children.length}
              </span>
            </>
          )}
          {expense.tags.length > 0 && (
            <>
              <span style={{ flexShrink: 0 }}>·</span>
              {expense.tags.slice(0, 2).map((t) => (
                <span key={t.id} className="chip" style={{ fontSize: 11, padding: '1px 6px', flexShrink: 0, whiteSpace: 'nowrap' }}>{t.name}</span>
              ))}
              {expense.tags.length > 2 && (
                <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>+{expense.tags.length - 2}</span>
              )}
            </>
          )}
          {!isMobile && hasConversion && (
            <>
              <span style={{ flexShrink: 0 }}>·</span>
              <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{fmtRelative(expense.date)}</span>
            </>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isMobile && hasConversion ? (
          <>
            <div
              className={switching ? 'amount-switching' : ''}
              style={{ fontSize: 15, fontWeight: 600, color: amountColor }}
            >
              {sign}{showConverted ? fmt(convertedAmount!, globalCurrency!) : fmt(expense.amount, currency)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              {fmtRelative(expense.date)}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, color: amountColor }}>
              {sign}{fmt(expense.amount, currency)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
              {hasConversion
                ? <span style={{ color: 'var(--ink-mid)' }}>≈ {fmt(convertedAmount!, globalCurrency!)}</span>
                : fmtRelative(expense.date)
              }
            </div>
          </>
        )}
      </div>
    </>
  );

  const sharedStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    textDecoration: 'none',
    borderBottom: isLast ? 'none' : '1px solid var(--cream)',
    transition: 'background 0.1s, opacity 0.2s',
    background: isSelected ? 'var(--cream)' : 'transparent',
    cursor: isProcessing ? 'default' : isSelecting ? 'default' : 'pointer',
    userSelect: 'none' as const,
    opacity: isProcessing ? 0.45 : 1,
    pointerEvents: isProcessing ? 'none' : undefined,
  };

  if (isMobile) {
    // On mobile: render as div so pointer events work for long-press
    // Navigate programmatically on short tap; toggle on tap when selecting
    return (
      <div
        role="row"
        aria-selected={isSelected}
        style={sharedStyle}
        onClick={(e) => {
          if (longPressDidFireRef.current) {
            longPressDidFireRef.current = false;
            return;
          }
          if (isSelecting) {
            onSelect(expense.id, e);
          } else {
            onNavigate(`/wallets/${walletId}/expenses/${expense.id}`, { state: { backSearch } });
          }
        }}
        onMouseEnter={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--cream)';
        }}
        onMouseLeave={(e) => {
          if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {rowContent}
      </div>
    );
  }

  // Desktop: always a div so the element persists across isSelecting state changes,
  // which lets CSS transitions fire correctly when checkboxes slide in/out.
  return (
    <div
      role="row"
      aria-selected={isSelected}
      style={sharedStyle}
      onClick={(e) => {
        if (isSelecting) {
          onSelect(expense.id, e);
        } else if (e.ctrlKey || e.metaKey || e.shiftKey) {
          onSelect(expense.id, e);
        } else {
          onNavigate(`/wallets/${walletId}/expenses/${expense.id}`, { state: { backSearch } });
        }
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--cream)';
        setIsHovered(true);
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        setIsHovered(false);
      }}
    >
      {rowContent}
    </div>
  );
}

function BulkActionsBar({
  open,
  onClose,
  isMobile,
  onDeleteSelected,
  onEditCategory,
  onEditLabels,
  onAISuggest,
}: {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
  onDeleteSelected: () => void;
  onEditCategory: () => void;
  onEditLabels: () => void;
  onAISuggest: () => void;
}) {
  const { t } = useTranslation();
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const actions = [
    { id: 'delete', label: t('walletView.bulkActionDelete'), icon: Trash2, danger: true, execute: onDeleteSelected },
    { id: 'editCategory', label: t('walletView.bulkActionEditCategory'), icon: FolderOpen, danger: false, execute: onEditCategory },
    { id: 'editLabels', label: t('walletView.bulkActionEditLabels'), icon: Tag, danger: false, execute: onEditLabels },
    { id: 'aiSuggest', label: t('walletView.bulkActionAISuggest'), icon: Sparkles, danger: false, execute: onAISuggest },
  ];

  useEffect(() => {
    if (open) setHighlightedIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, actions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && actions[highlightedIndex]) { actions[highlightedIndex].execute(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose, actions, highlightedIndex]);

  if (!open) return null;

  const panelBottom = isMobile
    ? 'calc(60px + env(safe-area-inset-bottom, 0px) + 62px)'
    : '80px';

  return createPortal(
    <>
      {/* Click-away backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 550 }} onClick={onClose} />
      {/* Positioning shell (holds translateX) */}
      <div
        style={{
          position: 'fixed',
          bottom: panelBottom,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 551,
          width: 260,
        }}
      >
        {/* Animated panel */}
        <div
          className="animate-fade-in"
          style={{
            background: 'white',
            borderRadius: 14,
            border: '1px solid var(--cream-darker)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 4 }}>
            {actions.map((action, i) => (
              <button
                key={action.id}
                onClick={() => { action.execute(); onClose(); }}
                onMouseEnter={() => setHighlightedIndex(i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 8,
                  background: i === highlightedIndex ? 'var(--cream)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontFamily: 'var(--font-body)',
                  color: action.danger ? 'var(--rose)' : 'var(--ink)',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
              >
                <action.icon size={14} style={{ flexShrink: 0 }} />
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
