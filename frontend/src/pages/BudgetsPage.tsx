import { useEffect, useState } from 'react';
import { AlertTriangle, Plus, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { budgets as budgetsApi, categories as categoriesApi, wallets as walletsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { BudgetResponse, CategoryResponse, WalletResponse } from '../lib/types';
import { fmt } from '../lib/utils';

export function BudgetsPage() {
  const toast = useToast();
  const [budgets, setBudgets] = useState<BudgetResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [wallets, setWallets] = useState<WalletResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetResponse | null>(null);
  const [deleteBudget, setDeleteBudget] = useState<BudgetResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    amount: '',
    period: 'monthly' as 'weekly' | 'monthly',
    category_id: '',
    wallet_id: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [b, c, w] = await Promise.all([budgetsApi.list(), categoriesApi.list(), walletsApi.list()]);
      setBudgets(b);
      setCategories(c);
      setWallets(w);
    } catch {
      toast('Failed to load budgets', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ amount: '', period: 'monthly', category_id: '', wallet_id: '' });
    setShowCreate(true);
  };

  const openEdit = (b: BudgetResponse) => {
    setForm({
      amount: String(b.amount),
      period: b.period,
      category_id: b.category_id ?? '',
      wallet_id: b.wallet_id ?? '',
    });
    setEditBudget(b);
  };

  const handleSave = async () => {
    if (!form.amount) return;
    setSaving(true);
    try {
      const data = {
        amount: Number(form.amount),
        period: form.period,
        category_id: form.category_id || undefined,
        wallet_id: form.wallet_id || undefined,
      };
      if (editBudget) {
        await budgetsApi.update(editBudget.id, data);
        toast('Budget updated', 'success');
        setEditBudget(null);
      } else {
        await budgetsApi.create(data);
        toast('Budget created', 'success');
        setShowCreate(false);
      }
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteBudget) return;
    setSaving(true);
    try {
      await budgetsApi.delete(deleteBudget.id);
      toast('Budget deleted', 'success');
      setDeleteBudget(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getCategoryName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? 'Unknown') : null;

  const getWalletName = (id: string | null) =>
    id ? (wallets.find((w) => w.id === id)?.name ?? 'Unknown') : null;

  const BudgetForm = () => (
    <>
      <div className="input-group">
        <label className="input-label">Budget amount</label>
        <input
          className="input"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          autoFocus
        />
      </div>
      <div className="input-group">
        <label className="input-label">Period</label>
        <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value as 'weekly' | 'monthly' })}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <div className="input-group">
        <label className="input-label">Category (optional)</label>
        <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="input-group">
        <label className="input-label">Wallet (optional)</label>
        <select className="input" value={form.wallet_id} onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}>
          <option value="">All wallets</option>
          {wallets.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
    </>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Budgets</h1>
          <p className="page-subtitle">Set spending limits and track your progress</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> New budget
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 14 }} />)}
        </div>
      ) : budgets.length === 0 ? (
        <div className="empty-state">
          <TrendingUp size={48} className="empty-state-icon" />
          <p className="empty-state-title">No budgets yet</p>
          <p className="empty-state-desc">Create a budget to track your spending limits and stay on track.</p>
          <button className="btn btn-primary btn-md" onClick={openCreate} style={{ marginTop: 8 }}>
            <Plus size={16} /> Create budget
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {budgets.map((b) => {
            const pct = Math.min(b.percentage_used, 100);
            const isWarning = b.percentage_used >= 80 && !b.is_over_budget;
            const barColor = b.is_over_budget ? 'var(--rose)' : isWarning ? 'var(--amber)' : 'var(--forest)';

            return (
              <div
                key={b.id}
                style={{
                  background: 'white',
                  borderRadius: 16,
                  border: `1px solid ${b.is_over_budget ? 'var(--rose-light)' : 'var(--cream-darker)'}`,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                        {getCategoryName(b.category_id) ?? 'Overall'}
                      </span>
                      {b.is_over_budget && (
                        <span className="badge badge-red">
                          <AlertTriangle size={10} /> Over budget
                        </span>
                      )}
                      {isWarning && (
                        <span className="badge badge-amber">
                          <AlertTriangle size={10} /> Near limit
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      {b.period === 'monthly' ? 'Monthly' : 'Weekly'}
                      {getWalletName(b.wallet_id) ? ` · ${getWalletName(b.wallet_id)}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="icon-btn" onClick={() => openEdit(b)}><Pencil size={13} /></button>
                    <button className="icon-btn" onClick={() => setDeleteBudget(b)} style={{ color: 'var(--rose)' }}><Trash2 size={13} /></button>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
                      {fmt(b.spent)} spent
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      {fmt(b.amount)} limit
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 12, color: barColor, fontWeight: 500 }}>
                      {b.percentage_used.toFixed(0)}% used
                    </span>
                    <span style={{ fontSize: 12, color: b.is_over_budget ? 'var(--rose)' : 'var(--ink-faint)' }}>
                      {b.is_over_budget
                        ? `${fmt(Math.abs(b.remaining))} over`
                        : `${fmt(b.remaining)} remaining`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={showCreate || !!editBudget}
        onClose={() => { setShowCreate(false); setEditBudget(null); }}
        title={editBudget ? 'Edit budget' : 'New budget'}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditBudget(null); }}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.amount}>
              {saving && <span className="btn-spinner" />}
              {editBudget ? 'Save changes' : 'Create budget'}
            </button>
          </>
        }
      >
        <BudgetForm />
      </Modal>

      <Modal
        open={!!deleteBudget}
        onClose={() => setDeleteBudget(null)}
        title="Delete budget"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteBudget(null)}>Cancel</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} Delete
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          Delete this budget? Your expense data won't be affected.
        </p>
      </Modal>
    </div>
  );
}
