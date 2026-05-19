import type { AIExpenseResponse, AIRecurringResponse } from '../../lib/types';

export interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  onExpenseAdded?: () => void;
  initialPayload?: { text?: string; files?: File[] };
}

export type Mode = 'input' | 'processing' | 'review';

export interface EditableRecurring extends AIRecurringResponse {
  _editAmount: string;
  _editCategory: string;
  _editDescription: string;
  _editTags: string;
  _editFrequency: string;
  _editNextDue: string;
  _editing: boolean;
}

export interface EditableExpense extends AIExpenseResponse {
  _id: string;
  _editAmount: string;
  _editCategory: string;
  _editDescription: string;
  _editTags: string;
  _editDate: string;
  _editing: boolean;
  _isNew?: boolean;
}
