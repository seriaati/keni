import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { categories as categoriesApi } from '../lib/api';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { ColorPicker } from './ui/ColorPicker';
import type { CategoryBrief } from '../lib/types';
import { CATEGORY_ICONS, iconColorForBg } from '../lib/categoryIcons';
import { useColor } from '../lib/colors';

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
  const color = useColor();
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
                background: form.icon === '' ? (color(form.color) ?? 'var(--cream-darker)') : 'var(--surface)',
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
            const iconColor = selected ? iconColorForBg(color(form.color)) : 'var(--ink-mid)';
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
                  background: selected ? (color(form.color) ?? 'var(--cream-darker)') : 'var(--surface)',
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

/** Create (category = null) or edit a category. */
export function CategoryModal({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category: CategoryBrief | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [form, setForm] = useState<FormState>({ name: '', icon: '', color: null });

  useEffect(() => {
    if (!open) return;
    setForm(category
      ? { name: category.name, icon: category.icon ?? '', color: category.color ?? null }
      : { name: '', icon: '', color: null });
    setIconSearch('');
  }, [open, category]);

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
      if (category) {
        await categoriesApi.update(category.id, data);
        toast(t('categories.toastUpdated'), 'success');
      } else {
        await categoriesApi.create(data);
        toast(t('categories.toastCreated'), 'success');
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
      title={category ? t('categories.modalEditTitle') : t('categories.modalCreateTitle')}
      footer={
        <>
          <button className="btn btn-secondary btn-md" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving && <span className="btn-spinner" />}
            {category ? t('common.save') : t('common.create')}
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
  );
}
