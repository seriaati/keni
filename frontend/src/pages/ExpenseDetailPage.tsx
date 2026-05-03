import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CornerUpLeft, Bot, Layers, Pencil, Trash2, Check, X, Plus, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { expenses as expensesApi, categories as categoriesApi, tags as tagsApi, wallets as walletsApi, transactionLinks } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { DatePicker } from '../components/ui/DatePicker';
import { Modal } from '../components/ui/Modal';
import { CategorySelect } from '../components/ui/CategorySelect';
import type { CategoryResponse, TransactionLinkBrief, TransactionResponse, TagResponse, WalletResponse } from '../lib/types';
import { LinkedTransactionsPicker } from '../components/LinkedTransactionsPicker';
import { fmt, fmtDate } from '../lib/utils';
import { CategoryIcon } from '../lib/categoryIcons';
import { useAuth } from '../contexts/AuthContext';
import { getExchangeRate } from '../lib/fx';

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

// Keep legacy alias for TagPicker
type TagDropdownPos = DropdownPos;

const DROPDOWN_MAX_H = 260;
const DROPDOWN_MARGIN = 4;


interface TagPickerProps {
  selectedIds: string[];
  allTags: TagResponse[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onCreateAndAdd: (name: string) => Promise<void>;
}

function TagPicker({ selectedIds, allTags, onAdd, onRemove, onCreateAndAdd }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [pos, setPos] = useState<TagDropdownPos | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const unselected = allTags.filter((t) => !selectedIds.includes(t.id));
  const filtered = query.trim()
    ? unselected.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()))
    : unselected;

  const trimmed = query.trim();
  const exactMatch = allTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  const totalItems = filtered.length + (showCreate ? 1 : 0);

  const measure = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < DROPDOWN_MAX_H + DROPDOWN_MARGIN && spaceAbove > spaceBelow;
    setPos({
      top: openUp ? r.top + window.scrollY - DROPDOWN_MARGIN : r.bottom + window.scrollY + DROPDOWN_MARGIN,
      left: r.left + window.scrollX,
      width: r.width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); setFocusedIndex(0); return; }
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => { setFocusedIndex(0); }, [query]);

  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const el = listRef.current?.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const reposition = () => measure();
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, totalItems - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex < filtered.length) {
          const tag = filtered[focusedIndex];
          if (tag) { onAdd(tag.id); setQuery(''); setFocusedIndex(0); }
        } else if (showCreate) {
          handleCreate();
        }
        break;
      case 'Escape':
        setOpen(false);
        break;
    }
  };

  const handleCreate = async () => {
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await onCreateAndAdd(trimmed);
      setQuery('');
      setFocusedIndex(0);
    } finally {
      setCreating(false);
    }
  };

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id));

  const dropdown = open && pos ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'absolute',
        top: pos.openUp ? undefined : pos.top,
        bottom: pos.openUp ? window.innerHeight + window.scrollY - pos.top : undefined,
        left: pos.left,
        width: Math.max(pos.width, 220),
        zIndex: 9999,
        background: 'white',
        border: '1.5px solid var(--sand)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'ssDropIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--cream-dark)' }}>
        <Search size={13} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        <input
          ref={searchRef}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--ink)', background: 'transparent' }}
          placeholder="Search or create tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <ul ref={listRef} style={{ listStyle: 'none', padding: 4, maxHeight: 200, overflowY: 'auto', margin: 0 }}>
        {filtered.length === 0 && !showCreate && (
          <li style={{ padding: '10px', fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>
            {unselected.length === 0 ? 'All tags added' : 'No results'}
          </li>
        )}
        {filtered.map((tag, i) => (
          <li
            key={tag.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 'calc(var(--radius) - 4px)',
              fontSize: 13,
              cursor: 'pointer',
              background: i === focusedIndex ? 'var(--cream-dark)' : 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={() => setFocusedIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onAdd(tag.id);
              setQuery('');
              setFocusedIndex(0);
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: tag.color ?? 'var(--ink-faint)',
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: 'var(--ink)' }}>{tag.name}</span>
          </li>
        ))}
        {showCreate && (
          <li
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 'calc(var(--radius) - 4px)',
              fontSize: 13,
              cursor: creating ? 'not-allowed' : 'pointer',
              background: focusedIndex === filtered.length ? 'var(--cream-dark)' : 'transparent',
              transition: 'background 0.1s',
              color: 'var(--forest)',
              fontWeight: 500,
              opacity: creating ? 0.6 : 1,
            }}
            onMouseEnter={() => setFocusedIndex(filtered.length)}
            onMouseDown={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <Plus size={13} style={{ flexShrink: 0 }} />
            <span>Create &ldquo;{trimmed}&rdquo;</span>
          </li>
        )}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {selectedTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selectedTags.map((tag) => (
            <span
              key={tag.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px 3px 10px',
                borderRadius: 100,
                fontSize: 12,
                fontFamily: 'var(--font-body)',
                background: tag.color ? `${tag.color}14` : 'var(--cream-dark)',
                border: `1.5px solid ${tag.color ? `${tag.color}50` : 'var(--sand)'}`,
                color: 'var(--ink-mid)',
              }}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => onRemove(tag.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.6,
                  lineHeight: 1,
                }}
                aria-label={`Remove ${tag.name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 10px',
            borderRadius: 100,
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            background: 'transparent',
            border: '1.5px dashed var(--sand)',
            color: 'var(--ink-faint)',
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--forest-mid)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--forest)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--sand)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-faint)'; }}
        >
          <Plus size={11} />
          Add tag
        </button>
        {dropdown}
      </div>
    </div>
  );
}

export function ExpenseDetailPage() {
  const { t } = useTranslation();
  const { walletId, expenseId } = useParams<{ walletId: string; expenseId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [currency, setCurrency] = useState('USD');
  const [fxRate, setFxRate] = useState<number | null>(null);

  const [expense, setExpense] = useState<TransactionResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allWallets, setAllWallets] = useState<WalletResponse[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<TransactionLinkBrief[]>([]);

  const [form, setForm] = useState({
    amount: '',
    description: '',
    category_id: '',
    date: '',
    tag_ids: [] as string[],
  });

  useEffect(() => {
    const globalCurrency = user?.global_currency;
    if (!globalCurrency || !currency || globalCurrency === currency) {
      setFxRate(null);
      return;
    }
    getExchangeRate(currency, globalCurrency).then(setFxRate);
  }, [currency, user?.global_currency]);

  useEffect(() => {
    if (!walletId || !expenseId) return;
    Promise.all([
      expensesApi.get(walletId, expenseId),
      categoriesApi.list(),
      tagsApi.list(),
      walletsApi.get(walletId),
      walletsApi.list(),
    ]).then(([exp, cats, tags, wallet, allWs]) => {
      setCurrency(wallet.currency);
      setExpense(exp);
      setCategories(cats);
      setAllTags(tags);
      setAllWallets(allWs);
      setForm({
        amount: String(exp.amount),
        description: exp.description ?? '',
        category_id: exp.category.id,
        date: exp.date.slice(0, 10),
        tag_ids: exp.tags.map((t) => t.id),
      });
    }).catch(() => toast(t('expenseDetail.toastLoadFailed'), 'error'))
      .finally(() => setLoading(false));
  }, [walletId, expenseId, toast]);

  const handleSave = async () => {
    if (!walletId || !expenseId || !expense) return;
    setSaving(true);
    try {
      const updated = await expensesApi.update(walletId, expenseId, {
        amount: Number(form.amount),
        description: form.description || undefined,
        category_id: form.category_id,
        date: form.date ? new Date(form.date).toISOString() : undefined,
        tag_ids: form.tag_ids,
      });
      const originalIds = expense.linked_transactions.map((l) => l.id);
      const pendingIds = pendingLinks.map((l) => l.id);
      const toAdd = pendingIds.filter((id) => !originalIds.includes(id));
      const toRemove = originalIds.filter((id) => !pendingIds.includes(id));
      await Promise.all([
        ...toAdd.map((id) => transactionLinks.add(expenseId, id)),
        ...toRemove.map((id) => transactionLinks.remove(expenseId, id)),
      ]);
      setExpense({ ...updated, linked_transactions: pendingLinks });
      setEditing(false);
      toast(t('expenseDetail.toastUpdated'), 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!walletId || !expenseId) return;
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await expensesApi.delete(walletId, expenseId);
      toast(t('expenseDetail.toastDeleted'), 'success');
      navigate(`/wallets/${walletId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete', 'error');
      setDeleting(false);
    }
  };

  const handleLink = async (transaction: TransactionResponse) => {
    const brief: TransactionLinkBrief = {
      id: transaction.id,
      wallet_id: transaction.wallet_id,
      category: transaction.category,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      date: transaction.date,
      tags: transaction.tags,
    };
    setPendingLinks((prev) => prev.some((l) => l.id === brief.id) ? prev : [...prev, brief]);
  };

  const handleUnlink = (targetId: string) => {
    setPendingLinks((prev) => prev.filter((l) => l.id !== targetId));
  };

  const handleAddTag = (id: string) => {
    setForm((f) => ({ ...f, tag_ids: f.tag_ids.includes(id) ? f.tag_ids : [...f.tag_ids, id] }));
  };

  const handleRemoveTag = (id: string) => {
    setForm((f) => ({ ...f, tag_ids: f.tag_ids.filter((t) => t !== id) }));
  };

  const handleCreateAndAddTag = async (name: string) => {
    try {
      const newTag = await tagsApi.create({ name });
      setAllTags((prev) => [...prev, newTag]);
      setForm((f) => ({ ...f, tag_ids: [...f.tag_ids, newTag.id] }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create tag', 'error');
    }
  };

  const handleCreateAndSelectCategory = async (name: string) => {
    try {
      const newCat = await categoriesApi.create({ name });
      setCategories((prev) => [...prev, newCat]);
      setForm((f) => ({ ...f, category_id: newCat.id }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create category', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
      </div>
    );
  }

  if (!expense) return <p style={{ color: 'var(--ink-light)' }}>{t('expenseDetail.notFound')}</p>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 560 }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => navigate(`/wallets/${walletId}`)}
        style={{ marginBottom: 20, paddingLeft: 4 }}
      >
        <ArrowLeft size={15} /> {t('expenseDetail.backToWallet')}
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="page-title">{t('expenseDetail.title')}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {!editing ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => { setPendingLinks(expense.linked_transactions); setEditing(true); }}>
                <Pencil size={13} /> {t('expenseDetail.btnEdit')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
                {deleting ? <span className="btn-spinner" /> : <Trash2 size={13} />}
                {t('expenseDetail.btnDelete')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
                <X size={13} /> {t('expenseDetail.btnCancel')}
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? <span className="btn-spinner" /> : <Check size={13} />}
                {t('expenseDetail.btnSave')}
              </button>
            </>
          )}
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('expenseDetail.deleteTitle')}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>
              <Trash2 size={13} /> {t('common.delete')}
            </button>
          </div>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)', margin: 0 }}>
          {expense.children && expense.children.length > 0
            ? <span dangerouslySetInnerHTML={{ __html: t('expenseDetail.deleteGroupConfirm', { count: expense.children.length, plural: expense.children.length !== 1 ? 's' : '' }) }} />
            : t('expenseDetail.deleteConfirm')
          }
        </p>
      </Modal>

      <LinkedTransactionsPicker
        open={showLinkPicker}
        onClose={() => setShowLinkPicker(false)}
        currentTransactionId={expenseId ?? ''}
        currentWalletId={walletId ?? ''}
        wallets={allWallets}
        alreadyLinkedIds={pendingLinks.map((l) => l.id)}
        onLink={handleLink}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Part of group indicator */}
        {expense.group_id && (
          <Link
            to={`/wallets/${walletId}/expenses/${expense.group_id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              color: 'var(--ink-mid)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            <CornerUpLeft size={14} />
            {t('expenseDetail.goBackToParent')}
          </Link>
        )}

        {/* Amount */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('expenseDetail.sectionAmount')}</div>
          {editing ? (
            <input
              className="input"
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              style={{ fontSize: 24, fontFamily: 'var(--font-display)', height: 'auto', padding: '4px 8px' }}
            />
          ) : (
            <div>
              <div style={{ fontSize: 32, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
                {fmt(expense.amount, currency)}
              </div>
              {fxRate != null && user?.global_currency && (
                <div style={{ fontSize: 14, color: 'var(--ink-mid)', marginTop: 4 }}>
                  ≈ {fmt(expense.amount * fxRate, user.global_currency)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category & Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('expenseDetail.sectionCategory')}</div>
            {editing ? (
              <CategorySelect
                value={form.category_id}
                categories={categories}
                onSelect={(cat) => setForm({ ...form, category_id: cat.id })}
                onCreate={handleCreateAndSelectCategory}
              />
            ) : (
              <Link
                to={`/wallets/${walletId}?category_id=${expense.category.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}
                onMouseEnter={(e) => { (e.currentTarget.lastElementChild as HTMLElement).style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { (e.currentTarget.lastElementChild as HTMLElement).style.textDecoration = 'none'; }}
              >
                <CategoryIcon
                  iconName={expense.category.icon}
                  color={expense.category.color}
                  size={13}
                  containerSize={28}
                  borderRadius={7}
                  fallbackLetter={expense.category.name[0]}
                />
                <span style={{ fontSize: 15, fontWeight: 500 }}>{expense.category.name}</span>
              </Link>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('expenseDetail.sectionDate')}</div>
            {editing ? (
              <DatePicker
                value={form.date}
                onChange={(v) => setForm({ ...form, date: v })}
              />
            ) : (
              <Link
                to={(() => { const d = new Date(expense.date); const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return `/wallets/${walletId}?start_date=${local}&end_date=${local}`; })()}
                style={{ fontSize: 15, fontWeight: 500, textDecoration: 'none', color: 'inherit' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
              >
                {fmtDate(expense.date)}
              </Link>
            )}
          </div>
        </div>

        {/* Description */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('expenseDetail.sectionDescription')}</div>
          {editing ? (
            <textarea
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('expenseDetail.descriptionPlaceholder')}
              rows={2}
            />
          ) : (
            <p style={{ fontSize: 14, color: expense.description ? 'var(--ink)' : 'var(--ink-faint)', fontStyle: expense.description ? 'normal' : 'italic' }}>
              {expense.description ?? t('expenseDetail.noDescription')}
            </p>
          )}
        </div>

        {/* Tags */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{t('expenseDetail.sectionTags')}</div>
          {editing ? (
            <TagPicker
              selectedIds={form.tag_ids}
              allTags={allTags}
              onAdd={handleAddTag}
              onRemove={handleRemoveTag}
              onCreateAndAdd={handleCreateAndAddTag}
            />
          ) : expense.tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {expense.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/wallets/${walletId}?tag_ids=${tag.id}`}
                  className="chip"
                  style={{ background: tag.color ? `${tag.color}14` : undefined, borderColor: tag.color ? `${tag.color}50` : undefined, textDecoration: 'none', color: 'inherit' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = 'none'; }}
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>{t('expenseDetail.noTags')}</p>
          )}
        </div>

        {/* Sub-expenses */}
        {expense.children && expense.children.length > 0 && (
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Layers size={13} style={{ color: 'var(--ink-faint)' }} />
              <span style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{t('expenseDetail.sectionSubTransactions')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {expense.children.map((child, i) => (
                <Link
                  key={child.id}
                  to={`/wallets/${walletId}/expenses/${child.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 0',
                    textDecoration: 'none',
                    borderTop: i === 0 ? 'none' : '1px solid var(--cream)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {child.description ?? child.category.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{child.category.name}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>
                    {fmt(child.amount, currency)}
                  </div>
                </Link>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--cream-darker)', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-light)' }}>
              <span>{t('expenseDetail.itemsCount', { count: expense.children.length, plural: expense.children.length !== 1 ? 's' : '' })}</span>
              <span style={{ fontWeight: 600 }}>{fmt(expense.children.reduce((s, c) => s + c.amount, 0), currency)}</span>
            </div>
          </div>
        )}

        {/* Linked transactions */}
        {(expense.linked_transactions.length > 0 || editing) && (
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('expenseDetail.sectionLinked')}</div>
              {editing && (
                <button
                  onClick={() => setShowLinkPicker(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--forest)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}
                >
                  <Plus size={12} /> {t('expenseDetail.addLink')}
                </button>
              )}
            </div>
            {(editing ? pendingLinks : expense.linked_transactions).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic', margin: 0 }}>{t('expenseDetail.noLinkedTransactions')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(editing ? pendingLinks : expense.linked_transactions).map((linked, i) => {
                  const linkedWalletCurrency = allWallets.find((w) => w.id === linked.wallet_id)?.currency ?? 'USD';
                  return (
                    <div key={linked.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--cream)' }}>
                      <Link
                        to={`/wallets/${linked.wallet_id}/expenses/${linked.id}`}
                        style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}
                        onMouseEnter={(e) => { (e.currentTarget.firstElementChild as HTMLElement).style.textDecoration = 'underline'; }}
                        onMouseLeave={(e) => { (e.currentTarget.firstElementChild as HTMLElement).style.textDecoration = 'none'; }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {linked.description ?? linked.category.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                          {linked.category.name} · {fmtDate(linked.date)}
                          {linked.wallet_id !== walletId && allWallets.find((w) => w.id === linked.wallet_id) && (
                            <span> · {allWallets.find((w) => w.id === linked.wallet_id)!.name}</span>
                          )}
                        </div>
                      </Link>
                      <div style={{ fontSize: 14, fontWeight: 600, color: linked.type === 'income' ? 'var(--forest)' : 'var(--ink)', flexShrink: 0 }}>
                        {linked.type === 'income' ? '+' : '-'}{fmt(linked.amount, linkedWalletCurrency)}
                      </div>
                      {editing && (
                        <button
                          onClick={() => handleUnlink(linked.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint)', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* AI context */}
        {expense.ai_context && (
          <div style={{ background: 'oklch(96% 0.04 155)', borderRadius: 14, border: '1px solid oklch(88% 0.06 155)', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Bot size={14} style={{ color: 'var(--forest)' }} />
              <span style={{ fontSize: 11, color: 'var(--forest)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{t('expenseDetail.sectionAiContext')}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--forest)', lineHeight: 1.6 }}>{expense.ai_context}</p>
          </div>
        )}

        {/* Metadata */}
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', padding: '4px 2px', display: 'flex', gap: 16 }}>
          <span>{t('expenseDetail.metaCreated', { date: fmtDate(expense.created_at) })}</span>
          {expense.updated_at !== expense.created_at && <span>{t('expenseDetail.metaUpdated', { date: fmtDate(expense.updated_at) })}</span>}
        </div>
      </div>
    </div>
  );
}
