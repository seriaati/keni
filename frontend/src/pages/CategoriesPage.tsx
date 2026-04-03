import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { categories as categoriesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { CategoryResponse } from '../lib/types';
import { isEmoji } from '../lib/utils';

const PRESET_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
  '#00BCD4', '#FF5722', '#607D8B', '#795548', '#FFC107',
];

const PRESET_ICONS = ['🍔', '🚗', '🏠', '🎬', '💊', '✈️', '📚', '💪', '🛍️', '💡', '🎮', '☕', '🍕', '🎵', '💼'];

export function CategoriesPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCat, setEditCat] = useState<CategoryResponse | null>(null);
  const [deleteCat, setDeleteCat] = useState<CategoryResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    icon: '',
    color: PRESET_COLORS[0],
    type: 'expense' as 'expense' | 'income',
  });

  const load = async () => {
    setLoading(true);
    try {
      setCategories(await categoriesApi.list());
    } catch {
      toast('Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', icon: '', color: PRESET_COLORS[0], type: 'expense' });
    setShowCreate(true);
  };

  const openEdit = (c: CategoryResponse) => {
    setForm({ name: c.name, icon: c.icon ?? '', color: c.color ?? PRESET_COLORS[0], type: c.type });
    setEditCat(c);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data = { name: form.name, icon: form.icon || undefined, color: form.color, type: form.type };
      if (editCat) {
        await categoriesApi.update(editCat.id, data);
        toast('Category updated', 'success');
        setEditCat(null);
      } else {
        await categoriesApi.create(data);
        toast('Category created', 'success');
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
    if (!deleteCat) return;
    setSaving(true);
    try {
      await categoriesApi.delete(deleteCat.id);
      toast('Category deleted — expenses moved to Others', 'success');
      setDeleteCat(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const CategoryForm = () => (
    <>
      <div className="input-group">
        <label className="input-label">Name</label>
        <input
          className="input"
          placeholder="e.g. Food & Dining"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
      </div>
      <div className="input-group">
        <label className="input-label">Type</label>
        <div className="tabs">
          <button className={`tab ${form.type === 'expense' ? 'tab-active' : ''}`} onClick={() => setForm({ ...form, type: 'expense' })}>Expense</button>
          <button className={`tab ${form.type === 'income' ? 'tab-active' : ''}`} onClick={() => setForm({ ...form, type: 'income' })}>Income</button>
        </div>
      </div>
      <div className="input-group">
        <label className="input-label">Icon (emoji)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {PRESET_ICONS.map((icon) => (
            <button
              key={icon}
              onClick={() => setForm({ ...form, icon })}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `2px solid ${form.icon === icon ? 'var(--forest)' : 'var(--cream-darker)'}`,
                background: form.icon === icon ? 'oklch(92% 0.06 155)' : 'white',
                cursor: 'pointer',
                fontSize: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {icon}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Or type any emoji"
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
        />
      </div>
      <div className="input-group">
        <label className="input-label">Color</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setForm({ ...form, color })}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: color,
                border: `3px solid ${form.color === color ? 'var(--ink)' : 'transparent'}`,
                cursor: 'pointer',
                outline: form.color === color ? '2px solid white' : 'none',
                outlineOffset: '-4px',
              }}
            />
          ))}
        </div>
      </div>
    </>
  );

  const expense = categories.filter((c) => c.type === 'expense');
  const income = categories.filter((c) => c.type === 'income');

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Organize your expenses with custom categories</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> New category
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />)}
        </div>
      ) : (
        <>
          {expense.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Expense categories
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {expense.map((cat) => (
                  <CategoryCard key={cat.id} cat={cat} onEdit={openEdit} onDelete={setDeleteCat} />
                ))}
              </div>
            </section>
          )}
          {income.length > 0 && (
            <section>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Income categories
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                {income.map((cat) => (
                  <CategoryCard key={cat.id} cat={cat} onEdit={openEdit} onDelete={setDeleteCat} />
                ))}
              </div>
            </section>
          )}
          {categories.length === 0 && (
            <div className="empty-state">
              <Tag size={48} className="empty-state-icon" />
              <p className="empty-state-title">No categories yet</p>
              <p className="empty-state-desc">Create categories to organize your expenses.</p>
            </div>
          )}
        </>
      )}

      <Modal
        open={showCreate || !!editCat}
        onClose={() => { setShowCreate(false); setEditCat(null); }}
        title={editCat ? 'Edit category' : 'New category'}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditCat(null); }}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />}
              {editCat ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <CategoryForm />
      </Modal>

      <Modal
        open={!!deleteCat}
        onClose={() => setDeleteCat(null)}
        title="Delete category"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteCat(null)}>Cancel</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} Delete
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          Delete <strong>{deleteCat?.name}</strong>? Expenses in this category will be moved to <strong>Others</strong>.
        </p>
      </Modal>
    </div>
  );
}

function CategoryCard({
  cat,
  onEdit,
  onDelete,
}: {
  cat: CategoryResponse;
  onEdit: (c: CategoryResponse) => void;
  onDelete: (c: CategoryResponse) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'white',
        borderRadius: 10,
        border: '1px solid var(--cream-darker)',
        transition: 'box-shadow 0.12s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = 'var(--shadow-sm)')}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: cat.color ?? 'var(--cream-darker)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        flexShrink: 0,
      }}>
        {cat.icon && isEmoji(cat.icon)
          ? cat.icon
          : <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{cat.name[0]}</span>}
      </div>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {cat.name}
      </span>
      {cat.is_system ? (
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>system</span>
      ) : (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => onEdit(cat)} style={{ width: 26, height: 26 }}><Pencil size={12} /></button>
          <button className="icon-btn" onClick={() => onDelete(cat)} style={{ width: 26, height: 26, color: 'var(--rose)' }}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}
