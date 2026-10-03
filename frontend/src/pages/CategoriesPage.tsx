import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { categories as categoriesApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { CategoryModal } from '../components/CategoryModal';
import type { CategoryResponse } from '../lib/types';
import { CategoryIcon } from '../lib/categoryIcons';

export function CategoriesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCat, setEditCat] = useState<CategoryResponse | null>(null);
  const [deleteCat, setDeleteCat] = useState<CategoryResponse | null>(null);
  const [saving, setSaving] = useState(false);

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
          <button className="btn btn-primary btn-md" onClick={() => setShowCreate(true)}>
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
                <CategoryCard key={cat.id} cat={cat} onEdit={setEditCat} onDelete={setDeleteCat} />
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

      <CategoryModal
        open={showCreate || !!editCat}
        category={editCat}
        onClose={() => { setShowCreate(false); setEditCat(null); }}
        onSaved={load}
      />

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
        background: 'var(--surface)',
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
