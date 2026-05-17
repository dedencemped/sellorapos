import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, Crown, TrendingUp, Star, FileDown } from "lucide-react";
import { subMonths } from "date-fns";
import { renderReportPdf } from "@/utils/pdfReport";
import * as AuthContext from "@/lib/AuthContext.jsx";
import { getSettings } from "@/lib/settings";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function CustomerAnalysisReport({ sales, customers }) {
  const { appPublicSettings } = AuthContext.useAuth?.() || {};
  // Customer analysis
  const customerStats = {};
  
  sales.forEach(sale => {
    const customerId = sale.customer_id || 'umum';
    const customerName = sale.customer_name || 'Pelanggan Umum';
    
    if (!customerStats[customerId]) {
      customerStats[customerId] = {
        id: customerId,
        name: customerName,
        totalTransactions: 0,
        totalSpending: 0,
        totalItems: 0,
        firstPurchase: null,
        lastPurchase: null,
        paymentMethods: {},
        products: {}
      };
    }
    
    customerStats[customerId].totalTransactions += 1;
    customerStats[customerId].totalSpending += sale.total || 0;
    customerStats[customerId].totalItems += (sale.items?.length || 0);
    
    const saleDate = new Date(sale.sale_date || sale.created_date);
    if (!customerStats[customerId].firstPurchase || saleDate < customerStats[customerId].firstPurchase) {
      customerStats[customerId].firstPurchase = saleDate;
    }
    if (!customerStats[customerId].lastPurchase || saleDate > customerStats[customerId].lastPurchase) {
      customerStats[customerId].lastPurchase = saleDate;
    }
    
    const method = sale.payment_method || 'cash';
    customerStats[customerId].paymentMethods[method] = (customerStats[customerId].paymentMethods[method] || 0) + 1;
    
    const saleItems = Array.isArray(sale.items) ? sale.items : (typeof sale.items === 'string' ? JSON.parse(sale.items) : []);
    saleItems.forEach(item => {
      customerStats[customerId].products[item.product_name] = (customerStats[customerId].products[item.product_name] || 0) + item.qty;
    });
  });

  // Convert to array and calculate averages
  const customerList = Object.values(customerStats).map(c => ({
    ...c,
    avgTransaction: c.totalTransactions > 0 ? c.totalSpending / c.totalTransactions : 0,
    favoritePayment: Object.entries(c.paymentMethods).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
    favoriteProduct: Object.entries(c.products).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'
  }));

  // Sort by different metrics
  const topBySpending = [...customerList].sort((a, b) => b.totalSpending - a.totalSpending).slice(0, 10);
  const topByTransactions = [...customerList].sort((a, b) => b.totalTransactions - a.totalTransactions).slice(0, 10);
  const topByAvgTransaction = [...customerList].sort((a, b) => b.avgTransaction - a.avgTransaction).slice(0, 10);

  // Calculate overall stats
  const totalCustomers = customerList.filter(c => c.id !== 'umum').length;
  const totalTransactions = customerList.reduce((sum, c) => sum + c.totalTransactions, 0);
  const totalRevenue = customerList.reduce((sum, c) => sum + c.totalSpending, 0);
  const avgSpendingPerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
  const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Payment method distribution
  const paymentDistribution = {};
  sales.forEach(s => {
    const method = s.payment_method || 'cash';
    paymentDistribution[method] = (paymentDistribution[method] || 0) + 1;
  });
  const paymentChartData = Object.entries(paymentDistribution).map(([name, value]) => ({
    name: name === 'cash' ? 'Tunai' : name === 'transfer' ? 'Transfer' : name === 'qris' ? 'QRIS' : 'Tempo',
    value
  }));

  // Recent vs returning customers (last 3 months)
  const threeMonthsAgo = subMonths(new Date(), 3);
  const recentCustomers = customerList.filter(c => c.lastPurchase && c.lastPurchase >= threeMonthsAgo);
  const returningCustomers = customerList.filter(c => c.totalTransactions > 1);

  // Export CSV dihapus sesuai permintaan

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Pelanggan</p>
                <p className="text-xl font-bold">{totalCustomers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Rata-rata Belanja</p>
                <p className="text-xl font-bold">Rp {avgSpendingPerCustomer.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Star className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Pelanggan Loyal</p>
                <p className="text-xl font-bold">{returningCustomers.length}</p>
                <p className="text-xs text-slate-400">&gt;1 transaksi</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Crown className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Rata-rata Transaksi</p>
                <p className="text-xl font-bold">Rp {avgTransactionValue.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Customers Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Pelanggan (Total Belanja)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topBySpending} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${v/1000000}jt`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                  <Bar dataKey="totalSpending" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Preferensi Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {paymentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Rankings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-500" /> Pelanggan Terbaik
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'ANALISIS PELANGGAN - PERINGKAT',
                  company: {
                  name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                  address: settings.store_address || appPublicSettings?.company_address || '',
                  phone: settings.store_phone || '',
                  email: settings.store_email || '',
                  fax: settings.store_fax || '',
                  npwp: settings.store_npwp || '',
                  business_license: settings.store_business_license || ''
                  },
                  logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                  periodLabel: 'Semua Data',
                  table: {
                    headers: ['#', 'Pelanggan', 'Transaksi', 'Total Belanja', 'Rata-rata', 'Metode Favorit', 'Produk Favorit'],
                    rows: topBySpending.map((c, idx) => ([
                      String(idx + 1),
                      c.name,
                      `${c.totalTransactions}x`,
                      `Rp ${c.totalSpending.toLocaleString('id-ID')}`,
                      `Rp ${c.avgTransaction.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`,
                      c.favoritePayment,
                      c.favoriteProduct
                    ]))
                  },
                  summary: {
                    items: [
                      { label: 'Total Pelanggan', value: String(totalCustomers) },
                      { label: 'Total Transaksi', value: String(totalTransactions) },
                      { label: 'Total Pendapatan', value: `Rp ${totalRevenue.toLocaleString('id-ID')}` },
                    ]
                  }
                });
                pdf.save('analisis-pelanggan-peringkat.pdf');
              }}
            >
              <FileDown className="w-4 h-4 mr-2" />Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Pelanggan</TableHead>
                <TableHead className="text-center">Transaksi</TableHead>
                <TableHead className="text-right">Total Belanja</TableHead>
                <TableHead className="text-right">Rata-rata</TableHead>
                <TableHead>Metode Favorit</TableHead>
                <TableHead>Produk Favorit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topBySpending.map((customer, idx) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    {idx < 3 ? (
                      <Badge className={idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-400'}>
                        {idx + 1}
                      </Badge>
                    ) : (
                      <span className="text-slate-500">{idx + 1}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{customer.totalTransactions}x</Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-green-600">
                    Rp {customer.totalSpending.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right">
                    Rp {customer.avgTransaction.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                  </TableCell>
                  <TableCell className="capitalize">{customer.favoritePayment}</TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-32 truncate">{customer.favoriteProduct}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Customer with Debt */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-orange-600">Pelanggan dengan Piutang</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const settings = getSettings();
              const debtCustomers = customers.filter(c => c.total_debt > 0);
              const pdf = renderReportPdf({
                title: 'PELANGGAN DENGAN PIUTANG',
                company: {
                  name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                  address: settings.store_address || appPublicSettings?.company_address || ''
                },
                logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                periodLabel: 'Semua Data',
                table: {
                  headers: ['Pelanggan', 'Kontak', 'Total Piutang', 'Total Belanja'],
                  rows: debtCustomers.map((customer) => {
                    const stats = customerStats[customer.id] || {};
                    return [
                      customer.name,
                      customer.phone || '-',
                      `Rp ${customer.total_debt?.toLocaleString('id-ID')}`,
                      `Rp ${(stats.totalSpending || 0).toLocaleString('id-ID')}`,
                    ];
                  })
                },
                summary: {
                  items: [
                    { label: 'Jumlah Pelanggan Berpiutang', value: String(debtCustomers.length) },
                    { label: 'Total Piutang', value: `Rp ${debtCustomers.reduce((s, c) => s + (c.total_debt || 0), 0).toLocaleString('id-ID')}` },
                  ]
                }
              });
              pdf.save('pelanggan-berpiutang.pdf');
            }}
          >
            <FileDown className="w-4 h-4 mr-2" />Export PDF
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pelanggan</TableHead>
                <TableHead>Kontak</TableHead>
                <TableHead className="text-right">Total Piutang</TableHead>
                <TableHead className="text-right">Total Belanja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.filter(c => c.total_debt > 0).map(customer => {
                const stats = customerStats[customer.id] || {};
                return (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.phone || '-'}</TableCell>
                    <TableCell className="text-right font-semibold text-orange-600">
                      Rp {customer.total_debt?.toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right">
                      Rp {(stats.totalSpending || 0).toLocaleString('id-ID')}
                    </TableCell>
                  </TableRow>
                );
              })}
              {customers.filter(c => c.total_debt > 0).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-slate-500">
                    Tidak ada pelanggan dengan piutang
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
