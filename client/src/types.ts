export interface Account {
  id: number;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment';
  initial_balance: number;
  balance: number;
}

export interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  color: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  payee: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  amount: number;
  memo: string;
  cleared: number;
  transfer_account_id: number | null;
  bill_id: number | null;
  running_balance: number;
}

export interface Bill {
  id: number;
  name: string;
  amount: number;
  due_day: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'annual';
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  account_id: number | null;
  account_name: string | null;
  is_active: number;
  last_paid: string | null;
}

export interface BudgetRow {
  id: number | null;
  category_id: number;
  category_name: string;
  category_color: string;
  month: string;
  amount: number;
  actual: number;
}

export interface NetWorthPoint {
  label: string;
  month: string;
  assets: number;
  liabilities: number;
  net_worth: number;
}

export type View =
  | { type: 'account'; id: number }
  | { type: 'bills' }
  | { type: 'budget' }
  | { type: 'networth' }
  | { type: 'import' };
