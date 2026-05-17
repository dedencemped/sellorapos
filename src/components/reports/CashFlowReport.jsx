import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ArrowUpCircle, ArrowDownCircle, Wallet, FileDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, getMonth, startOfDay, endOfDay, subDays } from "date-fns";
import { id } from "date-fns/locale";
import { exportElementToPdf } from "@/utils/pdf";
import { renderReportPdf } from "@/utils/pdfReport";
import * as AuthContext from "@/lib/AuthContext.jsx";
import { getSettings } from "@/lib/settings";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export default function CashFlowReport({ sales, purchases, payments, period }) {
  const today = new Date();
  const rootRef = React.useRef(null);
  const { appPublicSettings } = AuthContext.useAuth?.() || {};
  const methodLabel = (m) => {
    const v = String(m || '').trim().toLowerCase();
    if (v === 'cash') return 'Tunai';
    if (v === 'transfer') return 'Transfer';
    if (v === 'qris') return 'QRIS';
    if (v === 'tempo') return 'Tempo';
    return v || '-';
  };

  // Determine date range based on period
  let startDate, endDate;
  if (period === 'day') {
    startDate = startOfDay(today);
    endDate = endOfDay(today);
  } else if (period === 'week') {
    startDate = subDays(today, 7);
    endDate = today;
  } else if (period === 'month') {
    startDate = startOfMonth(today);
    endDate = endOfMonth(today);
  } else {
    startDate = subMonths(today, 12);
    endDate = today;
  }

  // Filter data by period
  const filteredSales = sales.filter(s => {
    const date = new Date(s.sale_date || s.created_date);
    return date >= startDate && date <= endDate;
  });

  const filteredPurchases = purchases.filter(p => {
    const date = new Date(p.purchase_date || p.created_date);
    return date >= startDate && date <= endDate;
  });

  const filteredPayments = payments.filter(p => {
    const date = new Date(p.payment_date || p.created_date);
    return date >= startDate && date <= endDate;
  });

  // Calculate cash inflows
  const cashSales = filteredSales
    .filter(s => s.payment_method !== 'tempo')
    .reduce((sum, s) => {
      const paid = Number(s.paid_amount || s.total || 0);
      const change = Number(s.change_amount || 0);
      return sum + Math.max(0, paid - change);
    }, 0);
  
  const receivablePayments = filteredPayments
    .filter(p => p.type === 'receivable_payment')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalInflow = cashSales + receivablePayments;

  // Calculate cash outflows
  const cashPurchases = filteredPurchases
    .filter(p => p.payment_method !== 'tempo')
    .reduce((sum, p) => sum + (p.paid_amount || p.total || 0), 0);
  
  const debtPayments = filteredPayments
    .filter(p => p.type === 'debt_payment')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalOutflow = cashPurchases + debtPayments;

  // Net cash flow
  const netCashFlow = totalInflow - totalOutflow;

  // Monthly cash flow data for chart
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const monthDate = subMonths(today, i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const monthCashSales = sales
      .filter(s => {
        const date = new Date(s.sale_date || s.created_date);
        return date >= monthStart && date <= monthEnd && s.payment_method !== 'tempo';
      })
      .reduce((sum, s) => {
        const paid = Number(s.paid_amount || s.total || 0);
        const change = Number(s.change_amount || 0);
        return sum + Math.max(0, paid - change);
      }, 0);

    const monthReceivables = payments
      .filter(p => {
        const date = new Date(p.payment_date || p.created_date);
        return date >= monthStart && date <= monthEnd && p.type === 'receivable_payment';
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const monthCashPurchases = purchases
      .filter(p => {
        const date = new Date(p.purchase_date || p.created_date);
        return date >= monthStart && date <= monthEnd && p.payment_method !== 'tempo';
      })
      .reduce((sum, p) => sum + (p.paid_amount || p.total || 0), 0);

    const monthDebtPayments = payments
      .filter(p => {
        const date = new Date(p.payment_date || p.created_date);
        return date >= monthStart && date <= monthEnd && p.type === 'debt_payment';
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    const inflow = monthCashSales + monthReceivables;
    const outflow = monthCashPurchases + monthDebtPayments;

    monthlyData.push({
      month: MONTHS[getMonth(monthDate)],
      masuk: inflow,
      keluar: outflow,
      bersih: inflow - outflow
    });
  }

  // Build transaction list
  const transactions = [
    ...filteredSales.filter(s => s.payment_method !== 'tempo').map(s => ({
      date: s.sale_date || s.created_date,
      type: 'inflow',
      category: 'Penjualan',
      description: `${s.invoice_number} - ${s.customer_name || 'Umum'}`,
      amount: Math.max(0, (s.paid_amount || s.total || 0) - (s.change_amount || 0)),
      method: s.payment_method
    })),
    ...filteredPayments.filter(p => p.type === 'receivable_payment').map(p => ({
      date: p.payment_date || p.created_date,
      type: 'inflow',
      category: 'Pembayaran Piutang',
      description: p.party_name,
      amount: p.amount || 0,
      method: p.payment_method
    })),
    ...filteredPurchases.filter(p => p.payment_method !== 'tempo').map(p => ({
      date: p.purchase_date || p.created_date,
      type: 'outflow',
      category: 'Pembelian',
      description: `${p.invoice_number} - ${p.supplier_name || '-'}`,
      amount: p.paid_amount || p.total || 0,
      method: p.payment_method
    })),
    ...filteredPayments.filter(p => p.type === 'debt_payment').map(p => ({
      date: p.payment_date || p.created_date,
      type: 'outflow',
      category: 'Pembayaran Utang',
      description: p.party_name,
      amount: p.amount || 0,
      method: p.payment_method
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Export CSV dihapus sesuai permintaan

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ArrowUpCircle className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-sm text-green-600">Kas Masuk</p>
                <p className="text-2xl font-bold text-green-900">Rp {totalInflow.toLocaleString('id-ID')}</p>
                <p className="text-xs text-green-600">Penjualan + Piutang Terbayar</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ArrowDownCircle className="w-8 h-8 text-red-500" />
              <div>
                <p className="text-sm text-red-600">Kas Keluar</p>
                <p className="text-2xl font-bold text-red-900">Rp {totalOutflow.toLocaleString('id-ID')}</p>
                <p className="text-xs text-red-600">Pembelian + Utang Terbayar</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={netCashFlow >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200"}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Wallet className={`w-8 h-8 ${netCashFlow >= 0 ? 'text-blue-500' : 'text-orange-500'}`} />
              <div>
                <p className={`text-sm ${netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Arus Kas Bersih</p>
                <p className={`text-2xl font-bold ${netCashFlow >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                  Rp {netCashFlow.toLocaleString('id-ID')}
                </p>
                <p className={`text-xs ${netCashFlow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  {netCashFlow >= 0 ? 'Surplus' : 'Defisit'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600 flex items-center gap-2">
              <ArrowUpCircle className="w-5 h-5" /> Rincian Kas Masuk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span>Penjualan Tunai/Transfer/QRIS</span>
                <span className="font-semibold">Rp {cashSales.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span>Pembayaran Piutang</span>
                <span className="font-semibold">Rp {receivablePayments.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5" /> Rincian Kas Keluar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span>Pembelian Tunai/Transfer</span>
                <span className="font-semibold">Rp {cashPurchases.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                <span>Pembayaran Utang</span>
                <span className="font-semibold">Rp {debtPayments.toLocaleString('id-ID')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Chart */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Tren Arus Kas (6 Bulan Terakhir)</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportElementToPdf(rootRef.current, { title: 'Laporan Arus Kas', filename: 'laporan-arus-kas.pdf' })}
          >
            <FileDown className="w-4 h-4 mr-2" />Export PDF
          </Button>
        </CardHeader>
        <CardContent ref={rootRef}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v/1000000}jt`} />
                <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                <Legend />
                <Area type="monotone" dataKey="masuk" name="Kas Masuk" stroke="#10b981" fill="#10b98133" />
                <Area type="monotone" dataKey="keluar" name="Kas Keluar" stroke="#ef4444" fill="#ef444433" />
                <Area type="monotone" dataKey="bersih" name="Arus Bersih" stroke="#3b82f6" fill="#3b82f633" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Transaction List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Riwayat Transaksi Kas</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'LAPORAN RIWAYAT TRANSAKSI KAS',
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
                  periodLabel: (() => {
                    if (period === 'day') return 'Hari Ini';
                    if (period === 'week') return '7 Hari Terakhir';
                    if (period === 'month') return 'Bulan Ini';
                    return '12 Bulan Terakhir';
                  })(),
                  table: {
                    headers: ['Tanggal', 'Kategori', 'Keterangan', 'Metode', 'Jumlah'],
                    rows: transactions.map(t => ([
                      format(new Date(t.date), 'dd MMM yyyy HH:mm', { locale: id }),
                      t.type === 'inflow' ? 'Masuk' : 'Keluar',
                      t.description,
                      methodLabel(t.method),
                      `${t.type === 'inflow' ? '+' : '-'} Rp ${t.amount.toLocaleString('id-ID')}`
                    ]))
                  },
                  summary: {
                    items: [
                      { label: 'Kas Masuk', value: `Rp ${totalInflow.toLocaleString('id-ID')}` },
                      { label: 'Kas Keluar', value: `Rp ${totalOutflow.toLocaleString('id-ID')}` },
                      { label: 'Arus Bersih', value: `Rp ${netCashFlow.toLocaleString('id-ID')}` },
                    ]
                  }
                });
                pdf.save('riwayat-transaksi-kas.pdf');
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
                <TableHead>Tanggal</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead>Metode</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.slice(0, 20).map((t, idx) => (
                <TableRow key={idx}>
                  <TableCell>{format(new Date(t.date), 'dd MMM yyyy HH:mm', { locale: id })}</TableCell>
                  <TableCell>
                    <Badge variant={t.type === 'inflow' ? 'default' : 'destructive'}>
                      {t.category}
                    </Badge>
                  </TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell>{methodLabel(t.method)}</TableCell>
                  <TableCell className={`text-right font-semibold ${t.type === 'inflow' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'inflow' ? '+' : '-'} Rp {t.amount.toLocaleString('id-ID')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
