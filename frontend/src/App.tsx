import loadingSrc from './assets/loading.svg';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { WalletProvider } from './contexts/WalletContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WalletsPage } from './pages/WalletsPage';
import { WalletViewPage } from './pages/WalletViewPage';
import { ExpenseDetailPage } from './pages/ExpenseDetailPage';
import { ChatPage } from './pages/ChatPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { RecurringPage } from './pages/RecurringPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { TagsPage } from './pages/TagsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';
import { OAuthAuthorizePage } from './pages/OAuthAuthorizePage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user?.is_admin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLoader() {
  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--cream)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <img
          src={loadingSrc}
          alt=""
          style={{
            width: 40,
            height: 40,
            margin: '0 auto 16px',
            display: 'block',
            animation: 'spin 2s linear infinite',
          }}
        />
        <p style={{ fontSize: 13, color: 'var(--ink-faint)' }}>Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <WalletProvider>
              <Layout />
            </WalletProvider>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="wallets" element={<WalletsPage />} />
        <Route path="wallets/:walletId" element={<WalletViewPage />} />
        <Route path="wallets/:walletId/expenses/:expenseId" element={<ExpenseDetailPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="recurring" element={<RecurringPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
