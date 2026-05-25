import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { transactionLinks } from '../lib/api';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { CategoryIcon } from '../lib/categoryIcons';
import type { TransactionResponse, WalletResponse } from '../lib/types';
import { fmt, fmtDate } from '../lib/utils';

interface LinkedTransactionsPickerProps {
  open: boolean;
  onClose: () => void;
  currentTransactionId: string;
  currentWalletId: string;
  wallets: WalletResponse[];
  alreadyLinkedIds: string[];
  onLink: (transaction: TransactionResponse) => Promise<void>;
  onUnlink?: (transactionId: string) => Promise<void> | void;
}

export function LinkedTransactionsPicker({
  open,
  onClose,
  currentTransactionId,
  currentWalletId,
  wallets,
  alreadyLinkedIds,
  onLink,
  onUnlink,
}: LinkedTransactionsPickerProps) {
  const [selectedWalletId, setSelectedWalletId] = useState(currentWalletId);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TransactionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedWalletId(currentWalletId);
    setSearch('');
    setResults([]);
    setLoading(true);
  }, [open, currentWalletId]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await transactionLinks.search({
          q: search || undefined,
          wallet_id: selectedWalletId,
          exclude_id: currentTransactionId,
          page_size: 30,
        });
        setResults(res.items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, search, selectedWalletId, currentTransactionId]);

  const walletCurrency = (walletId: string) =>
    wallets.find((w) => w.id === walletId)?.currency ?? 'USD';

  const handleLink = async (target: TransactionResponse) => {
    setLinkingId(target.id);
    try {
      await onLink(target);
    } finally {
      setLinkingId(null);
    }
  };

  const handleUnlink = async (targetId: string) => {
    if (!onUnlink) return;
    setUnlinkingId(targetId);
    try {
      await onUnlink(targetId);
    } finally {
      setUnlinkingId(null);
    }
  };

  const SKELETON_COUNT = 5;

  return (
    <Modal open={open} onClose={onClose} title="Link a transaction" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select
            value={selectedWalletId}
            onChange={setSelectedWalletId}
            options={wallets.map((w) => ({ value: w.id, label: w.name }))}
          />
          <input
            autoFocus
            className="input"
            type="text"
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ minHeight: 200, maxHeight: 360, overflowY: 'auto', scrollbarGutter: 'stable', paddingRight: 8 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 4px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--cream, #f5f0e8)',
                  }}
                >
                  <div className="skeleton" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div className="skeleton" style={{ height: 13, borderRadius: 4, width: `${55 + (i * 13) % 30}%` }} />
                    <div className="skeleton" style={{ height: 11, borderRadius: 4, width: `${35 + (i * 7) % 25}%` }} />
                  </div>
                  <div className="skeleton" style={{ height: 13, width: 52, borderRadius: 4, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          ) : results.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--ink-faint, #aaa)', fontSize: 13, padding: 32, fontStyle: 'italic' }}>
              No transactions found
            </p>
          ) : (
            results.map((t, i) => {
              const linked = alreadyLinkedIds.includes(t.id);
              const isLinking = linkingId === t.id;
              const isUnlinking = unlinkingId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => !linked && !isLinking && handleLink(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 4px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--cream, #f5f0e8)',
                    cursor: linked ? 'default' : 'pointer',
                    opacity: linked ? 0.7 : 1,
                    borderRadius: 6,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!linked) (e.currentTarget as HTMLDivElement).style.background = 'var(--cream, #f5f0e8)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <CategoryIcon
                    iconName={t.category.icon}
                    color={t.category.color}
                    size={14}
                    containerSize={30}
                    borderRadius={8}
                    fallbackLetter={t.category.name[0]}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description ?? t.category.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink-faint, #aaa)' }}>
                      {t.category.name} · {fmtDate(t.date)}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.type === 'income' ? 'var(--forest)' : 'var(--ink)', flexShrink: 0 }}>
                    {t.type === 'income' ? '+' : '-'}{fmt(t.amount, walletCurrency(t.wallet_id))}
                  </div>
                  {linked && (
                    <span style={{ fontSize: 11, color: 'var(--forest)', fontWeight: 600, flexShrink: 0 }}>Linked</span>
                  )}
                  {linked && onUnlink && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleUnlink(t.id); }}
                      disabled={isUnlinking}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint, #aaa)', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', flexShrink: 0, opacity: isUnlinking ? 0.4 : 1 }}
                    >
                      {isUnlinking ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={14} />}
                    </button>
                  )}
                  {isLinking && (
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', flexShrink: 0, color: 'var(--ink-faint, #aaa)' }} />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
