import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Pause, Play, RefreshCw } from 'lucide-react';
import { recurring as recurringApi, categories as categoriesApi } from '../lib/api';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { CategoryResponse, RecurringExpenseResponse } from '../lib/types';
import { fmt, fmtDate, FREQUENCIES } from '../lib/utils';

export function RecurringPage() {
  const { activeWallet } = useWallet();
  const toast = useToast();
  const [items, setItems] = useState<RecurringExpenseResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<RecurringExpenseResponse | null>(null);
  const [deleteItem, setDeleteItem] = useState<RecurringExpenseResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    category_id: '',
    amount: '',
    description: '',
    frequency: 'monthly',
    next_due: new Date().toISOString().slice(0, 10),
  });

  const load = async () => {
    if (!activeWallet) return;
    setLoading(true);
    try {
      const [r, c] = await Promise.all([recurringApi.list(activeWallet.id), categoriesApi.list()]);
      setItems(r);
      setCategories(c);
    } catch {
      toast('Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [activeWallet]);

  const openCreate = () => {
    setForm({ category_id: categories[0]?.id ?? '', amount: '', description: '', frequency: 'monthly', next_due: new Date().toISOString().slice(0, 10) });
    setShowCreate(true);
  };

  const openEdit = (r: RecurringExpenseResponse) => {
    setForm({
      category_id: r.category_id,
      amount: String(r.amount),
      description: r.description ?? '',
      frequency: r.frequency,
      next_due: r.next_due.slice(0, 10),
    });
    setEditItem(r);
  };

  const handleSave = async () => {
    if (!activeWallet || !form.amount || !form.category_id) return;
    setSaving(true);
    try {
      const data = {
        category_id: form.category_id,
        amount: Number(form.amount),
        description: form.description || undefined,
        frequency: form.frequency,
        next_due: new Date(form.next_due).toISOString(),
      };
      if (editItem) {
        await recurringApi.update(activeWallet.id, editItem.id, data);
        toast('Updated', 'success');
        setEditItem(null);
      } else {
        await recurringApi.create(activeWallet.id, data);
        toast('Created', 'success');
        setShowCreate(false);
      }
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r: RecurringExpenseResponse) => {
    if (!activeWallet) return;
    try {
      await recurringApi.update(activeWallet.id, r.id, { is_active: !r.is_active });
      await load();
    } catch {
      toast('Failed to update', 'error');
    }
  };

  const handleDelete = async () => {
    if (!activeWallet || !deleteItem) return;
    setSaving(true);
    try {
      await recurringApi.delete(activeWallet.id, deleteItem.id);
      toast('Deleted', 'success');
      setDeleteItem(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Unknown';

  const RecurringForm = () => (
    <>
      <div className="input-group">
        <label className="input-label">Category</label>
        <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="input-group">
        <label className="input-label">Amount</label>
        <input className="input" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
      </div>
      <div className="input-group">
        <label className="input-label">Description</label>
        <input className="input" placeholder="e.g. Netflix subscription" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="input-group">
        <label className="input-label">Frequency</label>
        <select className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
          {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <div className="input-group">
        <label className="input-label">Next due date</label>
        <input className="input" type="date" value={form.next_due} onChange={(e) => setForm({ ...form, next_due: e.target.value })} />
      </div>
    </>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Recurring</h1>
          <p className="page-subtitle">Subscriptions and repeating expenses</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate} disabled={!activeWallet}>
            <Plus size={16} /> New recurring
          </button>
        </div>
      </div>

      {!activeWallet ? (
        <p style={{ color: 'var(--ink-light)', fontSize: 14 }}>Select a wallet to manage recurring expenses.</p>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <RefreshCw size={48} className="empty-state-icon" />
          <p className="empty-state-title">No recurring expenses</p>
          <p className="empty-state-desc">Add subscriptions, rent, or any repeating expense to track them automatically.</p>
          <button className="btn btn-primary btn-md" onClick={openCreate} style={{ marginTop: 8 }}>
            <Plus size={16} /> Add recurring
          </button>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', overflow: 'hidden' }}>
          {items.map((item, i) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderBottom: i < items.length - 1 ? '1px solid var(--cream)' : 'none',
                opacity: item.is_active ? 1 : 0.5,
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: item.is_active ? 'oklch(92% 0.06 155)' : 'var(--cream-dark)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <RefreshCw size={18} style={{ color: item.is_active ? 'var(--forest)' : 'var(--ink-faint)' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
                  {item.description ?? getCategoryName(item.category_id)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                  {getCategoryName(item.category_id)} · {FREQUENCIES.find((f) => f.value === item.frequency)?.label ?? item.frequency}
                  {' · '}Next: {fmtDate(item.next_due)}
                </div>
              </div>

              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>
                {fmt(item.amount, activeWallet.currency)}
              </div>

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  className="icon-btn"
                  onClick={() => handleToggle(item)}
                  title={item.is_active ? 'Pause' : 'Resume'}
                  style={{ color: item.is_active ? 'var(--amber)' : 'var(--forest)' }}
                >
                  {item.is_active ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button className="icon-btn" onClick={() => openEdit(item)}><Pencil size={13} /></button>
                <button className="icon-btn" onClick={() => setDeleteItem(item)} style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreate || !!editItem}
        onClose={() => { setShowCreate(false); setEditItem(null); }}
        title={editItem ? 'Edit recurring' : 'New recurring expense'}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditItem(null); }}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.amount || !form.category_id}>
              {saving && <span className="btn-spinner" />}
              {editItem ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <RecurringForm />
      </Modal>

      <Modal
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        title="Delete recurring expense"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteItem(null)}>Cancel</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} Delete
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          Delete <strong>{deleteItem?.description ?? 'this recurring expense'}</strong>? Future expenses won't be created automatically.
        </p>
      </Modal>
    </div>
  );
}
