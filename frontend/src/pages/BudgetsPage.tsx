import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, Pencil, Trash2, TrendingUp } from 'lucide-react';
import { budgets as budgetsApi, categories as categoriesApi, wallets as walletsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import type { BudgetResponse, CategoryResponse, WalletResponse } from '../lib/types';
import { fmt } from '../lib/utils';

export function BudgetsPage() {
  const { t } = useTranslation();
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
      toast(t('budgets.toastLoadFailed'), 'error');
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
        toast(t('budgets.toastUpdated'), 'success');
        setEditBudget(null);
      } else {
        await budgetsApi.create(data);
        toast(t('budgets.toastCreated'), 'success');
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
      toast(t('budgets.toastDeleted'), 'success');
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
        <label className="input-label">{t('budgets.fieldAmount')}</label>
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
        <label className="input-label">{t('budgets.fieldPeriod')}</label>
        <Select
          value={form.period}
          onChange={(v) => setForm({ ...form, period: v as 'weekly' | 'monthly' })}
          options={[{ value: 'weekly', label: t('budgets.periodWeekly') }, { value: 'monthly', label: t('budgets.periodMonthly') }]}
        />
      </div>
      <div className="input-group">
        <label className="input-label">{t('budgets.fieldCategory')}</label>
        <Select
          value={form.category_id}
          onChange={(v) => setForm({ ...form, category_id: v })}
          options={[{ value: '', label: t('budgets.allCategories') }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>
      <div className="input-group">
        <label className="input-label">{t('budgets.fieldWallet')}</label>
        <Select
          value={form.wallet_id}
          onChange={(v) => setForm({ ...form, wallet_id: v })}
          options={[{ value: '', label: t('budgets.allWallets') }, ...wallets.map((w) => ({ value: w.id, label: w.name }))]}
        />
      </div>
    </>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('budgets.title')}</h1>
          <p className="page-subtitle">{t('budgets.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> {t('budgets.new')}
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
          <p className="empty-state-title">{t('budgets.emptyTitle')}</p>
          <p className="empty-state-desc">{t('budgets.emptyDesc')}</p>
          <button className="btn btn-primary btn-md" onClick={openCreate} style={{ marginTop: 8 }}>
            <Plus size={16} /> {t('budgets.createBudget')}
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
                          <AlertTriangle size={10} /> {t('budgets.badgeOver')}
                        </span>
                      )}
                      {isWarning && (
                        <span className="badge badge-amber">
                          <AlertTriangle size={10} /> {t('budgets.badgeNear')}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-faint)' }}>
                      {b.period === 'monthly' ? t('budgets.periodMonthly') : t('budgets.periodWeekly')}
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
                      {t('budgets.spent', { amount: fmt(b.spent) })}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      {t('budgets.limit', { amount: fmt(b.amount) })}
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
                      {t('budgets.pctUsed', { pct: b.percentage_used.toFixed(0) })}
                    </span>
                    <span style={{ fontSize: 12, color: b.is_over_budget ? 'var(--rose)' : 'var(--ink-faint)' }}>
                      {b.is_over_budget
                        ? t('budgets.over', { amount: fmt(Math.abs(b.remaining)) })
                        : t('budgets.remaining', { amount: fmt(b.remaining) })}
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
        title={editBudget ? t('budgets.modalEditTitle') : t('budgets.modalCreateTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditBudget(null); }}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.amount}>
              {saving && <span className="btn-spinner" />}
              {editBudget ? t('budgets.saveChanges') : t('budgets.createBudget')}
            </button>
          </>
        }
      >
        <BudgetForm />
      </Modal>

      <Modal
        open={!!deleteBudget}
        onClose={() => setDeleteBudget(null)}
        title={t('budgets.deleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteBudget(null)}>{t('common.cancel')}</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} {t('common.delete')}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          {t('budgets.deleteConfirm')}
        </p>
      </Modal>
    </div>
  );
}
