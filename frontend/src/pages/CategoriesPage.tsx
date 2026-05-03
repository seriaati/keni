import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Tag, Search } from 'lucide-react';
import { categories as categoriesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { ColorPicker } from '../components/ui/ColorPicker';
import type { CategoryResponse } from '../lib/types';
import { CATEGORY_ICONS, CategoryIcon, iconColorForBg } from '../lib/categoryIcons';

type FormState = {
  name: string;
  icon: string;
  color: string | null;
};

function CategoryForm({
  form,
  setForm,
  iconSearch,
  setIconSearch,
  filteredIcons,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  iconSearch: string;
  setIconSearch: (v: string) => void;
  filteredIcons: typeof CATEGORY_ICONS;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="input-group">
        <label className="input-label">{t('categories.fieldName')}</label>
        <input
          className="input"
          placeholder={t('categories.fieldNamePlaceholder')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
      </div>
      <div className="input-group">
        <label className="input-label">{t('categories.fieldIcon')}</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-faint)', pointerEvents: 'none' }} />
          <input
            className="input"
            placeholder={t('categories.iconSearchPlaceholder')}
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
                background: form.icon === '' ? (form.color ?? 'var(--cream-darker)') : 'white',
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
                  background: selected ? (form.color ?? 'var(--cream-darker)') : 'white',
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
            <span style={{ fontSize: 13, color: 'var(--ink-faint)', padding: '8px 2px' }}>{t('categories.noIcons')}</span>
          )}
        </div>
      </div>
      <div className="input-group">
        <label className="input-label">{t('categories.fieldColor')}</label>
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
      </div>
    </>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCat, setEditCat] = useState<CategoryResponse | null>(null);
  const [deleteCat, setDeleteCat] = useState<CategoryResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [iconSearch, setIconSearch] = useState('');

  const [form, setForm] = useState<FormState>({
    name: '',
    icon: '',
    color: null,
  });

  const load = async () => {
    setLoading(true);
    try {
      setCategories(await categoriesApi.list());
    } catch {
      toast(t('categories.toastLoadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', icon: '', color: null });
    setIconSearch('');
    setShowCreate(true);
  };

  const openEdit = (c: CategoryResponse) => {
    setForm({ name: c.name, icon: c.icon ?? '', color: c.color ?? null });
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
      const data = { name: form.name, icon: form.icon || null, color: form.color ?? undefined };
      if (editCat) {
        await categoriesApi.update(editCat.id, data);
        toast(t('categories.toastUpdated'), 'success');
        setEditCat(null);
      } else {
        await categoriesApi.create(data);
        toast(t('categories.toastCreated'), 'success');
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
      toast(t('categories.toastDeleted'), 'success');
      setDeleteCat(null);
      await load();
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
          <h1 className="page-title">{t('categories.title')}</h1>
          <p className="page-subtitle">{t('categories.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> {t('categories.new')}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 10 }} />)}
        </div>
      ) : (
        <>
          {categories.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {categories.map((cat) => (
                <CategoryCard key={cat.id} cat={cat} onEdit={openEdit} onDelete={setDeleteCat} />
              ))}
            </div>
          )}
          {categories.length === 0 && (
            <div className="empty-state">
              <Tag size={48} className="empty-state-icon" />
              <p className="empty-state-title">{t('categories.emptyTitle')}</p>
              <p className="empty-state-desc">{t('categories.emptyDesc')}</p>
            </div>
          )}
        </>
      )}

      <Modal
        open={showCreate || !!editCat}
        onClose={() => { setShowCreate(false); setEditCat(null); }}
        title={editCat ? t('categories.modalEditTitle') : t('categories.modalCreateTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditCat(null); }}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />}
              {editCat ? t('common.save') : t('common.create')}
            </button>
          </>
        }
      >
        <CategoryForm
          form={form}
          setForm={setForm}
          iconSearch={iconSearch}
          setIconSearch={setIconSearch}
          filteredIcons={filteredIcons}
        />
      </Modal>

      <Modal
        open={!!deleteCat}
        onClose={() => setDeleteCat(null)}
        title={t('categories.deleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteCat(null)}>{t('common.cancel')}</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} {t('common.delete')}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}
          dangerouslySetInnerHTML={{ __html: t('categories.deleteConfirm', { name: deleteCat?.name ?? '' }) }}
        />
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
  const { t } = useTranslation();
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
        <span style={{ fontSize: 11, color: 'var(--ink-faint)', fontStyle: 'italic' }}>{t('common.system')}</span>
      ) : (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => onEdit(cat)} style={{ width: 26, height: 26 }}><Pencil size={12} /></button>
          <button className="icon-btn" onClick={() => onDelete(cat)} style={{ width: 26, height: 26, color: 'var(--rose)' }}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}
