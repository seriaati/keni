import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tags as tagsApi } from '../lib/api';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { ColorPicker } from './ui/ColorPicker';
import type { TagBrief } from '../lib/types';

/** Create (tag = null) or edit a tag. */
export function TagModal({
  open,
  tag,
  onClose,
  onSaved,
}: {
  open: boolean;
  tag: TagBrief | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ name: string; color: string | null }>({ name: '', color: null });

  useEffect(() => {
    if (!open) return;
    setForm(tag ? { name: tag.name, color: tag.color ?? null } : { name: '', color: null });
  }, [open, tag]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name, color: form.color ?? undefined };
    try {
      if (tag) {
        await tagsApi.update(tag.id, payload);
        toast(t('tags.toastUpdated'), 'success');
      } else {
        await tagsApi.create(payload);
        toast(t('tags.toastCreated'), 'success');
      }
      onClose();
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tag ? t('tags.modalEditTitle') : t('tags.modalCreateTitle')}
      footer={
        <>
          <button className="btn btn-secondary btn-md" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving && <span className="btn-spinner" />}
            {tag ? t('common.save') : t('common.create')}
          </button>
        </>
      }
    >
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
    </Modal>
  );
}
