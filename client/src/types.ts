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
  parent_id?: number | null;
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
  tax_relevant: number;
  transfer_account_id: number | null;
  transfer_peer_id: number | null;
  bill_id: number | null;
  running_balance: number;
  has_splits: boolean;
}

export interface TransactionSplit {
  id: number;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  amount: number;
  memo: string;
}

export interface Attachment {
  id: number;
  transaction_id: number;
  filename: string;
  mime_type: string;
  size: number;
  data: Uint8Array;
  created_at: string;
}

export interface Bill {
  id: number;
  name: string;
  amount: number;
  gross_amount: number | null;
  due_day: number;
  due_day_2: number | null;
  custom_days: string | null;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'semimonthly' | 'custom';
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  account_id: number | null;
  account_name: string | null;
  is_active: number;
  last_paid: string | null;
  auto_post: boolean;
  deductions: BillDeduction[];
}

export interface BillDeduction {
  id?: number;
  label: string;
  amount: number;
  fsa_account_id: number | null;
}

export interface FsaAccount {
  id: number;
  name: string;
  fsa_type: 'dependent_care' | 'medical';
  plan_year: number;
  annual_election: number;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  is_active: boolean;
  ytd_contributed: number;
  ytd_spent: number;
  spend_transaction_count: number;
  remaining_to_spend: number;
  per_pay_period_amount: number;
  projected_contribution: number;
  on_track: boolean;
}

export interface BudgetRow {
  id: number | null;
  category_id: number;
  category_name: string;
  category_color: string;
  month: string;
  amount: number;
  actual: number;
  rollover: boolean;
  rollover_amount: number;
}

export interface NetWorthPoint {
  label: string;
  month: string;
  assets: number;
  liabilities: number;
  net_worth: number;
}

export interface ForecastPoint {
  label: string;
  month: string;
  balance: number;
}

export interface CashFlowItem {
  date:            string;
  description:     string;
  category:        string;
  amount:          number;
  running_balance: number;
  source:          'transaction' | 'bill';
}

export interface NewsItem {
  title:       string;
  link:        string;
  description: string;
  pubDate:     string;
  source:      string;
}

export interface NewsResponse {
  items:      NewsItem[];
  fetchedAt:  number;
}

export interface NewsFeed {
  id:    number;
  url:   string;
  label: string;
}

export type View =
  | { type: 'home' }
  | { type: 'account'; id: number }
  | { type: 'bills' }
  | { type: 'budget' }
  | { type: 'networth' }
  | { type: 'forecast' }
  | { type: 'fsa' }
  | { type: 'assistant' }
  | { type: 'import' }
  | { type: 'reports' }
  | { type: 'search' }
  | { type: 'tokens' }
  | { type: 'settings' }
  | { type: 'admin' };
