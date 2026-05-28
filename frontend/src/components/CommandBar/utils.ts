import { LayoutDashboard, Zap, RefreshCw, Tag, Bot, Settings } from 'lucide-react';
import type { AIExpenseResponse, AIRecurringResponse } from '../../lib/types';
import { localDateStr } from '../../lib/utils';
import type { EditableExpense, EditableRecurring } from './types';

export const NAV_ITEMS_STATIC = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, keywords: ['home', 'dashboard', 'overview'] },
  { label: 'Budgets', path: '/budgets', icon: Zap, keywords: ['budget', 'limit', 'spending'] },
  { label: 'Recurring', path: '/recurring', icon: RefreshCw, keywords: ['recurring', 'subscription', 'repeat'] },
  { label: 'Categories', path: '/categories', icon: Tag, keywords: ['category', 'categories'] },
  { label: 'Chat', path: '/chat', icon: Bot, keywords: ['chat', 'ask', 'question', 'ai'] },
  { label: 'Settings', path: '/settings', icon: Settings, keywords: ['settings', 'profile', 'api'] },
];

export function looksLikeExpense(text: string): boolean {
  return /\d/.test(text) && !/^(go to|open|show|navigate|find)\s/i.test(text);
}

export function makeEditable(exp: AIExpenseResponse): EditableExpense {
  return {
    ...exp,
    _id: crypto.randomUUID(),
    _editAmount: exp.amount != null ? String(exp.amount) : '',
    _editCategory: exp.category_name ?? '',
    _editDescription: exp.description ?? '',
    _editTags: exp.suggested_tags.map((t) => t.name).join(', '),
    _editDate: exp.date ? exp.date.slice(0, 10) : localDateStr(),
    _editing: false,
  };
}

export function commitEditable(e: EditableExpense): EditableExpense {
  const newAmount = parseFloat(e._editAmount);
  const newTags = e._editTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ name, is_new: !e.suggested_tags.find((t) => t.name === name) }));
  return {
    ...e,
    amount: isNaN(newAmount) ? e.amount : newAmount,
    category_name: e._editCategory.trim() || e.category_name,
    description: e._editDescription.trim() || null,
    date: e._editDate || e.date,
    suggested_tags: newTags,
    _editing: false,
  };
}

export function makeEditableRecurring(r: AIRecurringResponse): EditableRecurring {
  return {
    ...r,
    _editAmount: String(r.amount),
    _editCategory: r.category_name,
    _editDescription: r.description ?? '',
    _editTags: r.suggested_tags.map((t) => t.name).join(', '),
    _editFrequency: r.frequency,
    _editNextDue: r.next_due.slice(0, 10),
    _editing: false,
  };
}

export function commitEditableRecurring(r: EditableRecurring): EditableRecurring {
  const newAmount = parseFloat(r._editAmount);
  const newTags = r._editTags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ name, is_new: !r.suggested_tags.find((t) => t.name === name) }));
  return {
    ...r,
    amount: isNaN(newAmount) ? r.amount : newAmount,
    category_name: r._editCategory.trim() || r.category_name,
    description: r._editDescription.trim() || '',
    frequency: r._editFrequency,
    next_due: r._editNextDue,
    suggested_tags: newTags,
    _editing: false,
  };
}
