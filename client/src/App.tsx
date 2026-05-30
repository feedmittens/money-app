import { useState, useEffect, useCallback } from 'react';
import type { Account, View } from './types';
import { getAccounts } from './api';
import Sidebar from './components/Sidebar';
import AccountRegister from './components/AccountRegister';
import Bills from './components/Bills';
import Budget from './components/Budget';
import NetWorth from './components/NetWorth';
import ImportData from './components/ImportData';

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [view, setView] = useState<View>({ type: 'bills' });

  const loadAccounts = useCallback(async () => {
    const data = await getAccounts();
    setAccounts(data);
    // Select first account if current view is stale
    setView(prev => {
      if (prev.type === 'account' && !data.find(a => a.id === prev.id)) {
        return data.length ? { type: 'account', id: data[0].id } : { type: 'bills' };
      }
      return prev;
    });
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Auto-select first account on first load
  useEffect(() => {
    if (accounts.length && view.type === 'bills') {
      setView({ type: 'account', id: accounts[0].id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length === 0 ? 'empty' : 'loaded']);

  return (
    <div className="app-layout">
      <Sidebar
        accounts={accounts}
        view={view}
        onViewChange={setView}
        onAccountsChange={loadAccounts}
      />
      <main className="main-content">
        {view.type === 'account' && (
          <AccountRegister
            key={view.id}
            accountId={view.id}
            accounts={accounts}
            onBalanceChange={loadAccounts}
          />
        )}
        {view.type === 'bills' && (
          <Bills accounts={accounts} onTransactionAdded={loadAccounts} />
        )}
        {view.type === 'budget' && <Budget />}
        {view.type === 'networth' && <NetWorth accounts={accounts} />}
        {view.type === 'import' && <ImportData onImportDone={loadAccounts} />}
      </main>
    </div>
  );
}
