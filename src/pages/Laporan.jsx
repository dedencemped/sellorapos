import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, ShoppingCart, Package, DollarSign, FileDown, Printer } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, subDays } from "date-fns";
import { id } from "date-fns/locale";
import ProfitLossReport from "@/components/reports/ProfitLossReport";
import CashFlowReport from "@/components/reports/CashFlowReport";
import CustomerAnalysisReport from "@/components/reports/CustomerAnalysisReport";
import ProductAnalysisReport from "@/components/reports/ProductAnalysisReport";
import { renderReportPdf } from "@/utils/pdfReport";
import * as AuthContext from "@/lib/AuthContext.jsx";
import { getSettings } from "@/lib/settings";
import * as XLSX from 'xlsx';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Laporan() {
  const [period, setPeriod] = useState('month');
  const today = new Date();
  const [customRange, setCustomRange] = useState({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const reportRef = useRef(null);
  const [showPurchaseDetail, setShowPurchaseDetail] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const { appPublicSettings } = AuthContext.useAuth?.() || {};
  const methodLabel = (m) => {
    const v = String(m || '').trim().toLowerCase();
    if (v === 'cash') return 'Tunai';
    if (v === 'transfer') return 'Transfer';
    if (v === 'tempo') return 'Tempo';
    return v || '-';
  };
  const periodLabel = (p, sd, ed) => {
    if (p === 'day') return 'Hari Ini';
    if (p === 'week') return '7 Hari Terakhir';
    if (p === 'month') return 'Bulan Ini';
    if (p === 'custom') {
      if (sd && ed) {
        return `${format(sd, 'dd MMM yyyy', { locale: id })} - ${format(ed, 'dd MMM yyyy', { locale: id })}`;
      }
      return 'Kustom';
    }
    return 'Tahun Ini';
  };

  const { data: sales = [], refetch: refetchSales } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-sale_date'),
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.list('-purchase_date'),
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: mutations = [] } = useQuery({
    queryKey: ['mutations'],
    queryFn: () => base44.entities.StockMutation.list('-created_date'),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments'],
    queryFn: () => base44.entities.Payment.list('-payment_date'),
  });

  // Date ranges
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
  } else if (period === 'custom') {
    const from = customRange?.from || today;
    const to = customRange?.to || customRange?.from || today;
    startDate = startOfDay(from);
    endDate = endOfDay(to);
  } else {
    startDate = subMonths(today, 12);
    endDate = today;
  }
  const periodText = periodLabel(period, startDate, endDate);

  // Filter data by period
  const filteredSales = sales.filter(s => {
    const date = new Date(s.sale_date || s.created_date);
    return date >= startDate && date <= endDate;
  });
  // Exclude returned sales from reports
  const nonReturnedSales = filteredSales.filter(s => String(s.status || '').trim().toLowerCase() !== 'returned');
  const displayInvoice = (s) => s?.invoice_number || s?.id || '-';
  const parseReturNominal = (sale) => {
    const raw = String(sale?.notes || '');
    const match =
      raw.match(/retur\s*nominal\s*[:=]\s*(\d+)/i) ||
      raw.match(/retur_nominal\s*[:=]\s*(\d+)/i) ||
      raw.match(/ReturNominal\s*=\s*(\d+)/i);
    return match ? Math.max(0, Number(match[1] || 0) || 0) : null;
  };
  const hasReturNote = (sale) => {
    const raw = String(sale?.notes || '');
    if (!raw) return false;
    const lowered = raw.toLowerCase();
    return lowered.includes('retur:') || lowered.includes('retur penjualan') || lowered.includes('return');
  };
  const isReturnSale = (s) => String(s?.status || '').trim().toLowerCase() === 'returned' || hasReturNote(s) || parseReturNominal(s) != null;
  const returnedSales = filteredSales.filter(isReturnSale);
  const getReturnNominal = (sale) => {
    const parsed = parseReturNominal(sale);
    if (parsed != null) return parsed;
    return 0;
  };

  const filteredPurchases = purchases.filter(p => {
    const date = new Date(p.purchase_date || p.created_date);
    return date >= startDate && date <= endDate;
  });
  const sumItemsPurchase = (purchase) => {
    const items = Array.isArray(purchase?.items) ? purchase.items : (typeof purchase?.items === 'string' ? JSON.parse(purchase.items) : []);
    return items.reduce((acc, it) => {
      const sub = Number(it?.subtotal || 0);
      if (sub > 0) return acc + sub;
      const qty = Number(it?.qty || 0);
      const price = Number(it?.price || 0);
      return acc + (qty * price);
    }, 0);
  };
  const parsePurchaseItems = (purchase) => {
    const rawItems = purchase?.items;
    const items = Array.isArray(rawItems)
      ? rawItems
      : (typeof rawItems === 'string'
          ? (() => { try { return JSON.parse(rawItems) } catch { return [] } })()
          : (rawItems ? [rawItems] : []));
    return items.map((it) => {
      const qty = Number(it?.qty || 0) || 0;
      const price = Number(it?.price || 0) || 0;
      const subtotal = Number(it?.subtotal || 0) || (qty * price);
      return {
        product_name: it?.product_name || it?.name || '-',
        qty,
        unit: String(it?.unit || '').trim() || 'PCS',
        price,
        subtotal
      };
    });
  };
  const getPurchaseTotal = (purchase) => Number(purchase?.total ?? 0) || sumItemsPurchase(purchase) || 0;
  const handlePrintPurchase = (purchase) => {
    try {
      const settings = getSettings();
      const items = parsePurchaseItems(purchase);
      const rowsHtml = items.map((it, idx) => `
        <tr>
          <td style="padding:6px;border:1px solid #e5e7eb;">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;">${it.product_name || ''}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:center;">${it.qty} ${String(it.unit || '').toUpperCase()}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">Rp ${Number(it.price || 0).toLocaleString('id-ID')}</td>
          <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">Rp ${Number(it.subtotal || 0).toLocaleString('id-ID')}</td>
        </tr>
      `).join('');

      const totalNum = getPurchaseTotal(purchase);
      const paidNum = Number(purchase?.paid_amount || 0) || 0;
      const debtNum = Number(purchase?.debt_amount || Math.max(0, totalNum - paidNum)) || 0;
      const method = methodLabel(purchase?.payment_method);
      const inv = purchase?.invoice_number || purchase?.id || '-';
      const d = purchase?.purchase_date ? new Date(purchase.purchase_date) : (purchase?.created_date ? new Date(purchase.created_date) : new Date());
      const dateStr = isNaN(d.getTime()) ? '-' : format(d, 'dd MMM yyyy', { locale: id });

      const html = `
        <html>
          <head>
            <title>Faktur Pembelian ${inv}</title>
            <meta charset="utf-8" />
            <style>
              @page { size: A4; margin: 16mm; }
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial; color: #0f172a; }
              .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; gap: 24px; }
              .store { font-size: 20px; font-weight: 700; color: #0ea5e9; }
              .muted { color: #64748b; font-size: 12px; }
              .right { text-align: right; }
              table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; }
              th { text-align: left; background: #f8fafc; font-weight: 600; padding: 8px; border: 1px solid #e5e7eb; }
              td { padding: 6px; }
              .footer { margin-top: 20px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; }
            </style>
          </head>
          <body>
            <div class="head">
              <div>
                <div class="store">${settings.store_name || 'TOKO ANDA'}</div>
                ${settings.store_address ? `<div class="muted">${settings.store_address}</div>` : ``}
                ${settings.store_phone ? `<div class="muted">Telp: ${settings.store_phone}</div>` : ``}
              </div>
              <div class="right">
                <div><strong>Supplier:</strong> ${purchase?.supplier_name || '-'}</div>
                <div><strong>No:</strong> ${inv}</div>
                <div><strong>Tanggal:</strong> ${dateStr}</div>
                <div><strong>Metode:</strong> ${method}</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:40px;">No</th>
                  <th>Produk</th>
                  <th style="width:120px;text-align:center;">Qty</th>
                  <th style="width:150px;text-align:right;">Harga</th>
                  <th style="width:170px;text-align:right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr>
                  <td colspan="4" style="padding:8px;border:1px solid #e5e7eb;text-align:right;">TOTAL</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Rp ${totalNum.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td colspan="4" style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Dibayar</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Rp ${paidNum.toLocaleString('id-ID')}</td>
                </tr>
                ${debtNum > 0 ? `
                <tr>
                  <td colspan="4" style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Sisa Bayar</td>
                  <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;">Rp ${debtNum.toLocaleString('id-ID')}</td>
                </tr>` : ``}
              </tbody>
            </table>
            <div class="footer">
              <div>Terima kasih</div>
              <div>${settings.invoice_footer || 'Dokumen ini dicetak otomatis'}</div>
            </div>
          </body>
        </html>
      `;
      const w = window.open('', '', 'width=1024,height=768');
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
      w.close();
    } catch {}
  };
  const nonReturnedNonZeroPurchases = filteredPurchases.filter(p => {
    const statusOk = String(p?.status || '').trim().toLowerCase() !== 'returned';
    const nominal = Number(p?.total ?? 0) || sumItemsPurchase(p) || 0;
    return statusOk && nominal > 0;
  });
  const purchasesForReport = nonReturnedNonZeroPurchases;

  // Calculate totals (exclude returned)
  const totalSales = nonReturnedSales.reduce((sum, s) => sum + (s.total || 0), 0);
  
  // Total actual purchases (not COGS) for finance tab
  const totalPurchases = nonReturnedNonZeroPurchases.reduce((sum, p) => {
    const nominal = Number(p?.total ?? 0) || sumItemsPurchase(p) || 0;
    return sum + nominal;
  }, 0);

  // Gross Profit calculation using FIFO (total_cost field from sales table)
  const totalCOGS = nonReturnedSales.reduce((sum, s) => {
    // ALWAYS use total_cost if present, even if it was updated by script
    const currentCost = Number(s.total_cost || 0);
    if (currentCost > 0) return sum + currentCost;
    
    // Fallback for legacy data
    const saleItems = Array.isArray(s.items) ? s.items : (typeof s.items === 'string' ? JSON.parse(s.items) : []);
    const itemCost = saleItems.reduce((acc, it) => {
      const prod = products.find(p => String(p.id) === String(it.product_id));
      const per = Number(prod?.pcs_per_dus || 1) || 1;
      const buyPrice = Number(prod?.buy_price_pcs || 0) || (Number(prod?.buy_price_dus || 0) / per);
      const unit = String(it.unit || '').toUpperCase();
      const qty = unit === 'DUS' ? Number(it.qty || 0) * per : Number(it.qty || 0);
      return acc + (buyPrice * qty);
    }, 0);
    return sum + itemCost;
  }, 0);

  const grossProfit = totalSales - totalCOGS;
  const totalReceivable = customers.reduce((sum, c) => sum + (c.total_debt || 0), 0);
  const totalPayable = suppliers.reduce((sum, s) => sum + (s.total_debt || 0), 0);

  // Product sales analysis
  const productSales = {};
  nonReturnedSales.forEach(sale => {
    const saleItems = Array.isArray(sale.items) ? sale.items : (typeof sale.items === 'string' ? JSON.parse(sale.items) : []);
    saleItems.forEach(item => {
      const pid = item.product_id;
      const prod = products.find(p => String(p.id) === String(pid));
      const defaultUnitRaw = String(prod?.default_unit || '').trim();
      const per = Number(prod?.pcs_per_dus || 1);
      const packLabel = defaultUnitRaw ? defaultUnitRaw.toUpperCase() : (per > 1 ? 'DUS' : 'PCS');
      if (!productSales[pid]) {
        productSales[pid] = { name: item.product_name, qtyPcs: 0, qtyPack: 0, unit: packLabel, revenue: 0 };
      }
      const unitRaw = String(item.unit || '').toUpperCase();
      if (unitRaw && unitRaw !== 'PCS') {
        productSales[pid].qtyPack += Number(item.qty || 0);
        // If item unit provides a better label than default, prefer it
        if (unitRaw !== 'DUS' || packLabel === 'PCS') {
          productSales[pid].unit = unitRaw;
        }
      } else {
        productSales[pid].qtyPcs += Number(item.qty || 0);
      }
      productSales[pid].revenue += Number(item.subtotal || 0);
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Payment method breakdown
  const paymentBreakdown = nonReturnedSales.reduce((acc, sale) => {
    const method = sale.payment_method || 'cash';
    acc[method] = (acc[method] || 0) + (sale.total || 0);
    return acc;
  }, {});
  const paymentChartData = Object.entries(paymentBreakdown).map(([name, value]) => ({ name, value }));

  const handleCleanupPurchaseReturns = async () => {
    try {
      if (!window.confirm('Hapus semua riwayat retur pembelian? Stok dan utang akan disesuaikan.')) return;
      const allPurchases = await base44.entities.Purchase.list();
      const returned = (allPurchases || []).filter(p => String(p?.status || '').trim().toLowerCase() === 'returned');
      // Index products and suppliers for quick lookup
      const prodIndex = {};
      (products || []).forEach(pr => { prodIndex[String(pr.id)] = pr; });
      const supIndex = {};
      (suppliers || []).forEach(s => { supIndex[String(s.id)] = s; });
      for (const p of returned) {
        const retItems = Array.isArray(p?.items) ? p.items : [];
        for (const it of retItems) {
          const pr = prodIndex[String(it?.product_id)] || products.find(x => String(x.id) === String(it?.product_id));
          if (!pr) continue;
          const unit = String(it?.unit || '').trim().toUpperCase();
          const perDus = Number(it?.pcs_per_dus || pr?.pcs_per_dus || 1) || 1;
          const qtyPcs = unit && unit !== 'PCS' && perDus > 1 ? Number(it?.qty || it?.return_qty || 0) * perDus : Number(it?.qty || it?.return_qty || 0);
          const newStock = Number(pr?.stock_pcs || 0) + qtyPcs;
          await base44.entities.Product.update(pr.id, { stock_pcs: newStock });
        }
        try {
          const muts = await base44.entities.StockMutation.list();
          const toDelete = (muts || []).filter(m => String(m?.reference_type) === 'return_purchase' && String(m?.reference_id) === String(p.id));
          for (const m of toDelete) {
            if (m?.id != null) {
              await base44.entities.StockMutation.delete(m.id);
            }
          }
        } catch {}
        const originalItems = Array.isArray(p?.original_items) ? p.original_items : [];
        const restoredSubtotal = originalItems.length > 0
          ? originalItems.reduce((acc, it) => acc + (Number(it?.subtotal || 0) || (Number(it?.qty || 0) * Number(it?.price || 0))), 0)
          : Number(p?.original_total ?? 0);
        const restoredTotal = Math.max(0, Number(restoredSubtotal || 0));
        let paidAmount = 0;
        let debtAmount = 0;
        const payMethod = String(p?.payment_method || '').trim().toLowerCase();
        if (payMethod === 'tempo') {
          paidAmount = 0;
          debtAmount = restoredTotal;
        } else {
          paidAmount = restoredTotal;
          debtAmount = 0;
        }
        await base44.entities.Purchase.update(p.id, {
          status: 'completed',
          items: originalItems.length > 0 ? originalItems : (Array.isArray(p?.items) ? p.items : []),
          subtotal: restoredTotal,
          total: restoredTotal,
          paid_amount: paidAmount,
          debt_amount: debtAmount,
          notes: 'Riwayat retur dihapus'
        });
      }
      // Recompute suppliers total_debt
      try {
        const latestPurchases = await base44.entities.Purchase.list();
        const debtMap = {};
        (latestPurchases || []).forEach(pc => {
          if (String(pc?.payment_method || '').trim().toLowerCase() === 'tempo') {
            const sid = String(pc?.supplier_id || '');
            debtMap[sid] = (debtMap[sid] || 0) + Number(pc?.debt_amount || 0);
          }
        });
        for (const sid of Object.keys(debtMap)) {
          const s = supIndex[sid] || suppliers.find(x => String(x.id) === sid);
          if (s) {
            await base44.entities.Supplier.update(s.id, { total_debt: debtMap[sid] });
          }
        }
      } catch {}
      window.alert('Riwayat retur pembelian berhasil dihapus dan data dipulihkan.');
      window.location.reload();
    } catch (e) {
      console.error(e);
      window.alert('Gagal menghapus riwayat retur pembelian. Lihat konsol untuk detail.');
    }
  };

  // Daily sales chart
  const dailyAgg = {};
  nonReturnedSales.forEach(sale => {
    const d = startOfDay(new Date(sale.sale_date || sale.created_date));
    const key = format(d, 'yyyy-MM-dd');
    dailyAgg[key] = (dailyAgg[key] || 0) + (sale.total || 0);
  });
  const dailyChartData = Object.entries(dailyAgg)
    .map(([key, total]) => ({ dateKey: key, date: format(new Date(key), 'dd MMM', { locale: id }), total }))
    .sort((a, b) => new Date(a.dateKey) - new Date(b.dateKey));

  // Low stock products (unit-aware based on each product's default unit)
  const getStockInDefaultUnit = (p) => {
    const unit = String(p?.default_unit || '').trim().toUpperCase() || 'PCS';
    const stock = Number(p?.stock_pcs || 0) || 0;
    const perDus = Number(p?.pcs_per_dus || 1) || 1;
    if (unit !== 'PCS' && perDus > 1) return Math.floor(stock / perDus);
    return stock;
  };
  const getMinInDefaultUnit = (p) => {
    const unit = String(p?.default_unit || '').trim().toUpperCase() || 'PCS';
    const minPcs = Number(p?.min_stock_pcs || 0) || 0;
    const perDus = Number(p?.pcs_per_dus || 1) || 1;
    if (unit !== 'PCS' && perDus > 1) return Math.ceil(minPcs / perDus);
    return minPcs;
  };
  const getPriceParts = (p) => {
    const unitRaw = String(p?.default_unit || '').trim();
    const unit = unitRaw.toUpperCase();
    const per = Number(p?.pcs_per_dus || 1) || 1;
    const packLabel = unitRaw ? unit : (per > 1 ? 'DUS' : 'PCS');
    const buyPcs = Number(p?.buy_price_pcs || 0) || 0;
    const sellPcs = Number(p?.sell_price_pcs || 0) || 0;
    const buyPack = Number(p?.buy_price_dus || 0) || (per > 1 ? buyPcs * per : buyPcs);
    const sellPack = Number(p?.sell_price_dus || 0) || (per > 1 ? sellPcs * per : sellPcs);
    const showPack = packLabel !== 'PCS' && per > 1;
    return {
      packLabel,
      showPack,
      buy: { pcs: buyPcs, pack: buyPack },
      sell: { pcs: sellPcs, pack: sellPack }
    };
  };
  const formatPriceText = (p, kind, multiline = false) => {
    const parts = getPriceParts(p);
    const pcsLine = `PCS: Rp ${Number(parts[kind].pcs || 0).toLocaleString('id-ID')}`;
    if (!parts.showPack) return pcsLine;
    const packLine = `${parts.packLabel}: Rp ${Number(parts[kind].pack || 0).toLocaleString('id-ID')}`;
    return multiline ? `${packLine}\n${pcsLine}` : `${packLine} | ${pcsLine}`;
  };
  const lowStockProducts = products.filter(p => getStockInDefaultUnit(p) <= getMinInDefaultUnit(p));

  // Export CSV dihapus sesuai permintaan

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Laporan</h1>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Hari Ini</SelectItem>
              <SelectItem value="week">7 Hari Terakhir</SelectItem>
              <SelectItem value="month">Bulan Ini</SelectItem>
              <SelectItem value="custom">Kustom</SelectItem>
              <SelectItem value="year">Tahun Ini</SelectItem>
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start w-[260px]">
                  {customRange?.from && customRange?.to
                    ? `${format(customRange.from, 'dd MMM yyyy', { locale: id })} - ${format(customRange.to, 'dd MMM yyyy', { locale: id })}`
                    : 'Pilih rentang tanggal'}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={customRange}
                  onSelect={(range) => setCustomRange(range || { from: today, to: today })}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <div ref={reportRef} className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Penjualan</p>
                <p className="text-xl font-bold">Rp {totalSales.toLocaleString('id-ID')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Package className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">HPP (Modal Terjual)</p>
                <p className="text-xl font-bold">Rp {totalCOGS.toLocaleString('id-ID')}</p>
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
                <p className="text-sm text-slate-500">Laba Kotor</p>
                <p className={`text-xl font-bold ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Rp {grossProfit.toLocaleString('id-ID')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Piutang - Utang</p>
                <p className="text-xl font-bold">Rp {(totalReceivable - totalPayable).toLocaleString('id-ID')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        </div>

      <Tabs defaultValue="sales">
        <TabsList className="h-10 overflow-x-auto whitespace-nowrap flex-nowrap gap-1">
          <TabsTrigger value="sales" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Penjualan</TabsTrigger>
          <TabsTrigger value="returns" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Retur</TabsTrigger>
          <TabsTrigger value="products" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Produk</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Stok</TabsTrigger>
          <TabsTrigger value="purchases" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Pembelian</TabsTrigger>
          <TabsTrigger value="finance" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Keuangan</TabsTrigger>
          <TabsTrigger value="profitloss" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Laba Rugi</TabsTrigger>
          <TabsTrigger value="cashflow" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Arus Kas</TabsTrigger>
          <TabsTrigger value="customer-analysis" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Analisis Pelanggan</TabsTrigger>
          <TabsTrigger value="product-analysis" className="text-xs sm:text-sm md:text-sm px-2 py-1 font-medium border-b-2 border-transparent transition-colors duration-200 whitespace-nowrap data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Analisis Produk</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Grafik Penjualan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {dailyChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                        <Tooltip formatter={(value) => `Rp ${Number(value).toLocaleString('id-ID')}`} />
                        <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                      Tidak ada data penjualan pada periode ini
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Metode Pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {paymentChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={paymentChartData.map(d => ({ ...d, name: methodLabel(d.name) }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                          {paymentChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `Rp ${Number(value).toLocaleString('id-ID')}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                      Tidak ada data metode pembayaran pada periode ini
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Daftar Transaksi Penjualan</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const settings = getSettings();
                  const pdf = renderReportPdf({
                    title: 'LAPORAN PENJUALAN',
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
                      headers: ['No. Faktur', 'Tanggal', 'Pelanggan', 'Metode', 'Total'],
                      rows: nonReturnedSales.map(s => [
                        displayInvoice(s),
                        format(new Date(s.sale_date || s.created_date), 'dd MMM yyyy HH:mm', { locale: id }),
                        s.customer_name || '-',
                        methodLabel(s.payment_method),
                        `Rp ${s.total?.toLocaleString('id-ID')}`
                      ])
                    },
                    summary: {
                      items: [
                        { label: 'Jumlah Transaksi', value: nonReturnedSales.length },
                        { label: 'Total Penjualan', value: `Rp ${totalSales.toLocaleString('id-ID')}` }
                      ]
                    }
                  })
                  pdf.save(`laporan-penjualan-${period}.pdf`)
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
                    <TableHead>No. Faktur</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Metode</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonReturnedSales.slice(0, 20).map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono">{displayInvoice(sale)}</TableCell>
                      <TableCell>{format(new Date(sale.sale_date || sale.created_date), 'dd MMM yyyy HH:mm', { locale: id })}</TableCell>
                      <TableCell>{sale.customer_name || '-'}</TableCell>
                      <TableCell className="font-semibold">Rp {sale.total?.toLocaleString('id-ID')}</TableCell>
                      <TableCell>{methodLabel(sale.payment_method)}</TableCell>
                    </TableRow>
                  ))}
                  {nonReturnedSales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-400">Belum ada transaksi penjualan pada periode ini</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="returns" className="space-y-4">
          <Tabs defaultValue="sales-returns">
            <TabsList className="h-12">
              <TabsTrigger value="sales-returns" className="text-base md:text-lg px-4 py-2 font-semibold border-b-4 border-transparent transition-colors duration-200 data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary">Retur Penjualan</TabsTrigger>
            </TabsList>
            <TabsContent value="sales-returns" className="space-y-4">
              <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Laporan Retur Penjualan</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const settings = getSettings();
                    const totalRetur = returnedSales.reduce((sum, s) => sum + getReturnNominal(s), 0);
                    const pdf = renderReportPdf({
                      title: 'LAPORAN RETUR PENJUALAN',
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
                        headers: ['No. Faktur', 'Tanggal', 'Pelanggan', 'Metode', 'Nominal Retur', 'Keterangan'],
                        rows: returnedSales.map(s => [
                          displayInvoice(s),
                          format(new Date(s.sale_date || s.created_date), 'dd MMM yyyy HH:mm', { locale: id }),
                          s.customer_name || '-',
                          methodLabel(s.payment_method),
                          `Rp ${getReturnNominal(s).toLocaleString('id-ID')}`,
                          String(s.notes || '')
                        ])
                      },
                      summary: {
                        items: [
                          { label: 'Jumlah Retur', value: returnedSales.length },
                          { label: 'Total Nominal Retur', value: `Rp ${totalRetur.toLocaleString('id-ID')}` }
                        ]
                      }
                    })
                    pdf.save(`laporan-retur-${period}.pdf`)
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
                    <TableHead>No. Faktur</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Nominal Retur</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returnedSales.slice(0, 20).map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-mono">{displayInvoice(sale)}</TableCell>
                      <TableCell>{format(new Date(sale.sale_date || sale.created_date), 'dd MMM yyyy HH:mm', { locale: id })}</TableCell>
                      <TableCell>{sale.customer_name || '-'}</TableCell>
                      <TableCell className="font-semibold">Rp {getReturnNominal(sale).toLocaleString('id-ID')}</TableCell>
                      <TableCell>{methodLabel(sale.payment_method)}</TableCell>
                      <TableCell className="max-w-[240px] truncate" title={String(sale.notes || '')}>{String(sale.notes || '') || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {returnedSales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-400">Belum ada retur penjualan pada periode ini</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
            </TabsContent>
            
          </Tabs>
        </TabsContent>

        

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Produk Terlaris</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProducts} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${v/1000}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={150} />
                    <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                    <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>Qty Terjual</TableHead>
                    <TableHead>Total Pendapatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((product, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>
                        {(() => {
                          const unit = String(product.unit || 'PCS').toUpperCase();
                          const pack = Number(product.qtyPack || 0);
                          const pcs = Number(product.qtyPcs || 0);
                          if (unit !== 'PCS' && pack > 0) {
                            return `${pack} ${unit}${pcs > 0 ? ` + ${pcs} PCS` : ''}`;
                          }
                          return `${pcs} PCS`;
                        })()}
                      </TableCell>
                      <TableCell className="font-semibold">Rp {product.revenue.toLocaleString('id-ID')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Stok Produk</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const headers = ['Barcode', 'Produk', 'Kategori', 'Stok', 'Qty (PCS)', 'Harga Beli', 'Harga Jual'];
                      const rows = products.map(p => {
                        const unit = String(p.default_unit || '').trim().toUpperCase() || 'PCS';
                        const stock = Number(p.stock_pcs || 0) || 0;
                        const per = Number(p.pcs_per_dus || 1) || 1;
                        const stokLabel = unit !== 'PCS' && per > 1
                          ? `${Math.floor(stock / per)} ${unit}${stock % per > 0 ? ` + ${stock % per} PCS` : ''}`
                          : `${stock} ${unit}`;
                        return [
                          p.barcode || '-',
                          p.name,
                          p.category || '-',
                          stokLabel,
                          stock,
                          formatPriceText(p, 'buy', true),
                          formatPriceText(p, 'sell', true)
                        ];
                      });
                      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Stok Produk');
                      XLSX.writeFile(wb, `laporan-stok-produk-${period}.xlsx`);
                    }}
                  >
                    Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const settings = getSettings();
                      const totalQty = products.reduce((sum, p) => sum + (Number(p?.stock_pcs || 0) || 0), 0);
                      const rows = products.map(p => {
                        const unit = String(p.default_unit || '').trim().toUpperCase() || 'PCS';
                        const stock = Number(p.stock_pcs || 0) || 0;
                        const per = Number(p.pcs_per_dus || 1) || 1;
                        const stokLabel = unit !== 'PCS' && per > 1
                          ? `${Math.floor(stock / per)} ${unit}${stock % per > 0 ? ` + ${stock % per} PCS` : ''}`
                          : `${stock} ${unit}`;
                        return [
                          p.barcode || '-',
                          p.name,
                          p.category || '-',
                          stokLabel,
                          String(stock),
                          formatPriceText(p, 'buy', true),
                          formatPriceText(p, 'sell', true)
                        ];
                      });
                      const pdf = renderReportPdf({
                        title: 'LAPORAN STOK PRODUK',
                        company: {
                          name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                          address: settings.store_address || appPublicSettings?.company_address || ''
                        },
                        logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                        periodLabel: periodText,
                        table: {
                          headers: ['Barcode', 'Produk', 'Kategori', 'Stok', 'Qty', 'Harga Beli', 'Harga Jual'],
                          rows
                        },
                        summary: {
                          items: [
                            { label: 'Jumlah Produk', value: rows.length },
                            { label: 'Jumlah Qty (PCS)', value: totalQty.toLocaleString('id-ID') }
                          ]
                        }
                      });
                      pdf.save(`laporan-stok-produk-${period}.pdf`);
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
                      <TableHead>Produk</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Min</TableHead>
                      <TableHead>Harga Beli</TableHead>
                      <TableHead>Harga Jual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.slice(0, 15).map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell className={(() => {
                          const stockU = getStockInDefaultUnit(product);
                          const minU = getMinInDefaultUnit(product);
                          return stockU <= minU ? 'text-red-600 font-semibold' : '';
                        })()}>
                          {(() => {
                            const unit = String(product.default_unit || '').trim().toUpperCase() || 'PCS';
                            const stock = product.stock_pcs || 0;
                            const ppd = product.pcs_per_dus || 1;
                            if (unit !== 'PCS' && ppd > 1) {
                              const dus = Math.floor(stock / ppd);
                              const pcs = stock % ppd;
                              return `${dus} ${unit}${pcs > 0 ? ` + ${pcs} PCS` : ''}`;
                            }
                            return `${stock} ${unit}`;
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const unit = String(product.default_unit || '').trim().toUpperCase() || 'PCS';
                            const min = Number(product.min_stock_pcs || 0) || 0;
                            const ppd = Number(product.pcs_per_dus || 1) || 1;
                            if (unit !== 'PCS' && ppd > 1) {
                              const dus = Math.floor(min / ppd);
                              const pcs = min % ppd;
                              return `${dus} ${unit}${pcs > 0 ? ` + ${pcs} PCS` : ''}`;
                            }
                            return `${min} ${unit}`;
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs whitespace-pre-line">{formatPriceText(product, 'buy', true)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs whitespace-pre-line">{formatPriceText(product, 'sell', true)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {products.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-400">Data produk belum tersedia</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-red-600">Stok Menipis ({lowStockProducts.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const headers = ['Barcode', 'Produk', 'Kategori', 'Stok', 'Qty (PCS)', 'Harga Beli', 'Harga Jual'];
                      const rows = lowStockProducts.map(p => {
                        const unit = String(p.default_unit || '').trim().toUpperCase() || 'PCS';
                        const stock = Number(p.stock_pcs || 0) || 0;
                        const per = Number(p.pcs_per_dus || 1) || 1;
                        const stokLabel = unit !== 'PCS' && per > 1
                          ? `${Math.floor(stock / per)} ${unit}${stock % per > 0 ? ` + ${stock % per} PCS` : ''}`
                          : `${stock} ${unit}`;
                        return [
                          p.barcode || '-',
                          p.name,
                          p.category || '-',
                          stokLabel,
                          stock,
                          formatPriceText(p, 'buy', true),
                          formatPriceText(p, 'sell', true)
                        ];
                      });
                      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Stok Menipis');
                      XLSX.writeFile(wb, `laporan-stok-menipis-${period}.xlsx`);
                    }}
                  >
                    Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const settings = getSettings();
                      const totalQty = lowStockProducts.reduce((sum, p) => sum + (Number(p?.stock_pcs || 0) || 0), 0);
                      const rows = lowStockProducts.map(p => {
                        const unit = String(p.default_unit || '').trim().toUpperCase() || 'PCS';
                        const stock = Number(p.stock_pcs || 0) || 0;
                        const per = Number(p.pcs_per_dus || 1) || 1;
                        const stokLabel = unit !== 'PCS' && per > 1
                          ? `${Math.floor(stock / per)} ${unit}${stock % per > 0 ? ` + ${stock % per} PCS` : ''}`
                          : `${stock} ${unit}`;
                        return [
                          p.barcode || '-',
                          p.name,
                          p.category || '-',
                          stokLabel,
                          String(stock),
                          formatPriceText(p, 'buy', true),
                          formatPriceText(p, 'sell', true)
                        ];
                      });
                      const pdf = renderReportPdf({
                        title: 'LAPORAN STOK MENIPIS',
                        company: {
                          name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                          address: settings.store_address || appPublicSettings?.company_address || ''
                        },
                        logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                        periodLabel: periodText,
                        table: {
                          headers: ['Barcode', 'Produk', 'Kategori', 'Stok', 'Qty', 'Harga Beli', 'Harga Jual'],
                          rows
                        },
                        summary: {
                          items: [
                            { label: 'Jumlah Produk Menipis', value: rows.length },
                            { label: 'Jumlah Qty (PCS)', value: totalQty.toLocaleString('id-ID') }
                          ]
                        }
                      });
                      pdf.save(`laporan-stok-menipis-${period}.pdf`);
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
                      <TableHead>Produk</TableHead>
                      <TableHead>Stok</TableHead>
                      <TableHead>Harga Beli</TableHead>
                      <TableHead>Harga Jual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStockProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>{product.name}</TableCell>
                        <TableCell className="text-red-600 font-semibold">
                          {(() => {
                            const unit = String(product.default_unit || '').trim().toUpperCase() || 'PCS';
                            const stock = product.stock_pcs || 0;
                            const ppd = product.pcs_per_dus || 1;
                            if (unit !== 'PCS' && ppd > 1) {
                              const dus = Math.floor(stock / ppd);
                              const pcs = stock % ppd;
                              return `${dus} ${unit}${pcs > 0 ? ` + ${pcs} PCS` : ''}`;
                            }
                            return `${stock} ${unit}`;
                          })()}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs whitespace-pre-line">{formatPriceText(product, 'buy', true)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs whitespace-pre-line">{formatPriceText(product, 'sell', true)}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {lowStockProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-slate-400">Tidak ada produk dengan stok menipis</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Daftar Pembelian</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const settings = getSettings();
                    const totalPembelian = purchasesForReport.reduce((sum, p) => {
                      const nominal = Number(p?.total ?? 0) || sumItemsPurchase(p) || 0;
                      return sum + nominal;
                    }, 0);
                    const pdf = renderReportPdf({
                      title: 'LAPORAN PEMBELIAN',
                      company: {
                        name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                        address: settings.store_address || appPublicSettings?.company_address || ''
                      },
                      logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                      periodLabel: periodText,
                      table: {
                        headers: ['No. Faktur', 'Tanggal', 'Supplier', 'Metode', 'Total'],
                        rows: purchasesForReport.map(p => [
                          p.invoice_number,
                          format(new Date(p.purchase_date || p.created_date), 'dd MMM yyyy', { locale: id }),
                          p.supplier_name || '-',
                          methodLabel(p.payment_method),
                          `Rp ${(Number(p?.total ?? 0) || sumItemsPurchase(p) || 0).toLocaleString('id-ID')}`
                        ])
                      },
                      summary: {
                        items: [
                          { label: 'Jumlah Transaksi', value: purchasesForReport.length },
                          { label: 'Total Pembelian', value: `Rp ${totalPembelian.toLocaleString('id-ID')}` }
                        ]
                      }
                    })
                    pdf.save(`laporan-pembelian-${period}.pdf`)
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
                    <TableHead>No. Faktur</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Metode</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchasesForReport.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-mono">{purchase.invoice_number}</TableCell>
                      <TableCell>{format(new Date(purchase.purchase_date || purchase.created_date), 'dd MMM yyyy', { locale: id })}</TableCell>
                      <TableCell>{purchase.supplier_name || '-'}</TableCell>
                      <TableCell className="font-semibold">Rp {getPurchaseTotal(purchase).toLocaleString('id-ID')}</TableCell>
                      <TableCell>{methodLabel(purchase.payment_method)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPurchase(purchase);
                            setShowPurchaseDetail(true);
                          }}
                        >
                          Rincian
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={showPurchaseDetail} onOpenChange={setShowPurchaseDetail}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Rincian Pembelian</DialogTitle>
              </DialogHeader>
              {selectedPurchase && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => handlePrintPurchase(selectedPurchase)}>
                      <Printer className="w-4 h-4 mr-2" />
                      Cetak
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-slate-500">No. Faktur</div>
                      <div className="font-mono font-semibold">{selectedPurchase.invoice_number || '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Tanggal</div>
                      <div className="font-medium">
                        {format(new Date(selectedPurchase.purchase_date || selectedPurchase.created_date), 'dd MMM yyyy', { locale: id })}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Supplier</div>
                      <div className="font-medium">{selectedPurchase.supplier_name || '-'}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Metode</div>
                      <div className="font-medium">{methodLabel(selectedPurchase.payment_method)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Total</div>
                      <div className="font-semibold">Rp {getPurchaseTotal(selectedPurchase).toLocaleString('id-ID')}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Keterangan</div>
                      <div className="font-medium">{selectedPurchase.notes || '-'}</div>
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Daftar Item</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Produk</TableHead>
                            <TableHead className="text-center w-28">Qty</TableHead>
                            <TableHead className="text-right w-40">Harga</TableHead>
                            <TableHead className="text-right w-44">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsePurchaseItems(selectedPurchase).map((it, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-slate-500">{idx + 1}</TableCell>
                              <TableCell className="font-medium">{it.product_name}</TableCell>
                              <TableCell className="text-center">{it.qty} {it.unit}</TableCell>
                              <TableCell className="text-right">Rp {Number(it.price || 0).toLocaleString('id-ID')}</TableCell>
                              <TableCell className="text-right font-semibold">Rp {Number(it.subtotal || 0).toLocaleString('id-ID')}</TableCell>
                            </TableRow>
                          ))}
                          {parsePurchaseItems(selectedPurchase).length === 0 && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-slate-400">Item tidak tersedia</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </DialogContent>
          </Dialog>
          
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <p className="text-sm text-blue-600">Omzet Penjualan</p>
                <p className="text-2xl font-bold text-blue-900">Rp {totalSales.toLocaleString('id-ID')}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <p className="text-sm text-red-600">Total Pembelian</p>
                <p className="text-2xl font-bold text-red-900">Rp {totalPurchases.toLocaleString('id-ID')}</p>
              </CardContent>
            </Card>
            <Card className={grossProfit >= 0 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}>
              <CardContent className="p-4">
                <p className={`text-sm ${grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>Laba Kotor</p>
                <p className={`text-2xl font-bold ${grossProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                  Rp {grossProfit.toLocaleString('id-ID')}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-slate-500">Total Piutang</p>
                <p className="text-xl font-bold text-green-600">Rp {totalReceivable.toLocaleString('id-ID')}</p>
                <p className="text-xs text-slate-400">{customers.filter(c => c.total_debt > 0).length} pelanggan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-slate-500">Total Utang</p>
                <p className="text-xl font-bold text-red-600">Rp {totalPayable.toLocaleString('id-ID')}</p>
                <p className="text-xs text-slate-400">{suppliers.filter(s => s.total_debt > 0).length} supplier</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profitloss">
          <ProfitLossReport sales={nonReturnedSales} purchases={purchases} products={products} payments={payments} period={period} />
        </TabsContent>

        <TabsContent value="cashflow">
          <CashFlowReport sales={sales} purchases={purchases} payments={payments} period={period} />
        </TabsContent>

        <TabsContent value="customer-analysis">
          <CustomerAnalysisReport sales={sales} customers={customers} />
        </TabsContent>

        <TabsContent value="product-analysis">
          <ProductAnalysisReport sales={nonReturnedSales} purchases={purchases} products={products} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
