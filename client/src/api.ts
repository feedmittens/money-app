import type { Account, Category, Transaction, Bill, BudgetRow, NetWorthPoint } from './types';

const BASE = '/api';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Accounts
export const getAccounts = () => req<Account[]>('/accounts');
export const createAccount = (data: Omit<Account, 'id' | 'balance'>) =>
  req<Account>('/accounts', { method: 'POST', body: JSON.stringify(data) });
export const updateAccount = (id: number, data: Partial<Account>) =>
  req<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteAccount = (id: number) =>
  req<{ ok: boolean }>(`/accounts/${id}`, { method: 'DELETE' });

// Categories
export const getCategories = () => req<Category[]>('/categories');
export const createCategory = (data: Omit<Category, 'id'>) =>
  req<Category>('/categories', { method: 'POST', body: JSON.stringify(data) });
export const updateCategory = (id: number, data: Partial<Category>) =>
  req<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteCategory = (id: number) =>
  req<{ ok: boolean }>(`/categories/${id}`, { method: 'DELETE' });

// Transactions
export const getTransactions = (account_id: number, month?: string) => {
  const qs = month ? `?account_id=${account_id}&month=${month}` : `?account_id=${account_id}`;
  return req<Transaction[]>(`/transactions${qs}`);
};
export const createTransaction = (data: Partial<Transaction>) =>
  req<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) });
export const updateTransaction = (id: number, data: Partial<Transaction>) =>
  req<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteTransaction = (id: number) =>
  req<{ ok: boolean }>(`/transactions/${id}`, { method: 'DELETE' });

// Bills
export const getBills = () => req<Bill[]>('/bills');
export const createBill = (data: Partial<Bill>) =>
  req<Bill>('/bills', { method: 'POST', body: JSON.stringify(data) });
export const updateBill = (id: number, data: Partial<Bill>) =>
  req<Bill>(`/bills/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteBill = (id: number) =>
  req<{ ok: boolean }>(`/bills/${id}`, { method: 'DELETE' });
export const payBill = (id: number, date?: string, account_id?: number) =>
  req<{ transaction: Transaction; bill: Bill }>(`/bills/${id}/pay`, {
    method: 'POST',
    body: JSON.stringify({ date, account_id }),
  });

// Budgets
export const getBudgets = (month: string) => req<BudgetRow[]>(`/budgets?month=${month}`);
export const saveBudget = (data: { category_id: number; month: string; amount: number }) =>
  req<BudgetRow>('/budgets', { method: 'POST', body: JSON.stringify(data) });
export const deleteBudget = (id: number) =>
  req<{ ok: boolean }>(`/budgets/${id}`, { method: 'DELETE' });

// Net Worth
export const getNetWorth = (months = 12) => req<NetWorthPoint[]>(`/networth?months=${months}`);
