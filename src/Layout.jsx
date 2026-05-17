import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, ShoppingCart, Package, Users, Building2, 
  ShoppingBag, Wallet, BarChart3, History, RefreshCw, Tag, Shield,
  Menu, X, LogOut, ChevronDown, AlertTriangle, Sun, Moon, Settings, Lock, Truck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext.jsx";
import { getSettings } from "@/lib/settings";
import { renderReportPdf } from "@/utils/pdfReport";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Kasir', icon: ShoppingCart, page: 'Kasir' },
  { name: 'Produk', icon: Package, page: 'Produk' },
  { name: 'Kategori & Satuan', icon: Tag, page: 'Kategori' },
  { name: 'Pelanggan', icon: Users, page: 'Pelanggan' },
  { name: 'Supplier', icon: Building2, page: 'Supplier' },
  { name: 'Cabang', icon: Building2, page: 'Cabang' },
  { name: 'Pembelian', icon: ShoppingBag, page: 'Pembelian' },
  { name: 'Riwayat Penjualan', icon: History, page: 'RiwayatPenjualan' },
  { name: 'Surat Jalan', icon: Truck, page: 'SuratJalan' },
  { name: 'Mutasi Stok', icon: RefreshCw, page: 'MutasiStok' },
  { name: 'Transfer Barang', icon: RefreshCw, page: 'TransferBarang' },
  { name: 'Utang & Piutang', icon: Wallet, page: 'UtangPiutang' },
  { name: 'Laporan', icon: BarChart3, page: 'Laporan' },
  { name: 'User', icon: Shield, page: 'User' },
  { name: 'Generate Lisensi', icon: Shield, page: 'GenerateLisensi' },
  { name: 'Pengaturan', icon: Settings, page: 'Pengaturan' },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState('light');
  const [storeName, setStoreName] = useState('POS System');
  const [logoUrl, setLogoUrl] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMode, setMobileMode] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [branches, setBranches] = useState([]);
  const debugMode = (typeof window !== 'undefined') ? (new URLSearchParams(window.location.search).get('debug') === '1') : false;
  const [activeBranchId, setActiveBranchId] = useState(() => {
    if (typeof window === 'undefined') return '1';
    return window.localStorage.getItem('active_branch_id') || '1';
  });

  const applyVisualSettings = (s) => {
    const colorMap = {
      violet: '262 83% 56%',
      blue: '217 91% 60%',
      emerald: '160 84% 39%',
      amber: '38 92% 50%',
      rose: '340 82% 52%',
      cyan: '200 90% 50%',
    };
    const primary = colorMap[s.primary_color] || colorMap.violet;
    const accent = colorMap[s.accent_color] || colorMap.cyan;
    const radiusMap = { sm: '0.25rem', md: '0.5rem', lg: '0.75rem' };
    const radius = radiusMap[s.border_radius] || '0.5rem';
    const root = document.documentElement;
    root.style.setProperty('--primary', primary);
    root.style.setProperty('--ring', primary);
    root.style.setProperty('--chart-1', primary);
    root.style.setProperty('--sidebar-primary', primary);
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--chart-2', accent);
    root.style.setProperty('--sidebar-ring', accent);
    root.style.setProperty('--radius', radius);
    root.style.setProperty('--topbar-height', s.compact_mode ? '3rem' : '4rem');
    if (s.compact_mode) root.classList.add('compact'); else root.classList.remove('compact');
  };

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });
  const { data: subStatus } = useQuery({
    queryKey: ['subscription_status'],
    queryFn: () => base44.subscription.status(),
    staleTime: 60_000
  });
  const isExpired = String(subStatus?.status || '').toLowerCase() !== 'active';
  const isBasicPackage = String(subStatus?.package_name || 'Basic').toLowerCase() === 'basic';
  const { data: currentSub } = useQuery({
    queryKey: ['subscription_current'],
    queryFn: () => base44.subscription.current(),
    staleTime: 60_000
  });
  const { data: latestLicenses = [] } = useQuery({
    queryKey: ['latest_license'],
    queryFn: () => base44.license.list(10),
    staleTime: 60_000
  });
  const [noticeShown, setNoticeShown] = useState(false);

  const lowStockCount = products.filter(p => (p.stock_pcs || 0) <= (p.min_stock_pcs || 0)).length;
  const daysLeft = typeof subStatus?.days_left === 'number' ? subStatus.days_left : null;
  useEffect(() => {
    try {
      const vu = subStatus?.valid_until ? String(subStatus.valid_until) : null;
      const key = vu ? `expiry_notice_${vu}` : null;
      if (typeof daysLeft === 'number' && daysLeft <= 7 && daysLeft >= 0) {
        if (key) {
          const flag = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
          if (!flag && !noticeShown) {
            toast.warning(`Masa aktif tinggal ${daysLeft} hari, segera melakukan perpanjangan.`, {
              description: 'Perpanjang masa aktif sekarang',
            });
            if (typeof window !== 'undefined') window.localStorage.setItem(key, '1');
            setNoticeShown(true);
          }
        } else if (!noticeShown) {
          toast.warning(`Masa aktif tinggal ${daysLeft} hari, segera melakukan perpanjangan.`);
          setNoticeShown(true);
        }
      }
    } catch {}
  }, [daysLeft, subStatus?.valid_until]);

  useEffect(() => {
    const s = getSettings();
    setStoreName(s.store_name || 'POS System');
    setLogoUrl(s.logo_url || '');
    setMobileMode(!!s.mobile_mode);
    setCompactMode(!!s.compact_mode);
    setSidebarOpen(!s.sidebar_collapsed);
    try { applyVisualSettings(s); } catch {}
    let nextTheme = 'light';
    if (s.theme === 'dark') nextTheme = 'dark';
    else if (s.theme === 'system') {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('theme') : null;
      nextTheme = saved || (prefersDark ? 'dark' : 'light');
    } else {
      nextTheme = 'light';
    }
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    const onSettings = (e) => {
      const s = e?.detail || getSettings();
      setStoreName(s.store_name || 'POS System');
      setLogoUrl(s.logo_url || '');
      setMobileMode(!!s.mobile_mode);
    setCompactMode(!!s.compact_mode);
      setSidebarOpen(!s.sidebar_collapsed);
      try { applyVisualSettings(s); } catch {}
      if (s.theme && s.theme !== 'system') {
        const t = s.theme;
        setTheme(t);
        if (t === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('theme', t);
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('settings:updated', onSettings);
      return () => window.removeEventListener('settings:updated', onSettings);
    }
  }, []);

  // Load branches
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await base44.branches.list().catch(() => []);
        let filtered = Array.isArray(list) ? list : [];
        // Filter by allowed_branches if provided by auth.me
        try {
          const me = await base44.auth.me();
          const allowed = Array.isArray(me?.allowed_branches) ? me.allowed_branches : null;
          const role = String(me?.role || '').toLowerCase();
          if (allowed && allowed.length > 0 && !['admin','license_admin','superadmin'].includes(role)) {
            const set = new Set(allowed.map(Number));
            filtered = filtered.filter(b => set.has(Number(b.id)));
          }
        } catch {}
        if (mounted) setBranches(filtered);
        if (typeof window !== 'undefined') {
          const saved = window.localStorage.getItem('active_branch_id');
          const exists = (filtered || []).some(b => String(b.id) === String(saved));
          if (!saved || !exists) {
            const def = (Array.isArray(filtered) ? filtered : []).find(b => String(b.id) === '1') || (filtered?.[0] || { id: 1 });
            const next = String(def?.id || 1);
            window.localStorage.setItem('active_branch_id', next);
            setActiveBranchId(next);
          } else {
            setActiveBranchId(String(saved));
          }
        }
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const onChangeBranch = (val) => {
    setActiveBranchId(val);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('active_branch_id', String(val));
    }
    toast.success('Cabang diubah');
    // Optional: refresh page data by reloading
    if (typeof window !== 'undefined') {
      setTimeout(() => window.location.reload(), 200);
    }
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme', next);
    }
  };

  // Full screen for Kasir page
  if (currentPageName === 'Kasir') {
    return <>{children}</>;
  }

  // Tombol & dialog Masa Aktif dihapus

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 to-accent/10 dark:from-slate-950 dark:to-slate-900">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-[var(--topbar-height)] bg-white/80 dark:bg-slate-900/70 backdrop-blur border-b z-50 flex items-center justify-between px-4">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <div className="flex items-center gap-2">
          {logoUrl ? <img src={logoUrl} alt="logo" className="h-6 w-6 object-contain" /> : null}
          <h1 className="font-bold text-lg">{storeName}</h1>
          {!isBasicPackage && (
            <div className="ml-2">
              <Select value={activeBranchId} onValueChange={onChangeBranch}>
                <SelectTrigger className="h-8 w-[150px]">
                  <SelectValue placeholder="Pilih Cabang" />
                </SelectTrigger>
                <SelectContent>
                  {(branches || []).map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name || `Cabang ${b.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <button
          aria-label="Toggle theme"
          onClick={toggleTheme}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)}>
          <div className="w-64 h-full bg-white dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b">
              <div className="flex items-center gap-2">
                {logoUrl ? <img src={logoUrl} alt="logo" className="h-6 w-6 object-contain" /> : null}
                <h1 className="font-bold text-xl text-primary">{storeName}</h1>
              </div>
            </div>
            <nav className="p-2">
              {(menuItems.filter((item) => {
                const role = user?.role || 'staf';
                const allowed = {
                  superadmin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Lisensi','GenerateLisensi','Pengaturan','Cabang'],
                  admin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Lisensi','Pengaturan','Cabang'],
                  license_admin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Lisensi','GenerateLisensi','Pengaturan','Cabang'],
                  kasir: ['Dashboard','Kasir','RiwayatPenjualan','SuratJalan','Pelanggan','Produk','Laporan','UtangPiutang'],
                  staf: ['Dashboard','Produk','Kategori','Satuan','Supplier','Pembelian','MutasiStok','TransferBarang','Pelanggan','RiwayatPenjualan','SuratJalan','Laporan','UtangPiutang']
                };
                let pages = allowed[role] || [];
                if (isBasicPackage) {
                  pages = pages.filter(p => p !== 'Cabang' && p !== 'TransferBarang');
                }
                return pages.includes(item.page);
              })).map((item) => (
                <Link
                  key={item.page}
                  to={`/${item.page}`}
                  onClick={(e) => {
                    const locked = isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page);
                    if (locked) {
                      e.preventDefault();
                      toast.error('Aplikasi tidak aktif');
                      return;
                    }
                    e.preventDefault();
                    setMobileMenuOpen(false);
                    navigate(`/${item.page}`);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    currentPageName === item.page
                      ? "bg-primary/10 text-primary dark:bg-primary/20"
                      : "text-slate-700 dark:text-slate-300 hover:bg-secondary dark:hover:bg-slate-800/60",
                    isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page) ? "opacity-50 cursor-not-allowed" : ""
                  )}
                  aria-disabled={isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page)}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                  {isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page) && (
                    <Lock className="w-4 h-4 ml-auto opacity-60" />
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-white/90 dark:bg-slate-900/80 backdrop-blur border-r transition-all duration-300 z-40",
        sidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="h-16 flex items-center justify-between px-4 border-b">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              {logoUrl ? <img src={logoUrl} alt="logo" className="h-6 w-6 object-contain" /> : null}
              <h1 className="font-bold text-xl text-primary">{storeName}</h1>
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-2 overflow-auto">
          {(menuItems.filter((item) => {
            const role = user?.role || 'staf';
            let allowed = {
              superadmin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Lisensi','GenerateLisensi','Pengaturan','Cabang'],
              admin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Lisensi','Pengaturan','Cabang'],
              license_admin: ['Dashboard','Kasir','Produk','Kategori','Satuan','Pelanggan','Supplier','Pembelian','RiwayatPenjualan','SuratJalan','MutasiStok','TransferBarang','UtangPiutang','Laporan','User','Lisensi','GenerateLisensi','Pengaturan','Cabang'],
              kasir: ['Dashboard','Kasir','RiwayatPenjualan','SuratJalan','Pelanggan','Produk','Laporan','UtangPiutang'],
              staf: ['Dashboard','Produk','Kategori','Satuan','Supplier','Pembelian','MutasiStok','TransferBarang','Pelanggan','RiwayatPenjualan','SuratJalan','Laporan','UtangPiutang']
            };
            let pages = allowed[role] || [];
            if (isBasicPackage) {
              pages = pages.filter(p => p !== 'Cabang' && p !== 'TransferBarang');
            }
            return pages.includes(item.page);
          })).map((item) => (
            <Link
              key={item.page}
              to={`/${item.page}`}
              onClick={(e) => {
                const locked = isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page);
                if (locked) {
                  e.preventDefault();
                  toast.error('Aplikasi tidak aktif');
                  return;
                }
                e.preventDefault();
                navigate(`/${item.page}`);
              }}
              className={cn(
                "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all mb-1 relative",
                currentPageName === item.page
                  ? "bg-primary/10 text-primary font-medium dark:bg-primary/20"
                  : "text-slate-700 dark:text-slate-300 hover:bg-secondary dark:hover:bg-slate-800/60",
                isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page) ? "opacity-50 cursor-not-allowed" : ""
              )}
              aria-disabled={isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page)}
            >
              <span className={cn(
                "absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r",
                currentPageName === item.page ? "bg-primary" : "bg-transparent group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
              )} />
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{item.name}</span>}
              {item.page === 'Produk' && lowStockCount > 0 && sidebarOpen && (
                <Badge className="ml-auto bg-accent text-accent-foreground">{lowStockCount}</Badge>
              )}
              {isExpired && !['license_admin','superadmin'].includes(user?.role) && !['Pengaturan','Dashboard'].includes(item.page) && (
                <Lock className="w-4 h-4 ml-auto opacity-60" />
              )}
            </Link>
          ))}
        </nav>

        {sidebarOpen && user && (
          <div className="p-4 border-t">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <span className="text-primary dark:text-primary font-semibold">
                  {user.full_name?.[0]?.toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{user.full_name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className={cn(
        "transition-all duration-300",
        "lg:ml-64",
        !sidebarOpen && "lg:ml-20",
        "pt-16 lg:pt-0",
        mobileMode && "pb-16 lg:pb-0"
      )}>
        {/* Top Bar */}
        <header className="hidden lg:flex h-[var(--topbar-height)] bg-white/80 dark:bg-slate-900/70 backdrop-blur border-b items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <h2 className="font-semibold text-lg">{currentPageName}</h2>
            <Badge variant="outline" className="text-[10px] h-5 opacity-50">v1.1</Badge>
            {typeof daysLeft === 'number' && daysLeft <= 7 && daysLeft >= 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate('/Pengaturan')}
                  className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                >
                  Masa aktif tinggal {daysLeft} hari
                </button>
                <button
                  onClick={() => {
                    try {
                      const s = getSettings();
                      const planLabel = String(currentSub?.plan || '-').replace('-', ' ');
                      const active = Array.isArray(latestLicenses) ? latestLicenses.find(l => String(l.status).toLowerCase() === 'aktif') : null;
                      const chosen = active || (latestLicenses?.[0] || null);
                      const priceRaw = chosen?.price;
                      const price = Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0;
                      const pdf = renderReportPdf({
                        title: 'INVOICE PERPANJANGAN MASA AKTIF',
                        company: null,
                        logoUrl: null,
                        table: {
                          headers: ['Keterangan', 'Nilai'],
                          rows: [
                            ['Nama Toko', s.store_name || '-'],
                            ['Alamat', s.store_address || '-'],
                            ['Telepon', s.store_phone || '-'],
                            ['Paket', planLabel || '-'],
                            ['Harga', `Rp ${Number(price).toLocaleString('id-ID')}`]
                          ]
                        },
                        summary: { items: [
                          { label: 'Total', value: `Rp ${Number(price).toLocaleString('id-ID')}` }
                        ] },
                        showMeta: false,
                        noteLines: [
                          'Pembayaran Tunai atau Transfer Melalui:',
                          'Bank Mandiri : 000-000000-000000',
                          'a/n CV. DIGITAL NIAGA SOLUSINDO',
                          'Lakukan Konfirmasi Pembayaran hanya di email / WhatsUp resmi kami :',
                          'email : solusindodigitalniaga@gmail.com',
                          'Whatsup Customer Representative : 085 222 906 706',
                        ]
                      });
                      pdf.save('invoice-masa-aktif.pdf');
                    } catch {}
                  }}
                  className="text-xs px-2 py-1 rounded bg-amber-200 text-amber-900 hover:bg-amber-300"
                >
                  Download Invoice (PDF)
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {!isBasicPackage && (
              <Select value={activeBranchId} onValueChange={onChangeBranch}>
                <SelectTrigger className="h-8 w-[170px]">
                  <SelectValue placeholder="Pilih Cabang" />
                </SelectTrigger>
                <SelectContent>
                  {(branches || []).map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name || `Cabang ${b.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              className="hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
            {lowStockCount > 0 && (
              <Link to="/Produk">
                <Badge className="flex items-center gap-1 cursor-pointer bg-accent text-accent-foreground">
                  <AlertTriangle className="w-3 h-3" />
                  {lowStockCount} Stok Menipis
                </Badge>
              </Link>
            )}

            {(!isExpired || ['license_admin','superadmin'].includes(user?.role)) && (
              <Link to="/Kasir">
                <Button>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Buka Kasir
                </Button>
              </Link>
            )}
            
            <div className="relative">
              <button
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <span className="text-primary dark:text-primary font-semibold text-sm">
                    {user?.full_name?.[0]?.toUpperCase() || 'U'}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-40 rounded-md border bg-white dark:bg-slate-900 shadow-md z-50">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout(true);
                    }}
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)]">
          {children}
          {debugMode && (
            <div className="fixed bottom-4 right-4 z-50 bg-white/90 dark:bg-slate-900/90 border rounded p-3 text-xs space-y-1 shadow">
              <div>Page: {currentPageName}</div>
              <div>User: {user?.username || '-'}</div>
              <div>Role: {user?.role || '-'}</div>
              <div>Branch: {activeBranchId}</div>
              <div>LowStock: {lowStockCount}</div>
              <button
                className="mt-1 px-2 py-1 border rounded"
                onClick={() => {
                  try {
                    if (typeof window !== 'undefined') {
                      window.localStorage.removeItem('auth_token');
                      window.location.reload();
                    }
                  } catch {}
                }}
              >
                Logout
              </button>
            </div>
          )}
        </main>
      </div>

      

      {mobileMode && currentPageName !== 'Kasir' && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 dark:bg-slate-900/90 border-t z-50">
          <div className="grid grid-cols-5 h-full">
            {[
              { page: 'Dashboard', label: 'Home', icon: LayoutDashboard },
              { page: 'Kasir', label: 'Kasir', icon: ShoppingCart },
              { page: 'Produk', label: 'Produk', icon: Package },
              { page: 'RiwayatPenjualan', label: 'Riwayat', icon: History },
              { page: 'Pengaturan', label: 'Atur', icon: Settings },
            ].map((item) => {
              const active = currentPageName === item.page;
              const Icon = item.icon;
              const isPermitted = (!isExpired || ['license_admin','superadmin'].includes(user?.role)) || ['Dashboard', 'Pengaturan'].includes(item.page);
              return (
                <button
                  key={item.page}
                  onClick={() => {
                    if (isPermitted) {
                      navigate(`/${item.page}`);
                    } else {
                      toast.warning('Menu terkunci karena masa aktif habis');
                    }
                  }}
                  className={cn(
                    "flex flex-col items-center justify-center text-xs",
                    active ? "text-primary" : isPermitted ? "text-slate-500" : "text-slate-400 cursor-not-allowed"
                  )}
                  disabled={!isPermitted}
                >
                  <Icon className="w-5 h-5 mb-0.5" />
                  <span className="flex items-center">
                    {item.label}
                    {!isPermitted && <Lock className="w-3 h-3 ml-1 opacity-60" />}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
