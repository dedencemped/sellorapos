import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Minus, FileDown } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, getMonth, getYear } from "date-fns";
import { renderReportPdf } from "@/utils/pdfReport";
import { exportElementToPdf } from "@/utils/pdf";
import * as AuthContext from "@/lib/AuthContext.jsx";
import { getSettings } from "@/lib/settings";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export default function ProfitLossReport({ sales, purchases, payments, period, products = [] }) {
  const today = new Date();
  const currentYear = getYear(today);
  const { appPublicSettings } = AuthContext.useAuth?.() || {};
  const chartRef = React.useRef(null);
  const periodText = (() => {
    if (period === 'day') return 'Hari Ini';
    if (period === 'week') return '7 Hari Terakhir';
    if (period === 'month') return 'Bulan Ini';
    return '12 Bulan Terakhir';
  })();

  // Calculate monthly data for trend chart
  const monthlyData = [];
  for (let i = 11; i >= 0; i--) {
    const monthDate = subMonths(today, i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);

    const monthSales = sales.filter(s => {
      const date = new Date(s.sale_date || s.created_date);
      return date >= monthStart && date <= monthEnd;
    });
    
    // Hitung: penjualan kotor (subtotal), diskon, dan penjualan bersih (net sales)
    const grossSales = monthSales.reduce((sum, s) => sum + Number(s.subtotal || 0), 0);
    const discounts = monthSales.reduce((sum, s) => sum + Number(s.discount_amount || 0), 0);
    // Gunakan penjualan bersih: subtotal - diskon (atau total - pajak) untuk menghindari double count
    const revenue = monthSales.reduce((sum, s) => {
      const sub = Number(s.subtotal || 0);
      const disc = Number(s.discount_amount || 0);
      const tax = Number(s.tax_amount || 0);
      // Prioritaskan subtotal - diskon; fallback ke total - pajak
      const netSales = sub > 0 ? (sub - disc) : (Number(s.total || 0) - tax);
      return sum + netSales;
    }, 0);
    // HPP berbasis barang terjual: Gunakan total_cost dari database (FIFO)
    // Jika total_cost 0 (data lama), gunakan fallback kalkulasi harga beli saat ini
    const cogs = monthSales.reduce((sumSale, s) => {
      const currentCost = Number(s.total_cost || 0);
      if (currentCost > 0) return sumSale + currentCost;

      const saleItems = Array.isArray(s.items) ? s.items : (typeof s.items === 'string' ? JSON.parse(s.items) : []);
      const itemsCost = saleItems.reduce((acc, it) => {
        const prod = (products || []).find(p => String(p.id) === String(it.product_id));
        const perDus = Number(prod?.pcs_per_dus || 1) || 1;
        const buyPricePcs = Number(prod?.buy_price_pcs || 0);
        const buyPriceDus = Number(prod?.buy_price_dus || 0);
        const buyPrice = buyPricePcs > 0 ? buyPricePcs : (perDus > 0 ? buyPriceDus / perDus : 0);
        const unit = String(it.unit || '').trim().toUpperCase();
        const qtyPcs = unit === 'DUS' ? Number(it.qty || 0) * perDus : Number(it.qty || 0);
        return acc + (buyPrice * qtyPcs);
      }, 0);
      return sumSale + itemsCost;
    }, 0);
    const grossProfit = revenue - cogs;
    // Karena revenue sudah net (setelah diskon), laba bersih sama dengan laba kotor pada implementasi tanpa biaya operasional lain
    const netProfit = grossProfit;

    monthlyData.push({
      month: MONTHS[getMonth(monthDate)],
      year: getYear(monthDate),
      pendapatan: revenue,
      hpp: cogs,
      labaKotor: grossProfit,
      labaBersih: netProfit,
      grossSales,
      discounts
    });
  }

  // Calculate period totals
  const totalRevenue = monthlyData.reduce((sum, m) => sum + m.pendapatan, 0);
  const totalCOGS = monthlyData.reduce((sum, m) => sum + m.hpp, 0);
  const totalGrossProfit = monthlyData.reduce((sum, m) => sum + m.labaKotor, 0);
  const totalGrossSales = monthlyData.reduce((sum, m) => sum + (m.grossSales || 0), 0);
  // Akumulasi diskon mengikuti periode perhitungan (menggunakan monthlyData agar konsisten periode)
  const totalDiscounts = monthlyData.reduce((sum, m) => sum + Number(m.discounts || 0), 0);
  const totalTax = 0; // Pajak penjualan tidak dihitung sebagai beban karena revenue sudah net of tax
  const totalNetProfit = totalGrossProfit; // Tidak mengurangi lagi dengan diskon/pajak karena revenue sudah net

  // Calculate gross margin percentage
  const grossMargin = totalRevenue > 0 ? ((totalGrossProfit / totalRevenue) * 100).toFixed(1) : 0;
  const netMargin = totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : 0;

  // Compare with previous period
  const currentPeriodData = monthlyData.slice(-6);
  const previousPeriodData = monthlyData.slice(0, 6);
  const currentProfit = currentPeriodData.reduce((sum, m) => sum + m.labaBersih, 0);
  const previousProfit = previousPeriodData.reduce((sum, m) => sum + m.labaBersih, 0);
  const profitGrowth = previousProfit > 0 ? (((currentProfit - previousProfit) / previousProfit) * 100).toFixed(1) : 0;

  // Export CSV dihapus sesuai permintaan

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm text-blue-600">Total Pendapatan</p>
            <p className="text-2xl font-bold text-blue-900">Rp {totalRevenue.toLocaleString('id-ID')}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <p className="text-sm text-orange-600">HPP (Harga Pokok Penjualan)</p>
            <p className="text-2xl font-bold text-orange-900">Rp {totalCOGS.toLocaleString('id-ID')}</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <p className="text-sm text-green-600">Laba Kotor</p>
            <p className="text-2xl font-bold text-green-900">Rp {totalGrossProfit.toLocaleString('id-ID')}</p>
            <p className="text-xs text-green-600">Margin: {grossMargin}%</p>
          </CardContent>
        </Card>
        <Card className={totalNetProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className={`text-sm ${totalNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Laba Bersih</p>
                <p className={`text-2xl font-bold ${totalNetProfit >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                  Rp {totalNetProfit.toLocaleString('id-ID')}
                </p>
                <p className={`text-xs ${totalNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Margin: {netMargin}%</p>
              </div>
              {profitGrowth > 0 ? (
                <TrendingUp className="w-5 h-5 text-green-500" />
              ) : profitGrowth < 0 ? (
                <TrendingDown className="w-5 h-5 text-red-500" />
              ) : (
                <Minus className="w-5 h-5 text-slate-400" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tren Laba Rugi (12 Bulan Terakhir)</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportElementToPdf(chartRef.current, { title: 'Tren Laba Rugi (12 Bulan Terakhir)', filename: 'tren-laba-rugi.pdf' })}
            >
              <FileDown className="w-4 h-4 mr-2" />Export PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div ref={chartRef} className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v/1000000}jt`} />
                <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                <Legend />
                <Line type="monotone" dataKey="pendapatan" name="Pendapatan" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="hpp" name="HPP" stroke="#f97316" strokeWidth={2} />
                <Line type="monotone" dataKey="labaBersih" name="Laba Bersih" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Profit Loss Statement Table */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Laporan Laba Rugi</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Periode: {periodText}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'LAPORAN LABA RUGI',
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
                  periodLabel: periodText,
                  table: {
                    headers: ['Keterangan', 'Jumlah (Rp)'],
                    rows: [
                      ['Penjualan Kotor', `Rp ${Number(totalGrossSales || 0).toLocaleString('id-ID')}`],
                      ['Diskon', `- Rp ${Number(totalDiscounts || 0).toLocaleString('id-ID')}`],
                      ['Pendapatan Bersih', `Rp ${Number(totalRevenue || 0).toLocaleString('id-ID')}`],
                      ['Pembelian Barang', `Rp ${Number(totalCOGS || 0).toLocaleString('id-ID')}`],
                      ['Total HPP', `Rp ${Number(totalCOGS || 0).toLocaleString('id-ID')}`],
                      ['LABA KOTOR', `Rp ${Number(totalGrossProfit || 0).toLocaleString('id-ID')}`],
                      ['Pajak Penjualan (informasi)', `Rp ${Number(0).toLocaleString('id-ID')}`],
                      ['LABA BERSIH', `Rp ${Number(totalNetProfit || 0).toLocaleString('id-ID')}`],
                    ]
                  },
                  summary: {
                    items: [
                      { label: 'Pendapatan Bersih', value: `Rp ${Number(totalRevenue || 0).toLocaleString('id-ID')}` },
                      { label: 'Laba Bersih', value: `Rp ${Number(totalNetProfit || 0).toLocaleString('id-ID')}` },
                      { label: 'Margin Bersih', value: `${netMargin}%` },
                    ]
                  }
                });
                pdf.save('laporan-laba-rugi.pdf');
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
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Jumlah (Rp)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={2}>PENDAPATAN</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-8">Penjualan Kotor</TableCell>
                <TableCell className="text-right">Rp {Number(totalGrossSales || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-8 text-red-600">Diskon</TableCell>
                <TableCell className="text-right text-red-600">- Rp {Number(totalDiscounts || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>
              <TableRow className="border-t font-semibold">
                <TableCell>Pendapatan Bersih</TableCell>
                <TableCell className="text-right">Rp {Number(totalRevenue || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>

              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={2}>HARGA POKOK PENJUALAN</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-8">Pembelian Barang</TableCell>
                <TableCell className="text-right">Rp {Number(totalCOGS || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>
              <TableRow className="border-t font-semibold">
                <TableCell>Total HPP</TableCell>
                <TableCell className="text-right">Rp {Number(totalCOGS || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>

              <TableRow className="bg-green-50 font-bold text-lg">
                <TableCell>LABA KOTOR</TableCell>
                <TableCell className="text-right text-green-600">Rp {Number(totalGrossProfit || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>

              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={2}>BIAYA OPERASIONAL</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="pl-8">Pajak Penjualan (informasi)</TableCell>
                <TableCell className="text-right">Rp {Number(totalTax || 0).toLocaleString('id-ID')}</TableCell>
              </TableRow>

              <TableRow className={`font-bold text-lg ${totalNetProfit >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <TableCell>LABA BERSIH</TableCell>
                <TableCell className={`text-right ${totalNetProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Rp {Number(totalNetProfit || 0).toLocaleString('id-ID')}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Monthly Breakdown */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Rincian Bulanan</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'RINCIAN LABA RUGI BULANAN',
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
                  periodLabel: periodText,
                  table: {
                    headers: ['Bulan', 'Pendapatan', 'HPP', 'Laba Kotor', 'Margin %'],
                    rows: monthlyData.slice(-6).map(m => ([
                      `${m.month} ${m.year}`,
                      `Rp ${m.pendapatan.toLocaleString('id-ID')}`,
                      `Rp ${m.hpp.toLocaleString('id-ID')}`,
                      `Rp ${m.labaKotor.toLocaleString('id-ID')}`,
                      m.pendapatan > 0 ? ((m.labaKotor / m.pendapatan) * 100).toFixed(1) + '%' : '0%'
                    ]))
                  },
                  summary: {
                    items: [
                      { label: 'Total Pendapatan', value: `Rp ${totalRevenue.toLocaleString('id-ID')}` },
                      { label: 'Total HPP', value: `Rp ${totalCOGS.toLocaleString('id-ID')}` },
                      { label: 'Total Laba Kotor', value: `Rp ${totalGrossProfit.toLocaleString('id-ID')}` },
                    ]
                  }
                });
                pdf.save('rincian-laba-rugi-bulanan.pdf');
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
                <TableHead>Bulan</TableHead>
                <TableHead className="text-right">Pendapatan</TableHead>
                <TableHead className="text-right">HPP</TableHead>
                <TableHead className="text-right">Laba Kotor</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyData.slice(-6).reverse().map((m, idx) => (
                <TableRow key={idx}>
                  <TableCell>{m.month} {m.year}</TableCell>
                  <TableCell className="text-right">Rp {m.pendapatan.toLocaleString('id-ID')}</TableCell>
                  <TableCell className="text-right">Rp {m.hpp.toLocaleString('id-ID')}</TableCell>
                  <TableCell className={`text-right font-semibold ${m.labaKotor >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Rp {m.labaKotor.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.pendapatan > 0 ? ((m.labaKotor / m.pendapatan) * 100).toFixed(1) : 0}%
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
