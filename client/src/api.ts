/**
 * Data access layer — thin async wrappers around the browser-side SQLite module.
 * Component code is unchanged; all queries run locally in the browser.
 */
import * as db from './database';
import type { Account, Category, Transaction, Bill, BudgetRow, NetWorthPoint } from './types';

// Accounts
export const getAccounts  = ()                              => Promise.resolve(db.getAccounts());
export const createAccount = (data: Omit<Account,'id'|'balance'>) => Promise.resolve(db.createAccount(data));
export const updateAccount = (id: number, data: Partial<Account>) => Promise.resolve(db.updateAccount(id, data));
export const deleteAccount = (id: number)                  => Promise.resolve(db.deleteAccount(id));

// Categories
export const getCategories   = ()                                  => Promise.resolve(db.getCategories());
export const createCategory  = (data: Omit<Category,'id'>)        => Promise.resolve(db.createCategory(data));
export const updateCategory  = (id: number, data: Partial<Category>) => Promise.resolve(db.updateCategory(id, data));
export const deleteCategory  = (id: number)                       => Promise.resolve(db.deleteCategory(id));

// Transactions
export const getTransactions  = (accountId: number, month?: string) => Promise.resolve(db.getTransactions(accountId, month));
export const createTransaction = (data: Partial<Transaction>)       => Promise.resolve(db.createTransaction(data));
export const updateTransaction = (id: number, data: Partial<Transaction>) => Promise.resolve(db.updateTransaction(id, data));
export const deleteTransaction = (id: number)                      => Promise.resolve(db.deleteTransaction(id));

// Bills
export const getBills   = ()                            => Promise.resolve(db.getBills());
export const createBill = (data: Partial<Bill>)        => Promise.resolve(db.createBill(data));
export const updateBill = (id: number, data: Partial<Bill>) => Promise.resolve(db.updateBill(id, data));
export const deleteBill = (id: number)                 => Promise.resolve(db.deleteBill(id));
export const payBill    = (id: number, date?: string, accountId?: number) =>
  Promise.resolve(db.payBill(id, date, accountId));

// Budgets
export const getBudgets  = (month: string)                                        => Promise.resolve(db.getBudgets(month));
export const saveBudget  = (data: { category_id: number; month: string; amount: number }) => Promise.resolve(db.saveBudget(data));
export const deleteBudget = (id: number)                                           => Promise.resolve(db.deleteBudget(id));

// Net Worth
export const getNetWorth = (months = 12) => Promise.resolve(db.getNetWorth(months));

// Payees (for autocomplete)
export const getPayees = () => Promise.resolve(db.getPayees());

// Attachments
export const getAttachments    = (txnId: number)          => Promise.resolve(db.getAttachments(txnId));
export const getAttachmentData = (id: number)             => Promise.resolve(db.getAttachmentData(id));
export const addAttachment     = (txnId: number, f: File) => db.addAttachment(txnId, f);
export const deleteAttachment  = (id: number)             => Promise.resolve(db.deleteAttachment(id));

// Reports
export const reportSpendingByCategory = (from: string, to: string) => Promise.resolve(db.reportSpendingByCategory(from, to));
export const reportMonthlySummary     = (months?: number)           => Promise.resolve(db.reportMonthlySummary(months));
export const reportTaxSummary         = (year?: string)             => Promise.resolve(db.reportTaxSummary(year));

// Search
export const searchTransactions = (p: db.SearchParams) => Promise.resolve(db.searchTransactions(p));
