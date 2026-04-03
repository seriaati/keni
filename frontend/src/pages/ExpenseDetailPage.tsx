import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bot, Pencil, Trash2, Check, X } from 'lucide-react';
import { expenses as expensesApi, categories as categoriesApi, tags as tagsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import type { CategoryResponse, ExpenseResponse, TagResponse } from '../lib/types';
import { fmt, fmtDate } from '../lib/utils';

export function ExpenseDetailPage() {
  const { walletId, expenseId } = useParams<{ walletId: string; expenseId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [expense, setExpense] = useState<ExpenseResponse | null>(null);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [allTags, setAllTags] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    amount: '',
    description: '',
    category_id: '',
    date: '',
    tag_ids: [] as string[],
  });

  useEffect(() => {
    if (!walletId || !expenseId) return;
    Promise.all([
      expensesApi.get(walletId, expenseId),
      categoriesApi.list(),
      tagsApi.list(),
    ]).then(([exp, cats, tags]) => {
      setExpense(exp);
      setCategories(cats);
      setAllTags(tags);
      setForm({
        amount: String(exp.amount),
        description: exp.description ?? '',
        category_id: exp.category.id,
        date: exp.date.slice(0, 10),
        tag_ids: exp.tags.map((t) => t.id),
      });
    }).catch(() => toast('Failed to load expense', 'error'))
      .finally(() => setLoading(false));
  }, [walletId, expenseId, toast]);

  const handleSave = async () => {
    if (!walletId || !expenseId) return;
    setSaving(true);
    try {
      const updated = await expensesApi.update(walletId, expenseId, {
        amount: Number(form.amount),
        description: form.description || undefined,
        category_id: form.category_id,
        date: form.date ? new Date(form.date).toISOString() : undefined,
        tag_ids: form.tag_ids,
      });
      setExpense(updated);
      setEditing(false);
      toast('Expense updated', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!walletId || !expenseId) return;
    setDeleting(true);
    try {
      await expensesApi.delete(walletId, expenseId);
      toast('Expense deleted', 'success');
      navigate(`/wallets/${walletId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete', 'error');
      setDeleting(false);
    }
  };

  const toggleTag = (id: string) => {
    setForm((f) => ({
      ...f,
      tag_ids: f.tag_ids.includes(id) ? f.tag_ids.filter((t) => t !== id) : [...f.tag_ids, id],
    }));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 12 }} />)}
      </div>
    );
  }

  if (!expense) return <p style={{ color: 'var(--ink-light)' }}>Expense not found.</p>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 560 }}>
      {/* Back */}
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => navigate(`/wallets/${walletId}`)}
        style={{ marginBottom: 20, paddingLeft: 4 }}
      >
        <ArrowLeft size={15} /> Back to wallet
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 className="page-title">Expense detail</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          {!editing ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={13} /> Edit
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className="btn-spinner" /> : <Trash2 size={13} />}
                Delete
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>
                <X size={13} /> Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? <span className="btn-spinner" /> : <Check size={13} />}
                Save
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Amount */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '20px 24px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Amount</div>
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
            <div style={{ fontSize: 32, fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>
              {fmt(expense.amount)}
            </div>
          )}
        </div>

        {/* Category & Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Category</div>
            {editing ? (
              <select className="input" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: expense.category.color ?? 'var(--cream-darker)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
                  {expense.category.icon ?? expense.category.name[0]}
                </div>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{expense.category.name}</span>
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Date</div>
            {editing ? (
              <input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            ) : (
              <div style={{ fontSize: 15, fontWeight: 500 }}>{fmtDate(expense.date)}</div>
            )}
          </div>
        </div>

        {/* Description */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Description</div>
          {editing ? (
            <textarea
              className="input"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add a description…"
              rows={2}
            />
          ) : (
            <p style={{ fontSize: 14, color: expense.description ? 'var(--ink)' : 'var(--ink-faint)', fontStyle: expense.description ? 'normal' : 'italic' }}>
              {expense.description ?? 'No description'}
            </p>
          )}
        </div>

        {/* Tags */}
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid var(--cream-darker)', padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Tags</div>
          {editing ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 100,
                    fontSize: 12,
                    fontFamily: 'var(--font-body)',
                    border: '1.5px solid',
                    cursor: 'pointer',
                    background: form.tag_ids.includes(tag.id) ? (tag.color ?? 'var(--forest)') : 'transparent',
                    borderColor: tag.color ?? 'var(--sand)',
                    color: form.tag_ids.includes(tag.id) ? 'white' : 'var(--ink-mid)',
                    transition: 'all 0.15s',
                  }}
                >
                  {tag.name}
                </button>
              ))}
              {allTags.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-faint)' }}>No tags created yet.</span>}
            </div>
          ) : expense.tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {expense.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="chip"
                  style={{ background: tag.color ? `${tag.color}22` : undefined, borderColor: tag.color ?? undefined, color: tag.color ?? undefined }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--ink-faint)', fontStyle: 'italic' }}>No tags</p>
          )}
        </div>

        {/* AI context */}
        {expense.ai_context && (
          <div style={{ background: 'oklch(96% 0.04 155)', borderRadius: 14, border: '1px solid oklch(88% 0.06 155)', padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Bot size={14} style={{ color: 'var(--forest)' }} />
              <span style={{ fontSize: 11, color: 'var(--forest)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>AI context</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--forest)', lineHeight: 1.6 }}>{expense.ai_context}</p>
          </div>
        )}

        {/* Metadata */}
        <div style={{ fontSize: 12, color: 'var(--ink-faint)', padding: '4px 2px', display: 'flex', gap: 16 }}>
          <span>Created {fmtDate(expense.created_at)}</span>
          {expense.updated_at !== expense.created_at && <span>Updated {fmtDate(expense.updated_at)}</span>}
        </div>
      </div>
    </div>
  );
}
