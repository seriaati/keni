import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { tags as tagsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { ColorPicker } from '../components/ui/ColorPicker';
import type { TagResponse } from '../lib/types';

export function TagsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tagList, setTagList] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTag, setEditTag] = useState<TagResponse | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ name: string; color: string | null }>({ name: '', color: null });

  const load = async () => {
    setLoading(true);
    try {
      setTagList(await tagsApi.list());
    } catch {
      toast(t('tags.toastLoadFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', color: null });
    setShowCreate(true);
  };

  const openEdit = (t: TagResponse) => {
    setForm({ name: t.name, color: t.color ?? null });
    setEditTag(t);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name, color: form.color ?? undefined };
    try {
      if (editTag) {
        await tagsApi.update(editTag.id, payload);
        toast(t('tags.toastUpdated'), 'success');
        setEditTag(null);
      } else {
        await tagsApi.create(payload);
        toast(t('tags.toastCreated'), 'success');
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
    if (!deleteTag) return;
    setSaving(true);
    try {
      await tagsApi.delete(deleteTag.id);
      toast(t('tags.toastDeleted'), 'success');
      setDeleteTag(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const TagForm = () => (
    <>
      <div className="input-group">
        <label className="input-label">{t('tags.fieldName')}</label>
        <input
          className="input"
          placeholder={t('tags.fieldNamePlaceholder')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
      </div>
      <div className="input-group">
        <label className="input-label">{t('tags.fieldColor')}</label>
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
      </div>
    </>
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('tags.title')}</h1>
          <p className="page-subtitle">{t('tags.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> {t('tags.new')}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton" style={{ height: 36, width: 80, borderRadius: 100 }} />)}
        </div>
      ) : tagList.length === 0 ? (
        <div className="empty-state">
          <Tags size={48} className="empty-state-icon" />
          <p className="empty-state-title">{t('tags.emptyTitle')}</p>
          <p className="empty-state-desc">{t('tags.emptyDesc')}</p>
          <button className="btn btn-primary btn-md" onClick={openCreate} style={{ marginTop: 8 }}>
            <Plus size={16} /> {t('common.create')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {tagList.map((tag) => (
            <div
              key={tag.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px 6px 10px',
                borderRadius: 100,
                background: tag.color ? `${tag.color}14` : 'var(--cream-dark)',
                border: `1.5px solid ${tag.color ? `${tag.color}50` : 'var(--cream-darker)'}`,
                color: 'var(--ink-mid)',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color ?? 'var(--sand-dark)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{tag.name}</span>
              <button
                className="icon-btn"
                onClick={() => openEdit(tag)}
                style={{ width: 22, height: 22, color: 'inherit', opacity: 0.6 }}
              >
                <Pencil size={11} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setDeleteTag(tag)}
                style={{ width: 22, height: 22, color: 'var(--rose)', opacity: 0.7 }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreate || !!editTag}
        onClose={() => { setShowCreate(false); setEditTag(null); }}
        title={editTag ? t('tags.modalEditTitle') : t('tags.modalCreateTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditTag(null); }}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />}
              {editTag ? t('common.save') : t('common.create')}
            </button>
          </>
        }
      >
        <TagForm />
      </Modal>

      <Modal
        open={!!deleteTag}
        onClose={() => setDeleteTag(null)}
        title={t('tags.deleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteTag(null)}>{t('common.cancel')}</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} {t('common.delete')}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}
          dangerouslySetInnerHTML={{ __html: t('tags.deleteConfirm', { name: deleteTag?.name ?? '' }) }}
        />
      </Modal>
    </div>
  );
}
