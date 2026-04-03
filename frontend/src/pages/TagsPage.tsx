import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { tags as tagsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import type { TagResponse } from '../lib/types';

const PRESET_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
  '#00BCD4', '#FF5722', '#607D8B', '#795548', '#FFC107',
];

export function TagsPage() {
  const toast = useToast();
  const [tagList, setTagList] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTag, setEditTag] = useState<TagResponse | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', color: PRESET_COLORS[0] });

  const load = async () => {
    setLoading(true);
    try {
      setTagList(await tagsApi.list());
    } catch {
      toast('Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ name: '', color: PRESET_COLORS[0] });
    setShowCreate(true);
  };

  const openEdit = (t: TagResponse) => {
    setForm({ name: t.name, color: t.color ?? PRESET_COLORS[0] });
    setEditTag(t);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editTag) {
        await tagsApi.update(editTag.id, form);
        toast('Tag updated', 'success');
        setEditTag(null);
      } else {
        await tagsApi.create(form);
        toast('Tag created', 'success');
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
      toast('Tag deleted', 'success');
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
        <label className="input-label">Tag name</label>
        <input
          className="input"
          placeholder="e.g. work lunch"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
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

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tags</h1>
          <p className="page-subtitle">Free-form labels for cross-cutting organization</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={openCreate}>
            <Plus size={16} /> New tag
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
          <p className="empty-state-title">No tags yet</p>
          <p className="empty-state-desc">Tags let you label expenses across categories — like "work lunch" or "date night".</p>
          <button className="btn btn-primary btn-md" onClick={openCreate} style={{ marginTop: 8 }}>
            <Plus size={16} /> Create tag
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
                background: tag.color ? `${tag.color}18` : 'var(--cream-dark)',
                border: `1.5px solid ${tag.color ?? 'var(--cream-darker)'}`,
                color: tag.color ?? 'var(--ink-mid)',
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
        title={editTag ? 'Edit tag' : 'New tag'}
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => { setShowCreate(false); setEditTag(null); }}>Cancel</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <span className="btn-spinner" />}
              {editTag ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <TagForm />
      </Modal>

      <Modal
        open={!!deleteTag}
        onClose={() => setDeleteTag(null)}
        title="Delete tag"
        footer={
          <>
            <button className="btn btn-secondary btn-md" onClick={() => setDeleteTag(null)}>Cancel</button>
            <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
              {saving && <span className="btn-spinner" />} Delete
            </button>
          </>
        }
      >
        <p style={{ fontSize: 14, color: 'var(--ink-mid)' }}>
          Delete the tag <strong>{deleteTag?.name}</strong>? It will be removed from all expenses.
        </p>
      </Modal>
    </div>
  );
}
