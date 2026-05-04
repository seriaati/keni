export interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

export interface UserResponse {
  id: string;
  username: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
  timezone: string | null;
  custom_ai_prompt: string | null;
  global_currency: string | null;
  language: string | null;
}

export interface WalletResponse {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  created_at: string;
}

export interface WalletSummary extends WalletResponse {
  total_expenses: number;
  expense_count: number;
  total_income: number;
  income_count: number;
  balance: number;
}

export interface CategoryResponse {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  created_at: string;
}

export interface TagResponse {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface CategoryBrief {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface TagBrief {
  id: string;
  name: string;
  color: string | null;
}

export interface TransactionLinkBrief {
  id: string;
  wallet_id: string;
  category: CategoryBrief;
  type: 'expense' | 'income';
  amount: number;
  description: string | null;
  date: string;
  tags: TagBrief[];
}

export interface TransactionResponse {
  id: string;
  wallet_id: string;
  category: CategoryBrief;
  amount: number;
  type: 'expense' | 'income';
  description: string | null;
  date: string;
  ai_context: string | null;
  tags: TagBrief[];
  group_id: string | null;
  children: TransactionResponse[] | null;
  linked_transactions: TransactionLinkBrief[];
  created_at: string;
  updated_at: string;
}

export type ExpenseResponse = TransactionResponse;

export interface TransactionListResponse {
  items: TransactionResponse[];
  total: number;
  page: number;
  page_size: number;
}

export type ExpenseListResponse = TransactionListResponse;

export interface TransactionSummary {
  total_amount: number;
  expense_count: number;
  total_income: number;
  income_count: number;
  by_category: { category_id: string; category_name: string; category_color: string | null; total: number; count: number }[];
  income_by_category: { category_id: string; category_name: string; category_color: string | null; total: number; count: number }[];
  by_period: { period: string; total: number; count: number }[];
}

export type ExpenseSummary = TransactionSummary;

export interface SuggestedTag {
  name: string;
  is_new: boolean;
}

export interface AIExpenseResponse {
  amount: number | null;
  currency: string | null;
  category_name: string | null;
  is_new_category: boolean;
  description: string | null;
  date: string | null;
  ai_context: string | null;
  suggested_tags: SuggestedTag[];
  suggested_icon: string | null;
  type: 'expense' | 'income';
}

export interface AIRecurringResponse {
  amount: number;
  currency: string;
  category_name: string;
  is_new_category: boolean;
  description: string;
  frequency: string;
  next_due: string;
  ai_context: string;
  type: 'expense' | 'income';
  suggested_tags: SuggestedTag[];
  suggested_icon: string | null;
}

export interface AIParseResponse {
  result_type: 'single' | 'multiple' | 'group' | 'recurring';
  expenses: AIExpenseResponse[];
  group: AIExpenseResponse | null;
  recurring: AIRecurringResponse | null;
}

export interface VoiceParseResponse extends AIParseResponse {
  transcript: string;
}

export interface GroupTransactionItemRequest {
  category_name?: string;
  category_id?: string;
  category_icon?: string;
  amount: number;
  description?: string;
  tag_names?: string[];
  tag_ids?: string[];
}

export type GroupExpenseItemRequest = GroupTransactionItemRequest;

export interface GroupTransactionRequest {
  group: {
    category_name?: string;
    category_id?: string;
    category_icon?: string;
    amount: number;
    description?: string;
    date?: string;
    tag_names?: string[];
    tag_ids?: string[];
  };
  items: GroupTransactionItemRequest[];
}

export type GroupExpenseRequest = GroupTransactionRequest;

export interface BudgetResponse {
  id: string;
  user_id: string;
  wallet_id: string | null;
  category_id: string | null;
  amount: number;
  period: 'weekly' | 'monthly';
  start_date: string;
  created_at: string;
  spent: number;
  remaining: number;
  percentage_used: number;
  is_over_budget: boolean;
}

export interface RecurringTransactionResponse {
  id: string;
  wallet_id: string;
  category_id: string;
  amount: number;
  type: 'expense' | 'income';
  description: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  next_due: string;
  is_active: boolean;
  created_at: string;
}

export type RecurringExpenseResponse = RecurringTransactionResponse;

export interface APITokenResponse {
  id: string;
  name: string;
  last_used: string | null;
  created_at: string;
  expires_at: string | null;
}

export interface APITokenCreateResponse extends APITokenResponse {
  token: string;
}

export interface AIProviderResponse {
  provider: string;
  model: string;
  api_key_masked: string;
  ocr_enabled: boolean;
}

export interface AIProviderModelsResponse {
  models: string[];
}

export interface ChatResponse {
  response: string;
  data: unknown;
}

export interface AdminSettingsResponse {
  signups_enabled: boolean;
}
