import React from "react";
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client.js'
import NavigationTracker from '@/lib/NavigationTracker.jsx'
import { pagesConfig } from './pages.config.js'
import PageNotFound from './lib/PageNotFound.jsx'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext.jsx';
import { Toaster as SonnerToaster, toast } from "sonner";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    try {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught error:', error, info);
    } catch {}
    this.setState({ error });
  }
  render() {
    if (this.state.hasError) {
      const debug =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('debug') === '1';
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <h2 className="text-xl font-semibold">Terjadi kesalahan saat memuat halaman</h2>
            {debug && (
              <div className="max-w-xl mx-auto text-left text-xs bg-slate-50 border rounded p-3 overflow-auto">
                <p className="font-medium mb-1">Detail Error:</p>
                <pre className="whitespace-pre-wrap break-all">
                  {String(this.state?.error?.message || this.state?.error || 'Unknown error')}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800"
            >
              Muat Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const searchParams = (typeof window !== 'undefined') ? new URLSearchParams(location.search) : new URLSearchParams();
  const skipAuth = searchParams.get('skipauth') === '1';
  const pageNameFromPath = (pathname) => {
    if (!pathname || pathname === '/') return mainPageKey;
    const seg = pathname.replace(/^\//, '').split('/')[0];
    return seg;
  };
  const isAllowed = (role, page) => {
    const allowed = {
      superadmin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Pengaturan','Lisensi','GenerateLisensi','Cabang','Login'],
      admin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Pengaturan','Lisensi','GenerateLisensi','Cabang','Login'],
      license_admin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Pengaturan','Lisensi','GenerateLisensi','Cabang','Login'],
      kasir: ['Dashboard','Kasir','RiwayatPenjualan','SuratJalan','Pelanggan','Produk','Laporan','Pengaturan','Login','UtangPiutang'],
      staf: ['Dashboard','Produk','Kategori','Satuan','Supplier','Pembelian','MutasiStok','TransferBarang','Pelanggan','RiwayatPenjualan','SuratJalan','Laporan','Pengaturan','Login','UtangPiutang']
    };
    const list = allowed[role || 'staf'] || [];
    return list.includes(page);
  };
  React.useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      const flag = window.localStorage.getItem('login_success');
      if (flag) {
        window.localStorage.removeItem('login_success');
        toast.success('Login berhasil');
      }
    }
  }, [isAuthenticated]);

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!skipAuth && location.pathname !== '/Login' && !isAuthenticated) {
    return <Navigate to={`/Login?return=${encodeURIComponent(location.pathname || '/')}`} replace />;
  }
  if (skipAuth || isAuthenticated) {
    const page = pageNameFromPath(location.pathname);
    if (!isAllowed(user?.role, page)) {
      return <Navigate to={`/${mainPageKey}`} replace />;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/${mainPageKey}`} replace />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            path === 'Login'
              ? <Page />
              : (
                <LayoutWrapper currentPageName={path}>
                  <Page />
                </LayoutWrapper>
              )
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <ErrorBoundary>
            <AuthenticatedApp />
          </ErrorBoundary>
        </Router>
        <SonnerToaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}
export default App
export { App }

