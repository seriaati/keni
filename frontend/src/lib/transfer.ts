import type { TFunction } from 'i18next';
import type { TransactionResponse } from './types';
import { fmt } from './utils';

// "To Savings" / "From Checking" for a transfer leg.
export function transferTitle(t: TFunction, tx: TransactionResponse): string {
  const wallet = tx.transfer?.counterpart_wallet_name ?? '';
  return tx.type === 'transfer_in' ? t('transfer.fromWallet', { wallet }) : t('transfer.toWallet', { wallet });
}

// Meta label for a transfer leg; shows the other side's amount when it is in another currency.
export function transferMeta(t: TFunction, tx: TransactionResponse, currency: string): string {
  const other = tx.transfer;
  if (!other || other.counterpart_currency === currency) return t('transfer.label');
  return `${t('transfer.label')} · ${fmt(other.counterpart_amount, other.counterpart_currency)}`;
}
