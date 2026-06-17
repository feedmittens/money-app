import { useState, useEffect, useCallback } from 'react';
import type { Account, View } from './types';
import { getAccounts, getMe, logout } from './api';
import type { User } from './api';
import Sidebar         from './components/Sidebar';
import Dashboard       from './components/Dashboard';
import Forecast        from './components/Forecast';
import AccountRegister from './components/AccountRegister';
import Bills           from './components/Bills';
import Budget          from './components/Budget';
import NetWorth        from './components/NetWorth';
import ImportData      from './components/ImportData';
import Reports         from './components/Reports';
import Search          from './components/Search';
import ApiTokens       from './components/ApiTokens';
import Login           from './components/Login';
import Register        from './components/Register';

type AuthState = 'loading' | 'authenticated' | 'login' | 'register';

export default function App() {
  const [authState,    setAuthState]    = useState<AuthState>('loading');
  const [user,         setUser]         = useState<User | null>(null);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [view,         setView]         = useState<View>({ type: 'home' });
  const [sidebarOpen,  setSidebarOpen]  = useState(() => window.innerWidth > 768);

  function handleViewChange(v: View) {
    setView(v);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }

  const loadAccounts = useCallback(async () => {
    try {
      const data = await getAccounts();
      setAccounts(data);
      setView(prev => {
        if (prev.type === 'account' && !data.find(a => a.id === prev.id)) {
          return data.length ? { type: 'account', id: data[0].id } : { type: 'home' };
        }
        return prev;
      });
    } catch {
      // auth:unauthorized events are handled globally; other errors leave accounts as-is
    }
  }, []);

  useEffect(() => {
    getMe()
      .then(u => { setUser(u); setAuthState('authenticated'); })
      .catch(() => setAuthState('login'));
  }, []);

  useEffect(() => {
    const handler = () => { setUser(null); setAuthState('login'); };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  useEffect(() => {
    if (authState === 'authenticated') loadAccounts();
  }, [authState, loadAccounts]);

  async function handleLogout() {
    await logout();
    setUser(null);
    setAccounts([]);
    setAuthState('login');
  }

  function handleLogin(u: User) {
    setUser(u);
    setAuthState('authenticated');
  }

  if (authState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (authState === 'register') {
    return <Register onLogin={handleLogin} onBack={() => setAuthState('login')} />;
  }

  if (authState === 'login') {
    return <Login onLogin={handleLogin} onRegister={() => setAuthState('register')} />;
  }

  return (
    <div className="app-layout">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <Sidebar
        accounts={accounts}
        view={view}
        user={user!}
        onViewChange={handleViewChange}
        onAccountsChange={loadAccounts}
        onLogout={handleLogout}
        open={sidebarOpen}
      />
      <main className="main-content">
        <button
          className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(o => !o)}
          title="Toggle menu"
          aria-label="Toggle navigation menu"
        >☰</button>
        {view.type === 'home'     && <Dashboard accounts={accounts} onNavigate={handleViewChange} />}
        {view.type === 'forecast' && <Forecast />}
        {view.type === 'account'  && <AccountRegister key={view.id} accountId={view.id} accounts={accounts} onBalanceChange={loadAccounts} />}
        {view.type === 'bills'    && <Bills accounts={accounts} onTransactionAdded={loadAccounts} />}
        {view.type === 'budget'   && <Budget />}
        {view.type === 'networth' && <NetWorth accounts={accounts} />}
        {view.type === 'import'   && <ImportData onImportDone={loadAccounts} />}
        {view.type === 'reports'  && <Reports />}
        {view.type === 'search'   && <Search accounts={accounts} onGoToAccount={id => handleViewChange({ type: 'account', id })} />}
        {view.type === 'tokens'   && <ApiTokens />}
      </main>
    </div>
  );
}
