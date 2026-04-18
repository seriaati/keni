import type {
  AdminSettingsResponse,
  AIParseResponse,
  AIProviderModelsResponse,
  AIProviderResponse,
  APITokenCreateResponse,
  APITokenResponse,
  BudgetResponse,
  CategoryResponse,
  ChatResponse,
  TransactionListResponse,
  TransactionResponse,
  TransactionSummary,
  GroupTransactionRequest,
  RecurringTransactionResponse,
  TagResponse,
  TokenResponse,
  UserResponse,
  VoiceParseResponse,
  WalletResponse,
  WalletSummary,
  AIRecurringResponse,
} from './types';

const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

function getToken(): string | null {
  return localStorage.getItem('access_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

function setTokens(tokens: TokenResponse) {
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data: TokenResponse = await res.json();
    setTokens(data);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return request<T>(path, options, false);
    clearTokens();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const auth = {
  login: (username: string, password: string) =>
    request<TokenResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  signup: (username: string, password: string, display_name?: string) =>
    request<TokenResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password, display_name }),
    }),

  setTokens,
  clearTokens,
  getToken,
};

export const users = {
  me: () => request<UserResponse>('/users/me'),
  update: (data: { display_name?: string; password?: string; timezone?: string | null }) =>
    request<UserResponse>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
};

