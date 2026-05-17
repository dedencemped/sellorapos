import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, AlertTriangle, ArrowUpRight, ArrowDownRight, Truck 
} from "lucide-react";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import { id } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from "framer-motion";
import { useNavigate } from 'react-router-dom';
import { renderReportPdf } from '@/utils/pdfReport';
import { getSettings } from '@/lib/settings';

export default function Dashboard() {
  const navigate = useNavigate();
  const searchParams = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const debugMode = searchParams.get('debug') === '1';
  const {
    data: products = [],
    isLoading: productsLoading,
    isError: productsError,
    error: productsErrObj
  } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const {
    data: sales = [],
    isLoading: salesLoading,
    isError: salesError,
    error: salesErrObj
  } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-sale_date'),
  });

  const {
    data: purchases = [],
    isLoading: purchasesLoading,
    isError: purchasesError,
    error: purchasesErrObj
  } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.list('-purchase_date'),
  });

  const {
    data: customers = [],
    isLoading: customersLoading,
    isError: customersError,
    error: customersErrObj
  } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
  });

  const {
    data: suppliers = [],
    isLoading: suppliersLoading,
    isError: suppliersError,
    error: suppliersErrObj
  } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });
  const { data: subStatus } = useQuery({
    queryKey: ['subscription_status'],
    queryFn: () => base44.subscription.status(),
    staleTime: 60_000
  });
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

  const today = new Date();
  const startOfToday = startOfDay(today);
  
  // Today stats
  const todaySales = sales.filter(s => new Date(s.sale_date || s.created_date) >= startOfToday);
  const todayRevenue = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
  const todayTransactions = todaySales.length;

  // Total debts
  const totalReceivable = customers.reduce((sum, c) => sum + (c.total_debt || 0), 0);
  const totalPayable = suppliers.reduce((sum, s) => sum + (s.total_debt || 0), 0);

  // Low stock products
  const lowStockProducts = products.filter(p => (p.stock_pcs || 0) <= (p.min_stock_pcs || 0));

  // Monthly revenue chart data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(today, 6 - i);
    const daySales = sales.filter(s => {
      const saleDate = new Date(s.sale_date || s.created_date);
      return saleDate >= startOfDay(date) && saleDate <= endOfDay(date);
    });
    const dayPurchases = purchases.filter(p => {
      const purchaseDate = new Date(p.purchase_date || p.created_date);
      return purchaseDate >= startOfDay(date) && purchaseDate <= endOfDay(date);
    });
    return {
      date: format(date, 'dd MMM', { locale: id }),
      penjualan: daySales.reduce((sum, s) => sum + (s.total || 0), 0),
      pembelian: dayPurchases.reduce((sum, p) => sum + (p.total || 0), 0)
    };
  });

  // Top selling products
  const productSales = {};
  sales.forEach(sale => {
    sale.items?.forEach(item => {
      if (!productSales[item.product_id]) {
        productSales[item.product_id] = { name: item.product_name, qty: 0, revenue: 0 };
      }
      productSales[item.product_id].qty += item.qty;
      productSales[item.product_id].revenue += item.subtotal;
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // Recent transactions
  const recentSales = sales.slice(0, 5);

  return (
    <div className="p-6 space-y-6 bg-transparent min-h-screen">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-500">{format(today, 'EEEE, dd MMMM yyyy', { locale: id })}</p>
      </div>
      {debugMode && (
        <div className="border rounded p-3 text-xs bg-white/90 dark:bg-slate-900/90">
          <div>Status Fetch:</div>
          <ul className="grid grid-cols-2 gap-1 mt-1">
            <li>products: {productsLoading ? 'loading' : (productsError ? 'error' : 'ok')}</li>
            <li>sales: {salesLoading ? 'loading' : (salesError ? 'error' : 'ok')}</li>
            <li>purchases: {purchasesLoading ? 'loading' : (purchasesError ? 'error' : 'ok')}</li>
            <li>customers: {customersLoading ? 'loading' : (customersError ? 'error' : 'ok')}</li>
            <li>suppliers: {suppliersLoading ? 'loading' : (suppliersError ? 'error' : 'ok')}</li>
          </ul>
          {(productsError || salesError || purchasesError || customersError || suppliersError) && (
            <details className="mt-2">
              <summary>Error detail</summary>
              <pre className="whitespace-pre-wrap break-all">
{String(productsErrObj?.message || '')}
{String(salesErrObj?.message || '')}
{String(purchasesErrObj?.message || '')}
{String(customersErrObj?.message || '')}
{String(suppliersErrObj?.message || '')}
              </pre>
            </details>
          )}
        </div>
      )}

      {typeof subStatus?.days_left === 'number' && subStatus.days_left <= 7 && subStatus.days_left >= 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Masa aktif tinggal {subStatus.days_left} hari, segera melakukan perpanjangan.
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <button
              onClick={() => navigate('/Pengaturan')}
              className="px-3 py-2 text-sm rounded bg-amber-200 text-amber-900 hover:bg-amber-300"
            >
              Perpanjang
            </button>
            <button
              onClick={() => {
                try {
                  const s = getSettings();
                  const planLabel = String(currentSub?.plan || '-').replace('-', ' ')
                  const active = Array.isArray(latestLicenses) ? latestLicenses.find(l => String(l.status).toLowerCase() === 'aktif') : null
                  const chosen = active || (latestLicenses?.[0] || null)
                  const priceRaw = chosen?.price
                  const price = Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : 0
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
                    ]}
                  });
                  pdf.save('invoice-masa-aktif.pdf');
                } catch {}
              }}
              className="px-3 py-2 text-sm rounded bg-amber-200 text-amber-900 hover:bg-amber-300"
            >
              Download Invoice (PDF)
            </button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-primary font-medium">Penjualan Hari Ini</p>
                  <p className="text-2xl font-bold text-primary mt-1">Rp {todayRevenue.toLocaleString('id-ID')}</p>
                  <p className="text-sm text-primary mt-1">{todayTransactions} transaksi</p>
                </div>
                <div className="p-3 bg-primary/30 rounded-xl">
                  <ShoppingCart className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-gradient-to-br from-accent/10 to-accent/20 border border-accent/30">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-accent-foreground/80 font-medium">Total Piutang</p>
                  <p className="text-2xl font-bold text-accent-foreground mt-1">Rp {totalReceivable.toLocaleString('id-ID')}</p>
                  <p className="text-sm text-accent-foreground/80 mt-1">dari pelanggan</p>
                </div>
                <div className="p-3 bg-accent/30 rounded-xl">
                  <ArrowUpRight className="w-6 h-6 text-accent-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-red-600 font-medium">Total Utang</p>
                  <p className="text-2xl font-bold text-red-900 mt-1">Rp {totalPayable.toLocaleString('id-ID')}</p>
                  <p className="text-sm text-red-600 mt-1">ke supplier</p>
                </div>
                <div className="p-3 bg-red-200 rounded-xl">
                  <ArrowDownRight className="w-6 h-6 text-red-700" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card 
            className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/20 border border-emerald-500/30 cursor-pointer hover:scale-[1.02] transition-transform"
            onClick={() => navigate('/SuratJalan')}
          >
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Surat Jalan</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">Cetak</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">Dokumen Pengiriman</p>
                </div>
                <div className="p-3 bg-emerald-500/30 rounded-xl">
                  <Truck className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Grafik Penjualan & Pembelian (7 Hari Terakhir)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last7Days}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v/1000}k`} />
                  <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                  <Area type="monotone" dataKey="penjualan" stroke="hsl(var(--primary))" fill="url(#colorSales)" name="Penjualan" />
                  <Area type="monotone" dataKey="pembelian" stroke="hsl(var(--accent))" fill="url(#colorPurchases)" name="Pembelian" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Produk Terlaris</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.length === 0 ? (
                <p className="text-center text-slate-500 py-4">Belum ada penjualan</p>
              ) : (
                topProducts.map((product, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        ['bg-primary/10 text-primary', 'bg-accent/10 text-accent-foreground', 'bg-purple-100 text-purple-600', 'bg-orange-100 text-orange-600', 'bg-pink-100 text-pink-600'][idx]
                      }`}>
                        {idx + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{product.name}</p>
                        <p className="text-xs text-slate-500">{product.qty} terjual</p>
                      </div>
                    </div>
                    <p className="font-semibold text-sm text-primary">Rp {product.revenue.toLocaleString('id-ID')}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Transaksi Terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentSales.length === 0 ? (
                <p className="text-center text-slate-500 py-4">Belum ada transaksi</p>
              ) : (
                recentSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium">{sale.invoice_number}</p>
                      <p className="text-xs text-slate-500">
                        {format(new Date(sale.sale_date || sale.created_date), 'dd MMM yyyy HH:mm', { locale: id })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-primary">Rp {sale.total?.toLocaleString('id-ID')}</p>
                      <Badge variant="secondary" className="text-xs">
                        {sale.payment_method === 'cash' ? 'Tunai' : sale.payment_method === 'transfer' ? 'Transfer' : sale.payment_method === 'qris' ? 'QRIS' : 'Tempo'}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Stok Menipis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockProducts.length === 0 ? (
                <p className="text-center text-green-600 py-4">✓ Semua stok aman</p>
              ) : (
                lowStockProducts.slice(0, 5).map((product) => (
                  <div key={product.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.barcode}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{product.stock_pcs} PCS</p>
                      <p className="text-xs text-slate-500">Min: {product.min_stock_pcs} PCS</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
