import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Check, ChevronLeft, ChevronRight, Copy, CopyPlus, RefreshCw, Search, Shapes, SquareCheck, Tag, Trash2, Wallet } from 'lucide-react';
import { expenses as expensesApi, categories as categoriesApi, tags as tagsApi, wallets as walletsApi } from '../lib/api';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { BottomSheet } from './ui/BottomSheet';
import { DatePicker } from './ui/DatePicker';
import { CategoryIcon } from '../lib/categoryIcons';
import { localDateStr } from '../lib/utils';
import type { CategoryResponse, TagResponse, TransactionResponse, WalletResponse } from '../lib/types';

export interface TransactionContextMenuState {
  x: number;
  y: number;
  expense: TransactionResponse;
  /** Opened by long-press on a touch device — render as a bottom sheet */
  sheet?: boolean;
}

const LONG_PRESS_MS = 450;
const LONG_PRESS_TOLERANCE = 10;

export function useTransactionContextMenu() {
  const [state, setState] = useState<TransactionContextMenuState | null>(null);
  const press = useRef<{ x: number; y: number; timer: number; fired: boolean } | null>(null);

  const open = useCallback((e: React.MouseEvent, expense: TransactionResponse) => {
    e.preventDefault();
    // Touch devices open via long-press instead; just suppress the native menu
    if (window.matchMedia('(pointer: coarse)').matches) return;
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, expense });
  }, []);

  const openSheet = useCallback((expense: TransactionResponse) => {
    navigator.vibrate?.(10);
    setState({ x: 0, y: 0, expense, sheet: true });
  }, []);

  /** Props for a transaction tile: right-click on desktop, long-press on touch. */
  const bind = useCallback((expense: TransactionResponse) => ({
    className: 'long-pressable',
    onContextMenu: (e: React.MouseEvent) => open(e, expense),
    onTouchStart: (e: React.TouchEvent) => {
      if (press.current) clearTimeout(press.current.timer);
      if (e.touches.length !== 1) { press.current = null; return; }
      const p = { x: e.touches[0].clientX, y: e.touches[0].clientY, timer: 0, fired: false };
      p.timer = window.setTimeout(() => {
        p.fired = true;
        openSheet(expense);
      }, LONG_PRESS_MS);
      press.current = p;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const p = press.current;
      if (!p || p.fired) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > LONG_PRESS_TOLERANCE) clearTimeout(p.timer);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const p = press.current;
      if (!p) return;
      clearTimeout(p.timer);
      // Swallow the tap that would otherwise follow the long-press (e.g. link navigation)
      if (p.fired) e.preventDefault();
      press.current = null;
    },
    onTouchCancel: () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
    },
  }), [open, openSheet]);

  const close = useCallback(() => setState(null), []);
  return { state, open, openSheet, bind, close };
}

const MENU_WIDTH = 210;
const SUBMENU_WIDTH = 230;
const SUBMENU_MAX_H = 300;
const MARGIN = 8;

type SubmenuKind = 'category' | 'tags' | 'wallet';

interface SubmenuPos {
  kind: SubmenuKind;
  top: number;
  left: number;
}

