import { useState, useEffect, useCallback } from 'react';
import type { Account, View } from './types';
import { getAccounts } from './api';
import { isLoaded, saveNow } from './database';
import Sidebar from './components/Sidebar';
import AccountRegister from './components/AccountRegister';
import Bills from './components/Bills';
import Budget from './components/Budget';
import NetWorth from './components/NetWorth';
import ImportData from './components/ImportData';
import DatabaseLoader from './components/DatabaseLoader';

export default function App() {
  const [dbReady, setDbReady] = useState(isLoaded());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [view, setView]         = useState<View>({ type: 'bills' });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | ''>('');

  const loadAccounts = useCallback(async () => {
    const data = await getAccounts();
    setAccounts(data);
    setView(prev => {
      if (prev.type === 'account' && !data.find(a => a.id === prev.id)) {
        return data.length ? { type: 'account', id: data[0].id } : { type: 'bills' };
      }
      return prev;
    });
  }, []);

  function handleDbLoaded() {
    setDbReady(true);
  }

  useEffect(() => {
    if (dbReady) loadAccounts();
  }, [dbReady, loadAccounts]);

  // Auto-select first account after load
  useEffect(() => {
    if (accounts.length && view.type === 'bills') {
      setView({ type: 'account', id: accounts[0].id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length === 0 ? 'empty' : 'loaded']);

  // Show "Saved" flash on manual save (Ctrl+S)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        setSaveStatus('saving');
        saveNow().then(() => {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus(''), 1800);
        });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!dbReady) {
    return <DatabaseLoader onLoaded={handleDbLoaded} />;
  }

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
        {view.type === 'bills'   && <Bills accounts={accounts} onTransactionAdded={loadAccounts} />}
        {view.type === 'budget'  && <Budget />}
        {view.type === 'networth'&& <NetWorth accounts={accounts} />}
        {view.type === 'import'  && <ImportData onImportDone={loadAccounts} />}
      </main>

      {saveStatus && (
        <div className="save-toast">
          {saveStatus === 'saving' ? '💾 Saving…' : '✅ Saved'}
        </div>
      )}
    </div>
  );
}
