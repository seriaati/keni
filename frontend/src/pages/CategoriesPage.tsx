import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Tag, Search } from 'lucide-react';
import { categories as categoriesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { CategoryResponse } from '../lib/types';
import { CATEGORY_ICONS, CategoryIcon, iconColorForBg } from '../lib/categoryIcons';

const PRESET_COLORS = [
  null, '#7a9e7e', '#6b8fba', '#b8895a', '#b06b7a', '#8b6fa8',
  '#5a9ea8', '#b07060', '#7a8f9a', '#8a7060', '#a89050',
];

export function CategoriesPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCat, setEditCat] = useState<CategoryResponse | null>(null);
  const [deleteCat, setDeleteCat] = useState<CategoryResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [iconSearch, setIconSearch] = useState('');

  const [form, setForm] = useState<{
    name: string;
    icon: string;
    color: string | null;
    type: 'expense' | 'income';
  }>({
    name: '',
    icon: '',
    color: null,
    type: 'expense',
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
    setForm({ name: '', icon: '', color: null, type: 'expense' });
    setIconSearch('');
    setShowCreate(true);
  };

  const openEdit = (c: CategoryResponse) => {
    setForm({ name: c.name, icon: c.icon ?? '', color: c.color ?? null, type: c.type });
    setIconSearch('');
    setEditCat(c);
  };

  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return CATEGORY_ICONS;
    return CATEGORY_ICONS.filter(({ label, name }) =>
      label.toLowerCase().includes(q) || name.toLowerCase().includes(q)
    );
  }, [iconSearch]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const data = { name: form.name, icon: form.icon || null, color: form.color ?? undefined, type: form.type };
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
        <label className="input-label">Icon</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)', pointerEvents: 'none' }} />
          <input
            className="input"
            placeholder="Search icons…"
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            style={{ paddingLeft: 28, height: 32, fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto', padding: '2px 0' }}>
          {!iconSearch && (
            <button
              title="No icon"
              onClick={() => setForm({ ...form, icon: '' })}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `2px solid ${form.icon === '' ? 'var(--forest)' : 'var(--cream-darker)'}`,
                background: form.icon === '' ? 'oklch(92% 0.06 155)' : 'white',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                color: form.icon === '' ? 'var(--forest)' : 'var(--ink-faint)',
                fontWeight: 700,
                transition: 'border-color 0.12s, background 0.12s',
              }}
            >
              ∅
            </button>
          )}
          {filteredIcons.map(({ name, icon: Icon, label }) => {
            const selected = form.icon === name;
            const iconColor = selected ? iconColorForBg(form.color) : 'var(--ink-mid)';
            return (
              <button
                key={name}
                title={label}
                onClick={() => setForm({ ...form, icon: name })}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: `2px solid ${selected ? 'var(--forest)' : 'var(--cream-darker)'}`,
                  background: selected ? (form.color ?? 'var(--forest)') : 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
              >
                <Icon size={16} color={iconColor} strokeWidth={1.75} />
              </button>
            );
          })}
          {filteredIcons.length === 0 && (
            <span style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 2px' }}>No icons found</span>
          )}
        </div>
      </div>
      <div className="input-group">
        <label className="input-label">Color</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_COLORS.map((color, i) => (
            <button
              key={i}
              onClick={() => setForm({ ...form, color })}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: color ?? 'white',
                border: `3px solid ${form.color === color ? 'var(--ink)' : color === null ? 'var(--cream-darker)' : 'transparent'}`,
                cursor: 'pointer',
                outline: form.color === color ? '2px solid white' : 'none',
                outlineOffset: '-4px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {color === null && (
                <span style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, color: 'var(--ink-faint)', fontWeight: 700, lineHeight: 1,
                }}>∅</span>
              )}
            </button>
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
      <CategoryIcon
        iconName={cat.icon}
        color={cat.color}
        size={15}
        containerSize={32}
        borderRadius={8}
        fallbackLetter={cat.name[0]}
      />
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