export function TransactionContextMenu({
  state,
  onClose,
  onChanged,
  onSelect,
}: {
  state: TransactionContextMenuState | null;
  onClose: () => void;
  onChanged: () => void;
  /** Adds a "Select" entry to the sheet that enters multi-select with this transaction */
  onSelect?: (expense: TransactionResponse) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [submenu, setSubmenu] = useState<SubmenuPos | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [allWallets, setAllWallets] = useState<WalletResponse[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState('');

  const [duplicateFor, setDuplicateFor] = useState<TransactionResponse | null>(null);
  const [duplicateDate, setDuplicateDate] = useState(localDateStr());
  const [deleteFor, setDeleteFor] = useState<TransactionResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const expense = state?.expense ?? null;

  // Load pickable lists when the menu opens
  useEffect(() => {
    if (!state) return;
    setSubmenu(null);
    setHovered(null);
    setTagIds(state.expense.tags.map((tg) => tg.id));
    setCategoryId(state.expense.category.id);
    let cancelled = false;
    Promise.all([categoriesApi.list(), tagsApi.list(), walletsApi.list()])
      .then(([c, tg, w]) => {
        if (cancelled) return;
        setCategories(c);
        setAllTags(tg);
        setAllWallets(w);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [state]);

  // Clamp menu position to the viewport
  useLayoutEffect(() => {
    if (!state) { setPos(null); return; }
    const h = menuRef.current?.offsetHeight ?? 0;
    const w = menuRef.current?.offsetWidth ?? MENU_WIDTH;
    setPos({
      x: Math.max(MARGIN, Math.min(state.x, window.innerWidth - w - MARGIN)),
      y: Math.max(MARGIN, Math.min(state.y, window.innerHeight - h - MARGIN)),
    });
  }, [state]);

  // Close on outside click, Escape, scroll, resize (desktop menu only — the sheet handles its own)
  useEffect(() => {
    if (!state || state.sheet) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || submenuRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onScroll = (e: Event) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || submenuRef.current?.contains(target)) return;
      onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [state, onClose]);

  // Focus the submenu search when it opens
  useEffect(() => {
    if (!submenu) { setQuery(''); return; }
    setQuery('');
    // Don't pop the on-screen keyboard in the sheet
    if (!state?.sheet) setTimeout(() => searchRef.current?.focus(), 0);
  }, [submenu?.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const openSubmenu = (kind: SubmenuKind) => (e: React.MouseEvent) => {
    const itemRect = e.currentTarget.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    if (!menuRect) return;
    const openLeft = menuRect.right + SUBMENU_WIDTH + MARGIN > window.innerWidth;
    const left = openLeft ? menuRect.left - SUBMENU_WIDTH + 4 : menuRect.right - 4;
    const top = Math.max(MARGIN, Math.min(itemRect.top - 6, window.innerHeight - SUBMENU_MAX_H - MARGIN));
    setSubmenu((prev) => (prev?.kind === kind ? prev : { kind, top, left }));
  };

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : t('common.failed'), 'error');

  const handleChangeCategory = async (cat: CategoryResponse) => {
    if (!expense || cat.id === categoryId) return;
    const prev = categoryId;
    setCategoryId(cat.id);
    try {
      await expensesApi.update(expense.wallet_id, expense.id, { category_id: cat.id });
      onChanged();
    } catch (e) {
      setCategoryId(prev);
      fail(e);
    }
  };

  const handleToggleTag = async (tag: TagResponse) => {
    if (!expense) return;
    const prev = tagIds;
    const next = prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id];
    setTagIds(next);
    try {
      await expensesApi.update(expense.wallet_id, expense.id, { tag_ids: next });
      onChanged();
    } catch (e) {
      setTagIds(prev);
      fail(e);
    }
  };

  const handleMoveToWallet = async (w: WalletResponse) => {
    if (!expense) return;
    onClose();
    try {
      await expensesApi.update(expense.wallet_id, expense.id, { wallet_id: w.id });
      toast(
        <Trans
          i18nKey="contextMenu.toastMoved"
          values={{ wallet: w.name }}
          components={{
            walletLink: (
              <Link
                to={`/wallets/${w.id}`}
                style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
              />
            ),
          }}
        />,
        'success',
      );
      onChanged();
    } catch (e) {
      fail(e);
    }
  };

  const handleMakeRecurring = () => {
    if (!expense) return;
    onClose();
    navigate('/recurring', {
      state: {
        prefill: {
          category_id: expense.category.id,
          amount: expense.amount,
          type: expense.type,
          description: expense.description,
        },
      },
    });
  };

  const handleCopyAmount = async () => {
    if (!expense) return;
    onClose();
    try {
      await navigator.clipboard.writeText(String(expense.amount));
      toast(t('contextMenu.toastAmountCopied'), 'success');
    } catch {
      toast(t('contextMenu.toastCopyFailed'), 'error');
    }
  };

  const handleDuplicate = async () => {
    if (!duplicateFor) return;
    setBusy(true);
    try {
      await expensesApi.create(duplicateFor.wallet_id, {
        category_id: duplicateFor.category.id,
        amount: duplicateFor.amount,
        type: duplicateFor.type,
        description: duplicateFor.description ?? undefined,
        date: new Date(duplicateDate).toISOString(),
        tag_ids: duplicateFor.tags.map((tg) => tg.id),
      });
      toast(t('contextMenu.toastDuplicated'), 'success');
      setDuplicateFor(null);
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteFor) return;
    setBusy(true);
    try {
      await expensesApi.delete(deleteFor.wallet_id, deleteFor.id);
      toast(t('contextMenu.toastDeleted'), 'success');
      setDeleteFor(null);
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const itemStyle = (key: string, danger = false): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '7px 10px',
    border: 'none',
    borderRadius: 'calc(var(--radius) - 4px)',
    background: hovered === key || submenu?.kind === key ? 'var(--cream)' : 'transparent',
    fontSize: 13,
    fontFamily: 'var(--font-body)',
    color: danger ? 'var(--rose)' : 'var(--ink)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.1s',
  });

  const trimmed = query.trim().toLowerCase();
  const filteredCategories = trimmed
    ? categories.filter((c) => c.name.toLowerCase().includes(trimmed))
    : categories;
  const filteredTags = trimmed
    ? allTags.filter((tg) => tg.name.toLowerCase().includes(trimmed))
    : allTags;
  const otherWallets = allWallets.filter((w) => w.id !== expense?.wallet_id);

  const submenuRow = (key: string, selected: boolean, onClick: () => void, content: React.ReactNode) => (
    <li
      key={key}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: state?.sheet ? '11px 12px' : '7px 10px',
        borderRadius: 'calc(var(--radius) - 4px)',
        fontSize: state?.sheet ? 15 : 13,
        cursor: 'pointer',
        background: hovered === `sub-${key}` ? 'var(--cream)' : 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(`sub-${key}`)}
      onMouseLeave={() => setHovered(null)}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {content}
      {selected && <Check size={13} style={{ color: 'var(--forest)', flexShrink: 0 }} />}
    </li>
  );

  const submenuContent = (
    <>
    {submenu && submenu.kind !== 'wallet' && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: state?.sheet ? '10px 16px' : '8px 10px', borderBottom: '1px solid var(--cream-dark)' }}>
        <Search size={13} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
        <input
          ref={searchRef}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: state?.sheet ? 16 : 13, fontFamily: 'var(--font-body)', color: 'var(--ink)', background: 'transparent' }}
          placeholder={submenu?.kind === 'category' ? t('contextMenu.searchCategories') : t('contextMenu.searchTags')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        />
      </div>
    )}
    <ul style={{ listStyle: 'none', padding: 4, margin: 0, overflowY: 'auto' }}>
      {submenu?.kind === 'category' && (
        filteredCategories.length === 0
          ? <li style={{ padding: 10, fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>{t('contextMenu.noResults')}</li>
          : filteredCategories.map((cat) => submenuRow(
              cat.id,
              cat.id === categoryId,
              () => handleChangeCategory(cat),
              <>
                <CategoryIcon iconName={cat.icon} color={cat.color} size={11} containerSize={22} borderRadius={5} fallbackLetter={cat.name[0]} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cat.id === categoryId ? 'var(--forest)' : 'var(--ink)' }}>{cat.name}</span>
              </>,
            ))
      )}
      {submenu?.kind === 'tags' && (
        filteredTags.length === 0
          ? <li style={{ padding: 10, fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>{t('contextMenu.noResults')}</li>
          : filteredTags.map((tg) => submenuRow(
              tg.id,
              tagIds.includes(tg.id),
              () => handleToggleTag(tg),
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tagIds.includes(tg.id) ? 'var(--forest)' : 'var(--ink)' }}>{tg.name}</span>,
            ))
      )}
      {submenu?.kind === 'wallet' && (
        otherWallets.length === 0
          ? <li style={{ padding: 10, fontSize: 13, color: 'var(--ink-faint)', textAlign: 'center' }}>{t('contextMenu.noOtherWallets')}</li>
          : otherWallets.map((w) => submenuRow(
              w.id,
              false,
              () => handleMoveToWallet(w),
              <>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                <span style={{ fontSize: 11, color: 'var(--ink-faint)', flexShrink: 0 }}>{w.currency}</span>
              </>,
            ))
      )}
    </ul>
    </>
  );

  const submenuTitle = { category: t('contextMenu.changeCategory'), tags: t('contextMenu.tags'), wallet: t('contextMenu.moveToWallet') };

  const sheet = (
    <BottomSheet open={!!state?.sheet} onClose={onClose}>
      {expense && (submenu ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 6px', borderBottom: submenu.kind === 'wallet' ? '1px solid var(--cream-dark)' : undefined }}>
            <button className="icon-btn" aria-label={t('contextMenu.back')} onClick={() => setSubmenu(null)}>
              <ChevronLeft size={20} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{submenuTitle[submenu.kind]}</span>
          </div>
          {submenuContent}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 12px', borderBottom: '1px solid var(--cream-dark)' }}>
            <CategoryIcon iconName={expense.category.icon} color={expense.category.color} size={16} containerSize={36} borderRadius={9} fallbackLetter={expense.category.name[0]} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {expense.description ?? expense.category.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{expense.category.name}</div>
            </div>
          </div>
          <div style={{ padding: 8, overflowY: 'auto' }}>
            {onSelect && (
              <button className="sheet-item" onClick={() => { onSelect(expense); onClose(); }}>
                <SquareCheck size={18} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
                {t('contextMenu.select')}
              </button>
            )}
            <button className="sheet-item" onClick={() => { setDuplicateDate(localDateStr()); setDuplicateFor(expense); onClose(); }}>
              <CopyPlus size={18} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
              {t('contextMenu.duplicate')}
            </button>
            {([
              ['category', Shapes, t('contextMenu.changeCategory')],
              ['tags', Tag, t('contextMenu.tags')],
              ['wallet', Wallet, t('contextMenu.moveToWallet')],
            ] as const).map(([kind, Icon, label]) => (
              // Position is unused in the sheet — the submenu replaces the main list
              <button key={kind} className="sheet-item" onClick={() => setSubmenu({ kind, top: 0, left: 0 })}>
                <Icon size={18} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                <ChevronRight size={16} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
              </button>
            ))}
            <button className="sheet-item" onClick={handleMakeRecurring}>
              <RefreshCw size={18} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
              {t('contextMenu.makeRecurring')}
            </button>
            <button className="sheet-item" onClick={handleCopyAmount}>
              <Copy size={18} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
              {t('contextMenu.copyAmount')}
            </button>
            <div style={{ height: 1, background: 'var(--cream-dark)', margin: '4px 8px' }} />
            <button className="sheet-item sheet-item-danger" onClick={() => { setDeleteFor(expense); onClose(); }}>
              <Trash2 size={18} style={{ flexShrink: 0 }} />
              {t('common.delete')}
            </button>
          </div>
        </>
      ))}
    </BottomSheet>
  );

  const menu = state && expense && !state.sheet ? createPortal(
    <>
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: pos?.y ?? state.y,
          left: pos?.x ?? state.x,
          width: MENU_WIDTH,
          zIndex: 9999,
          background: 'var(--surface)',
          border: '1.5px solid var(--sand)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          padding: 4,
          visibility: pos ? 'visible' : 'hidden',
          animation: 'ssDropIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <button
          style={itemStyle('duplicate')}
          onMouseEnter={() => { setHovered('duplicate'); setSubmenu(null); }}
          onMouseLeave={() => setHovered(null)}
          onClick={() => { setDuplicateDate(localDateStr()); setDuplicateFor(expense); onClose(); }}
        >
          <CopyPlus size={14} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
          {t('contextMenu.duplicate')}
        </button>

        {([
          ['category', Shapes, t('contextMenu.changeCategory')],
          ['tags', Tag, t('contextMenu.tags')],
          ['wallet', Wallet, t('contextMenu.moveToWallet')],
        ] as const).map(([kind, Icon, label]) => (
          <button
            key={kind}
            style={itemStyle(kind)}
            onMouseEnter={(e) => { setHovered(kind); openSubmenu(kind)(e); }}
            onMouseLeave={() => setHovered(null)}
            onClick={(e) => openSubmenu(kind)(e)}
          >
            <Icon size={14} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{label}</span>
            <ChevronRight size={13} style={{ color: 'var(--ink-faint)', flexShrink: 0 }} />
          </button>
        ))}

        <button
          style={itemStyle('recurring')}
          onMouseEnter={() => { setHovered('recurring'); setSubmenu(null); }}
          onMouseLeave={() => setHovered(null)}
          onClick={handleMakeRecurring}
        >
          <RefreshCw size={14} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
          {t('contextMenu.makeRecurring')}
        </button>

        <button
          style={itemStyle('copy')}
          onMouseEnter={() => { setHovered('copy'); setSubmenu(null); }}
          onMouseLeave={() => setHovered(null)}
          onClick={handleCopyAmount}
        >
          <Copy size={14} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
          {t('contextMenu.copyAmount')}
        </button>

        <div style={{ height: 1, background: 'var(--cream-dark)', margin: '4px 6px' }} />

        <button
          style={itemStyle('delete', true)}
          onMouseEnter={() => { setHovered('delete'); setSubmenu(null); }}
          onMouseLeave={() => setHovered(null)}
          onClick={() => { setDeleteFor(expense); onClose(); }}
        >
          <Trash2 size={14} style={{ flexShrink: 0 }} />
          {t('common.delete')}
        </button>
      </div>

      {submenu && (
        <div
          ref={submenuRef}
          style={{
            position: 'fixed',
            top: submenu.top,
            left: submenu.left,
            width: SUBMENU_WIDTH,
            maxHeight: SUBMENU_MAX_H,
            zIndex: 10000,
            background: 'var(--surface)',
            border: '1.5px solid var(--sand)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'ssDropIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) both',
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {submenuContent}
        </div>
      )}
    </>,
    document.body,
  ) : null;

  return (
    <>
      {menu}
      {sheet}

      <Modal
        open={!!duplicateFor}
        onClose={() => setDuplicateFor(null)}
        title={t('contextMenu.duplicateTitle')}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDuplicateFor(null)}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-md" onClick={handleDuplicate} disabled={busy || !duplicateDate}>
              {busy && <span className="btn-spinner" />}
              {t('contextMenu.duplicateAction')}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--ink-mid)', marginBottom: 12 }}>{t('contextMenu.duplicateDesc')}</p>
        <div className="input-group">
          <label className="input-label">{t('contextMenu.duplicateDate')}</label>
          <DatePicker value={duplicateDate} onChange={setDuplicateDate} />
        </div>
      </Modal>

      <Modal
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        title={t('expenseDetail.deleteTitle')}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteFor(null)}>{t('common.cancel')}</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={busy}>
              {busy && <span className="btn-spinner" />}
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          {deleteFor?.children && deleteFor.children.length > 0
            ? <span dangerouslySetInnerHTML={{ __html: t('expenseDetail.deleteGroupConfirm', { count: deleteFor.children.length, plural: deleteFor.children.length !== 1 ? 's' : '' }) }} />
            : t('expenseDetail.deleteConfirm')}
        </p>
      </Modal>
    </>
  );
}