export const wallets = {
  list: () => request<WalletResponse[]>('/wallets'),
  get: (id: string) => request<WalletSummary>(`/wallets/${id}`),
  create: (data: { name: string; currency: string; is_default?: boolean }) =>
    request<WalletResponse>('/wallets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; currency?: string; is_default?: boolean }) =>
    request<WalletResponse>(`/wallets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/wallets/${id}`, { method: 'DELETE' }),
};

export const expenses = {
  list: (walletId: string, params: Record<string, string | number | string[] | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') continue;
      if (Array.isArray(v)) {
        for (const item of v) q.append(k, item);
      } else {
        q.set(k, String(v));
      }
    }
    return request<TransactionListResponse>(`/wallets/${walletId}/transactions?${q}`);
  },
  get: (walletId: string, expenseId: string) =>
    request<TransactionResponse>(`/wallets/${walletId}/transactions/${expenseId}`),
  create: (walletId: string, data: {
    category_id?: string;
    category_name?: string;
    amount: number;
    type?: 'expense' | 'income';
    description?: string;
    date?: string;
    tag_ids?: string[];
    tag_names?: string[];
    ai_context?: string;
  }) =>
    request<TransactionResponse>(`/wallets/${walletId}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ tag_ids: [], tag_names: [], ...data }),
    }),
  update: (walletId: string, expenseId: string, data: {
    category_id?: string;
    amount?: number;
    description?: string;
    date?: string;
    tag_ids?: string[];
  }) =>
    request<TransactionResponse>(`/wallets/${walletId}/transactions/${expenseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (walletId: string, expenseId: string) =>
    request<void>(`/wallets/${walletId}/transactions/${expenseId}`, { method: 'DELETE' }),
  summary: (walletId: string, params: { start_date?: string; end_date?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    return request<TransactionSummary>(`/wallets/${walletId}/transactions/summary?${q}`);
  },
  aiParse: (walletId: string, text?: string, file?: File) => {
    const form = new FormData();
    if (text) form.append('text', text);
    if (file) form.append('file', file);
    return request<AIParseResponse>(`/wallets/${walletId}/transactions/ai`, {
      method: 'POST',
      body: form,
      headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
  },
  voiceParse: (walletId: string, audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, 'recording.webm');
    return request<VoiceParseResponse>(`/wallets/${walletId}/transactions/voice`, {
      method: 'POST',
      body: form,
      headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone },
    });
  },
  createGroup: (walletId: string, data: GroupTransactionRequest) =>
    request<TransactionResponse>(`/wallets/${walletId}/transactions/groups`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  export: (walletId: string, format: 'csv' | 'json', params: { start_date?: string; end_date?: string } = {}) => {
    const q = new URLSearchParams({ format });
    if (params.start_date) q.set('start_date', params.start_date);
    if (params.end_date) q.set('end_date', params.end_date);
    const token = getToken();
    return fetch(`${BASE}/wallets/${walletId}/export?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};

export const categories = {
  list: () => request<CategoryResponse[]>('/categories'),
  create: (data: { name: string; icon?: string | null; color?: string; type: 'expense' | 'income' }) =>
    request<CategoryResponse>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; icon?: string | null; color?: string; type?: 'expense' | 'income' }) =>
    request<CategoryResponse>(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
};

export const tags = {
  list: () => request<TagResponse[]>('/tags'),
  create: (data: { name: string; color?: string }) =>
    request<TagResponse>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<TagResponse>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
};

export const budgets = {
  list: () => request<BudgetResponse[]>('/budgets'),
  create: (data: { wallet_id?: string; category_id?: string; amount: number; period: 'weekly' | 'monthly' }) =>
    request<BudgetResponse>('/budgets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { wallet_id?: string; category_id?: string; amount?: number; period?: 'weekly' | 'monthly' }) =>
    request<BudgetResponse>(`/budgets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/budgets/${id}`, { method: 'DELETE' }),
};

export const recurring = {
  list: (walletId: string) =>
    request<RecurringTransactionResponse[]>(`/wallets/${walletId}/recurring`),
  createFromAI: (walletId: string, data: AIRecurringResponse) =>
    request<RecurringTransactionResponse>(`/wallets/${walletId}/recurring`, {
      method: 'POST',
      body: JSON.stringify({
        category_name: data.category_name,
        amount: data.amount,
        type: data.type,
        description: data.description || undefined,
        frequency: data.frequency,
        next_due: new Date(data.next_due).toISOString(),
        tag_names: data.suggested_tags.map((t) => t.name),
      }),
    }),
  create: (walletId: string, data: {
    category_id?: string;
    category_name?: string;
    amount: number;
    type?: 'expense' | 'income';
    description?: string;
    frequency: string;
    next_due: string;
    tag_names?: string[];
  }) =>
    request<RecurringTransactionResponse>(`/wallets/${walletId}/recurring`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (walletId: string, id: string, data: {
    category_id?: string;
    amount?: number;
    description?: string;
    frequency?: string;
    next_due?: string;
    is_active?: boolean;
  }) =>
    request<RecurringTransactionResponse>(`/wallets/${walletId}/recurring/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  delete: (walletId: string, id: string) =>
    request<void>(`/wallets/${walletId}/recurring/${id}`, { method: 'DELETE' }),
};

export const tokens = {
  list: () => request<APITokenResponse[]>('/tokens'),
  create: (data: { name: string; expires_at?: string }) =>
    request<APITokenCreateResponse>('/tokens', { method: 'POST', body: JSON.stringify(data) }),
  revoke: (id: string) => request<void>(`/tokens/${id}`, { method: 'DELETE' }),
};

export const aiProvider = {
  get: () => request<AIProviderResponse>('/users/me/ai-provider'),
  upsert: (data: { provider: string; api_key?: string; model: string; ocr_enabled?: boolean }) =>
    request<AIProviderResponse>('/users/me/ai-provider', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: () => request<void>('/users/me/ai-provider', { method: 'DELETE' }),
  listModels: (api_key?: string, provider?: string) =>
    request<AIProviderModelsResponse>('/users/me/ai-provider/models', {
      method: 'POST',
      body: JSON.stringify({ api_key: api_key || null, provider: provider || null }),
    }),
};

export const chat = {
  send: (message: string, wallet_id?: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, wallet_id }),
      headers: { 'X-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone },
    }),
};

export const admin = {
  getSettings: () => request<AdminSettingsResponse>('/admin/settings'),
  updateSettings: (data: { signups_enabled: boolean }) =>
    request<AdminSettingsResponse>('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};
