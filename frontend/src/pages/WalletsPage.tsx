import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Star, ArrowRight } from 'lucide-react';
import { wallets as walletsApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { WalletResponse } from '../lib/types';
import { CURRENCIES } from '../lib/utils';

export function WalletsPage() {
  const { wallets, refresh, setActiveWallet } = useWallet();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editWallet, setEditWallet] = useState<WalletResponse | null>(null);
  const [deleteWallet, setDeleteWallet] = useState<WalletResponse | null>(null);
  const [form, setForm] = useState({ name: '', currency: 'USD', is_default: false });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setForm({ name: '', currency: 'USD', is_default: false });
    setShowCreate(true);
  };

  const openEdit = (w: WalletResponse) => {
    setForm({ name: w.name, currency: w.currency, is_default: w.is_default });
    setEditWallet(w);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editWallet) {
        await walletsApi.update(editWallet.id, form);
        toast('Wallet updated', 'success');
        setEditWallet(null);
      } else {
        await walletsApi.create(form);
        toast('Wallet created', 'success');
        setShowCreate(false);
      }
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteWallet) return;
    setSaving(true);
    try {
      await walletsApi.delete(deleteWallet.id);
      toast('Wallet deleted', 'success');
      setDeleteWallet(null);
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Wallets</h1>
          <p className="page-subtitle">Manage your wallets and currencies</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> New wallet
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {wallets.map((w) => (
          <div
            key={w.id}
            style={{
              background: 'white',
              borderRadius: 16,
              border: '1px solid var(--cream-darker)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow)')}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{w.name}</span>
                  {w.is_default && (
                    <span className="badge badge-green" style={{ fontSize: 11 }}>
                      <Star size={10} /> Default
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>{w.currency}</span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" onClick={() => openEdit(w)} title="Edit">
                  <Pencil size={14} />
                </button>
                {!w.is_default && (
                  <button className="icon-btn" onClick={() => setDeleteWallet(w)} title="Delete" style={{ color: 'var(--rose)' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Link
                to={`/wallets/${w.id}`}
                className="btn btn-secondary btn-sm"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setActiveWallet(w)}
              >
                View expenses <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit modal */}
      <Modal
        open={showCreate || !!editWallet}
        onClose={() => { setShowCreate(false); setEditWallet(null); }}
        title={editWallet ? 'Edit wallet' : 'New wallet'}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditWallet(null); }}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />}
              {editWallet ? 'Save changes' : 'Create wallet'}
            </button>
          </>
        }
      >
        <div className="input-group">
          <label className="input-label">Wallet name</label>
          <input
            className="input"
            placeholder="e.g. Main Wallet"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="input-group">
          <label className="input-label">Currency</label>
          <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: 'var(--ink-mid)' }}>
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
          />
          Set as default wallet
        </label>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteWallet}
        onClose={() => setDeleteWallet(null)}
        title="Delete wallet"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteWallet(null)}>Cancel</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />}
              Delete
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          Are you sure you want to delete <strong>{deleteWallet?.name}</strong>? This will also delete all expenses in this wallet.
        </p>
      </Modal>
    </div>
  );
}
