/**
 * API client — all data comes from the server over HTTPS.
 * Credentials (session cookies) are included on every request.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (res.status === 401) {
    // Let the app handle auth redirects
    window.dispatchEvent(new Event('auth:unauthorized'));
    throw new ApiError(401, 'Not authenticated');
  }

  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error || `HTTP ${res.status}`);
  return data as T;
}

const get  = <T>(path: string)                    => apiFetch<T>(path);
const post = <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
const put  = <T>(path: string, body?: unknown)    => apiFetch<T>(path, { method: 'PUT',  body: JSON.stringify(body) });
const del  = <T>(path: string)                    => apiFetch<T>(path, { method: 'DELETE' });

// ── Auth ──────────────────────────────────────────────────────────────────────
export const getMe           = ()                                    => get<User>('/api/auth/me');
export const login           = (email: string, password: string)     => post<LoginResult>('/api/auth/login', { email, password });
export const register        = (email: string, password: string, displayName: string) =>
  post<RegisterResult>('/api/auth/register', { email, password, displayName });
export const logout          = ()                                    => post<{ok:boolean}>('/api/auth/logout');
export const verifyTotp      = (code: string)                        => post<LoginResult>('/api/auth/2fa/verify', { code });
export const setup2fa        = ()                                    => post<{secret:string;qrDataUrl:string}>('/api/auth/2fa/setup');
export const enable2fa       = (code: string)                        => post<{ok:boolean}>('/api/auth/2fa/enable', { code });
export const disable2fa      = (code: string)                        => post<{ok:boolean}>('/api/auth/2fa/disable', { code });
export const changePassword  = (currentPassword: string, newPassword: string) =>
  post<{ok:boolean}>('/api/auth/change-password', { currentPassword, newPassword });

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getUsers        = ()                       => get<User[]>('/api/admin/users');
export const approveUser     = (id: number)             => post<{ok:boolean}>(`/api/admin/users/${id}/approve`);
export const suspendUser     = (id: number)             => post<{ok:boolean}>(`/api/admin/users/${id}/suspend`);
export const unsuspendUser   = (id: number)             => post<{ok:boolean}>(`/api/admin/users/${id}/unsuspend`);
export const setUserRole     = (id: number, role: string) => post<{ok:boolean}>(`/api/admin/users/${id}/role`, { role });
export const deleteUser      = (id: number)             => del<{ok:boolean}>(`/api/admin/users/${id}`);

// ── Accounts ──────────────────────────────────────────────────────────────────
export const getAccounts     = ()                                      => get<Account[]>('/api/accounts');
export const createAccount   = (data: Omit<Account,'id'|'balance'>)   => post<Account>('/api/accounts', data);
export const updateAccount   = (id: number, data: Partial<Account>)   => put<Account>(`/api/accounts/${id}`, data);
export const deleteAccount   = (id: number)                           => del<{ok:boolean}>(`/api/accounts/${id}`);

// ── Categories ────────────────────────────────────────────────────────────────
export const getCategories   = ()                                      => get<Category[]>('/api/categories');
export const createCategory  = (data: Omit<Category,'id'>)            => post<Category>('/api/categories', data);
export const updateCategory  = (id: number, data: Partial<Category>)  => put<Category>(`/api/categories/${id}`, data);
export const deleteCategory  = (id: number)                           => del<{ok:boolean}>(`/api/categories/${id}`);

// ── Transactions ──────────────────────────────────────────────────────────────
export const getTransactions  = (accountId: number, month?: string)   =>
  get<Transaction[]>(`/api/transactions?account_id=${accountId}${month ? `&month=${month}` : ''}`);
export const createTransaction = (data: Partial<Transaction>)         => post<Transaction>('/api/transactions', data);
export const updateTransaction = (id: number, data: Partial<Transaction>) => put<Transaction>(`/api/transactions/${id}`, data);
export const deleteTransaction = (id: number)                         => del<{ok:boolean}>(`/api/transactions/${id}`);
export const getPayees         = ()                                    => get<string[]>('/api/transactions/payees');

// ── Attachments ───────────────────────────────────────────────────────────────
export const getAttachments = (txnId: number) =>
  get<Attachment[]>(`/api/transactions/${txnId}/attachments`);

export const addAttachment = (txnId: number, file: File): Promise<Attachment> =>
  new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) { reject(new Error('Attachment must be under 10 MB')); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(reader.result as ArrayBuffer)));
      try {
        resolve(await post<Attachment>(`/api/transactions/${txnId}/attachments`, {
          filename: file.name, mime_type: file.type || 'application/octet-stream',
          size: file.size, data: base64,
        }));
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

export const deleteAttachment  = (txnId: number, id: number) =>
  del<{ok:boolean}>(`/api/transactions/${txnId}/attachments/${id}`);

export const downloadAttachmentUrl = (txnId: number, id: number) =>
  `/api/transactions/${txnId}/attachments/${id}/download`;

// ── Bills ─────────────────────────────────────────────────────────────────────
export const getBills   = ()                                      => get<Bill[]>('/api/bills');
export const createBill = (data: Partial<Bill>)                   => post<Bill>('/api/bills', data);
export const updateBill = (id: number, data: Partial<Bill>)       => put<Bill>(`/api/bills/${id}`, data);
export const deleteBill = (id: number)                            => del<{ok:boolean}>(`/api/bills/${id}`);
export const payBill    = (id: number, date?: string, account_id?: number) =>
  post<{transaction: Transaction; bill: Bill}>(`/api/bills/${id}/pay`, { date, account_id });

// ── Budgets ───────────────────────────────────────────────────────────────────
export const getBudgets  = (month: string)                        => get<BudgetRow[]>(`/api/budgets?month=${month}`);
export const saveBudget  = (data: {category_id:number;month:string;amount:number}) =>
  post<BudgetRow>('/api/budgets', data);
export const deleteBudget = (id: number)                         => del<{ok:boolean}>(`/api/budgets/${id}`);

// ── Net Worth ─────────────────────────────────────────────────────────────────
export const getNetWorth = (months = 12)                          => get<NetWorthPoint[]>(`/api/networth?months=${months}`);

// ── Search ────────────────────────────────────────────────────────────────────
export const searchTransactions = (params: SearchParams) => {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return get<SearchResult[]>(`/api/transactions/search?${qs}`);
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportSpendingByCategory = (from: string, to: string) =>
  get<CategorySpend[]>(`/api/transactions/reports/spending?from=${from}&to=${to}`);
export const reportMonthlySummary = () =>
  get<MonthlyRow[]>('/api/transactions/reports/monthly');
export const reportTaxSummary = (year?: string) =>
  get<TaxRow[]>(`/api/transactions/reports/tax${year ? `?year=${year}` : ''}`);

// ── Import ────────────────────────────────────────────────────────────────────
export const importPreview = (content: string, filename: string) =>
  post<{ok:boolean;format:string;summary:PreviewAccount[]}>('/api/import/preview', { content, filename });
export const importFile = (content: string, filename: string) =>
  post<{ok:boolean} & ImportResult>('/api/import', { content, filename });

// ── Types (re-exported for convenience) ───────────────────────────────────────
export type { Account, Attachment, Category, Transaction, Bill, BudgetRow, NetWorthPoint } from './types';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  totpEnabled: boolean;
}

export interface LoginResult {
  status: 'ok' | 'totp_required';
  user?: User;
}

export interface RegisterResult {
  status: 'active' | 'pending';
  user?: User;
  message?: string;
}

export interface SearchParams {
  q?: string;
  account_id?: number | null;
  date_from?: string;
  date_to?: string;
  amount_min?: number | null;
  amount_max?: number | null;
  tax_only?: boolean;
}

export interface SearchResult {
  id: number; date: string; payee: string; amount: number;
  memo: string; cleared: boolean; tax_relevant: boolean;
  category_name: string; category_color: string;
  account_name: string; account_id: number;
}

export interface CategorySpend { category_name: string; category_color: string; total: number; count: number; }
export interface MonthlyRow    { month: string; income: number; expenses: number; net: number; }
export interface TaxRow        { id: number; date: string; payee: string; amount: number; memo: string; category_name: string; account_name: string; attachment_count: number; }
export interface PreviewAccount { name: string; type: string; count: number; sample: ParsedTransaction[]; }
export interface ParsedAccount  { name: string; type: string; transactions: ParsedTransaction[]; }
export interface ParsedTransaction { date: string|null; amount?: number; payee?: string; memo?: string; category?: string; cleared?: number; }

export interface ImportLogEntry { account: string; date: string; payee: string; amount: string; status: 'imported'|'skipped'; reason: string; }
export interface ImportStats    { accounts: number; transactions: number; skipped: number; categories: number; }
export interface ImportResult   { stats: ImportStats; log: ImportLogEntry[]; }
