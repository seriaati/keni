import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownUp, Check, Trash2 } from 'lucide-react';
import { categories as categoriesApi, transfers as transfersApi } from '../lib/api';
import type { CategoryResponse, TransferRequest, TransferResponse } from '../lib/types';
import { useWallet } from '../contexts/WalletContext';
import { useToast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Select } from './ui/Select';
import { DatePicker } from './ui/DatePicker';
import { CategorySelect } from './ui/CategorySelect';
import { getExchangeRate } from '../lib/fx';
import { localDateStr } from '../lib/utils';

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  // Edit this transfer; omit to create a new one.
  transferId?: string | null;
  defaultFromWalletId?: string;
}

const EMPTY_FORM = {
  from_wallet_id: '',
  to_wallet_id: '',
  from_amount: '',
  to_amount: '',
  fee_amount: '',
  fee_category_id: '',
  description: '',
  date: '',
};

export function TransferModal({ open, onClose, onSaved, transferId, defaultFromWalletId }: TransferModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { wallets } = useWallet();
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [initial, setInitial] = useState<TransferResponse | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // Once the user types the received amount, stop overwriting it with the market-rate estimate.
  const [toTouched, setToTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    categoriesApi.list().then(setCategories).catch(() => {});
    if (transferId) {
      transfersApi.get(transferId).then((tr) => {
        setInitial(tr);
        setToTouched(true);
        setForm({
          from_wallet_id: tr.source.wallet_id,
          to_wallet_id: tr.destination.wallet_id,
          from_amount: String(tr.source.amount),
          to_amount: String(tr.destination.amount),
          fee_amount: tr.fee ? String(tr.fee.amount) : '',
          fee_category_id: tr.fee?.category?.id ?? '',
          description: tr.description ?? '',
          date: localDateStr(new Date(tr.date)),
        });
      }).catch((e) => toast(e instanceof Error ? e.message : t('common.failed'), 'error'));
    } else {
      const from = defaultFromWalletId ?? wallets[0]?.id ?? '';
      setInitial(null);
      setToTouched(false);
      setForm({
        ...EMPTY_FORM,
        from_wallet_id: from,
        to_wallet_id: wallets.find((w) => w.id !== from)?.id ?? '',
        date: localDateStr(),
      });
    }
  }, [open, transferId, defaultFromWalletId, wallets, toast, t]);

  const fromWallet = wallets.find((w) => w.id === form.from_wallet_id);
  const toWallet = wallets.find((w) => w.id === form.to_wallet_id);
  const sameCurrency = !!fromWallet && !!toWallet && fromWallet.currency === toWallet.currency;

  // Estimate the received amount at the market rate until the user enters the real one.
  useEffect(() => {
    if (!open || toTouched || !fromWallet || !toWallet || sameCurrency || !form.from_amount) return;
    let cancelled = false;
    getExchangeRate(fromWallet.currency, toWallet.currency).then((rate) => {
      if (cancelled || rate == null) return;
      setForm((f) => ({ ...f, to_amount: String(Math.round(Number(f.from_amount) * rate * 100) / 100) }));
    });
    return () => { cancelled = true; };
  }, [open, toTouched, fromWallet, toWallet, sameCurrency, form.from_amount]);

  const toAmount = sameCurrency ? form.from_amount : form.to_amount;
  const fromNum = Number(form.from_amount);
  const toNum = Number(toAmount);
  const feeNum = Number(form.fee_amount || 0);
  const rate = fromNum > 0 && toNum > 0 ? toNum / fromNum : null;

  const swap = () => setForm((f) => ({
    ...f,
    from_wallet_id: f.to_wallet_id,
    to_wallet_id: f.from_wallet_id,
    from_amount: sameCurrency ? f.from_amount : f.to_amount,
    to_amount: f.from_amount,
  }));

  const handleSave = async () => {
    if (!form.from_wallet_id || !form.to_wallet_id || form.from_wallet_id === form.to_wallet_id) {
      toast(t('transfer.errorWallets'), 'error');
      return;
    }
    if (!(fromNum > 0) || !(toNum > 0)) {
      toast(t('transfer.errorAmounts'), 'error');
      return;
    }
    if (feeNum > 0 && !form.fee_category_id) {
      toast(t('transfer.errorFeeCategory'), 'error');
      return;
    }
    const dateChanged = !initial || form.date !== localDateStr(new Date(initial.date));
    const data: TransferRequest = {
      from_wallet_id: form.from_wallet_id,
      to_wallet_id: form.to_wallet_id,
      from_amount: fromNum,
      to_amount: toNum,
      fee_amount: feeNum,
      fee_category_id: feeNum > 0 ? form.fee_category_id : undefined,
      description: transferId ? form.description : form.description || undefined,
      date: dateChanged && form.date ? new Date(form.date).toISOString() : undefined,
    };
    setSaving(true);
    try {
      if (transferId) await transfersApi.update(transferId, data);
      else await transfersApi.create(data);
      toast(t(transferId ? 'transfer.toastUpdated' : 'transfer.toastCreated'), 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!transferId) return;
    setSaving(true);
    try {
      await transfersApi.delete(transferId);
      toast(t('transfer.toastDeleted'), 'success');
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const walletOptions = wallets.map((w) => ({ value: w.id, label: `${w.name} (${w.currency})` }));
  const label = (text: string) => <label className="input-label">{text}</label>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(transferId ? 'transfer.titleEdit' : 'transfer.titleNew')}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
          <div>
            {transferId && (confirmDelete ? (
              <button className="btn btn-danger btn-md" onClick={handleDelete} disabled={saving}>
                <Trash2 size={14} /> {t('transfer.confirmDelete')}
              </button>
            ) : (
              <button className="btn btn-ghost btn-md" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 size={14} /> {t('common.delete')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-md" onClick={onClose}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-md" onClick={handleSave} disabled={saving}>
              {saving ? <span className="btn-spinner" /> : <Check size={14} />}
              {t('common.save')}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
          <div className="input-group">
            {label(t('transfer.fieldFrom'))}
            <Select value={form.from_wallet_id} onChange={(v) => setForm({ ...form, from_wallet_id: v })} options={walletOptions} />
          </div>
          <div className="input-group">
            {label(t('transfer.fieldAmountSent', { currency: fromWallet?.currency ?? '' }))}
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={form.from_amount}
              onChange={(e) => setForm({ ...form, from_amount: e.target.value })}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={swap}
          style={{ alignSelf: 'center', gap: 6 }}
          title={t('transfer.swap')}
        >
          <ArrowDownUp size={14} /> {t('transfer.swap')}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
          <div className="input-group">
            {label(t('transfer.fieldTo'))}
            <Select value={form.to_wallet_id} onChange={(v) => setForm({ ...form, to_wallet_id: v })} options={walletOptions} />
          </div>
          <div className="input-group">
            {label(t('transfer.fieldAmountReceived', { currency: toWallet?.currency ?? '' }))}
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={toAmount}
              disabled={sameCurrency}
              onChange={(e) => { setToTouched(true); setForm({ ...form, to_amount: e.target.value }); }}
            />
          </div>
        </div>

        {!sameCurrency && rate != null && fromWallet && toWallet && (
          <p style={{ fontSize: 12, color: 'var(--ink-mid)', margin: 0 }}>
            {t('transfer.effectiveRate', {
              from: fromWallet.currency,
              rate: rate.toLocaleString(undefined, { maximumFractionDigits: 6 }),
              to: toWallet.currency,
            })}
            {!toTouched && ` ${t('transfer.rateEstimated')}`}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
          <div className="input-group">
            {label(t('transfer.fieldFee', { currency: fromWallet?.currency ?? '' }))}
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={form.fee_amount}
              onChange={(e) => setForm({ ...form, fee_amount: e.target.value })}
            />
          </div>
          {feeNum > 0 && (
            <div className="input-group">
              {label(t('transfer.fieldFeeCategory'))}
              <CategorySelect
                value={form.fee_category_id}
                categories={categories}
                onSelect={(cat) => setForm({ ...form, fee_category_id: cat.id })}
              />
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
          <div className="input-group">
            {label(t('transfer.fieldDate'))}
            <DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          </div>
          <div className="input-group">
            {label(t('transfer.fieldNote'))}
            <input
              className="input"
              value={form.description}
              maxLength={500}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--ink-faint)', margin: 0 }}>{t('transfer.hint')}</p>
      </div>
    </Modal>
  );
}
