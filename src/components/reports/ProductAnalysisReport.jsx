import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Package, TrendingUp, Percent, DollarSign, AlertTriangle, FileDown } from "lucide-react";
import { renderReportPdf } from "@/utils/pdfReport";
import * as AuthContext from "@/lib/AuthContext.jsx";
import { getSettings } from "@/lib/settings";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function ProductAnalysisReport({ sales, purchases, products }) {
  const { appPublicSettings } = AuthContext.useAuth?.() || {};
  // Product analysis from sales
  const productStats = {};
  
  products.forEach(product => {
    const per = Number(product.pcs_per_dus || 1);
    const rawUnit = String(product.default_unit || '').trim();
    const unitLabel = rawUnit ? rawUnit.toUpperCase() : (per > 1 ? 'DUS' : 'PCS');
    const stockPcs = Number(product.stock_pcs || 0) || 0;
    const minPcs = Number(product.min_stock_pcs || 0) || 0;
    const stockDefault = (unitLabel !== 'PCS' && per > 1) ? Math.floor(stockPcs / per) : stockPcs;
    const minDefault = (unitLabel !== 'PCS' && per > 1) ? Math.ceil(minPcs / per) : minPcs;
    // Pilih harga sesuai satuan produk; fallback hitung dari PCS jika harga pack kosong
    const buyPriceUnit = unitLabel === 'PCS'
      ? Number(product.buy_price_pcs || 0)
      : Number(product.buy_price_dus || (product.buy_price_pcs || 0) * per || 0);
    const sellPriceUnit = unitLabel === 'PCS'
      ? Number(product.sell_price_pcs || 0)
      : Number(product.sell_price_dus || (product.sell_price_pcs || 0) * per || 0);
    productStats[product.id] = {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category: product.category,
      brand: product.brand,
      priceUnit: unitLabel,
      defaultUnit: rawUnit ? rawUnit.toUpperCase() : ((per > 1) ? 'DUS' : 'PCS'),
      pcsPerDus: per,
      buyPrice: buyPriceUnit,
      sellPrice: sellPriceUnit,
      stock: stockDefault,
      minStock: minDefault,
      stockPcsOriginal: stockPcs,
      unit: String(product.default_unit || '').trim()
        ? String(product.default_unit).trim().toUpperCase()
        : ((product.pcs_per_dus || 1) > 1 ? 'DUS' : 'PCS'),
      qtyPcs: 0,
      qtyPack: 0,
      qtySold: 0,
      revenue: 0,
      costOfGoodsSold: 0
    };
  });

  sales.forEach(sale => {
    const saleItems = Array.isArray(sale.items) ? sale.items : (typeof sale.items === 'string' ? JSON.parse(sale.items) : []);
    saleItems.forEach(item => {
      if (productStats[item.product_id]) {
        const product = (products || []).find(p => p.id === item.product_id);
        const buyPricePcs = Number(product?.buy_price_pcs || 0);
        const buyPriceDus = Number(product?.buy_price_dus || 0);
        const unitRaw = String(item.unit || '').toUpperCase();
        const per = Number(product?.pcs_per_dus || 1);
        const isPack = unitRaw && unitRaw !== 'PCS';
        const qty = Number(item.qty || 0);
        const qtyInPcs = isPack ? qty * per : qty;
        
        productStats[item.product_id].qtySold += qtyInPcs;
        if (isPack) {
          productStats[item.product_id].qtyPack += qty;
          // Prefer explicit unit from item if available
          if (unitRaw) productStats[item.product_id].unit = unitRaw;
        } else {
          productStats[item.product_id].qtyPcs += qty;
        }
        const lineSubtotal = Number(item.subtotal || (Number(item.qty || 0) * Number(item.price || 0)) || 0);
        productStats[item.product_id].revenue += lineSubtotal;
        // HPP: Gunakan cost_price dari item jika ada (FIFO), jika tidak fallback ke harga beli master
        if (Number(item.cost_price) > 0) {
          productStats[item.product_id].costOfGoodsSold += Number(item.cost_price) * qtyInPcs;
        } else {
          if (isPack) {
            const packCost = buyPriceDus > 0 ? buyPriceDus : (buyPricePcs * per);
            productStats[item.product_id].costOfGoodsSold += packCost * qty;
          } else {
            productStats[item.product_id].costOfGoodsSold += buyPricePcs * qty;
          }
        }
      }
    });
  });

  // Calculate profit and margin for each product
  const productList = Object.values(productStats).map(p => {
    const grossProfit = p.revenue - p.costOfGoodsSold;
    const margin = p.revenue > 0 ? (grossProfit / p.revenue) * 100 : 0;
    const markup = p.buyPrice > 0 ? ((p.sellPrice - p.buyPrice) / p.buyPrice) * 100 : 0;
    return {
      ...p,
      grossProfit,
      margin,
      markup
    };
  });

  // Sort by different metrics
  const topByRevenue = [...productList].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const topByProfit = [...productList].sort((a, b) => b.grossProfit - a.grossProfit).slice(0, 10);
  const topByMargin = [...productList].filter(p => p.revenue > 0).sort((a, b) => b.margin - a.margin).slice(0, 10);
  const topByQuantity = [...productList].sort((a, b) => b.qtySold - a.qtySold).slice(0, 10);
  const lowStock = productList.filter(p => p.stock <= p.minStock && p.minStock > 0);
  const deadStock = productList.filter(p => p.qtySold === 0 && p.stock > 0);

  // Category analysis
  const categoryStats = {};
  productList.forEach(p => {
    const cat = p.category || 'Lainnya';
    if (!categoryStats[cat]) {
      categoryStats[cat] = { name: cat, revenue: 0, profit: 0, qty: 0 };
    }
    categoryStats[cat].revenue += p.revenue;
    categoryStats[cat].profit += p.grossProfit;
    categoryStats[cat].qty += p.qtySold;
  });
  const categoryData = Object.values(categoryStats).sort((a, b) => b.revenue - a.revenue);

  // Overall stats
  const totalRevenue = productList.reduce((sum, p) => sum + p.revenue, 0);
  const totalCOGS = productList.reduce((sum, p) => sum + p.costOfGoodsSold, 0);
  const totalProfit = totalRevenue - totalCOGS;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const totalProductsSold = productList.filter(p => p.qtySold > 0).length;

  // Export CSV dihapus sesuai permintaan

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Produk Terjual</p>
                <p className="text-xl font-bold">{totalProductsSold} / {products.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Total Laba Kotor</p>
                <p className="text-xl font-bold text-green-600">Rp {totalProfit.toLocaleString('id-ID')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Percent className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Rata-rata Margin</p>
                <p className="text-xl font-bold">{avgMargin.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">Stok Menipis</p>
                <p className="text-xl font-bold text-red-600">{lowStock.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products by Revenue */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Top 10 Produk (Pendapatan)</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'TOP 10 PRODUK - PENDAPATAN',
                  company: {
                    name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                    address: settings.store_address || appPublicSettings?.company_address || ''
                  },
                  logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                  periodLabel: 'Semua Data',
                  table: {
                    headers: ['Produk', 'Kategori', 'Qty Terjual', 'Pendapatan'],
                    rows: topByRevenue.map(p => ([
                      p.name,
                      p.category || '-',
                      String(p.qtySold),
                      `Rp ${p.revenue.toLocaleString('id-ID')}`
                    ]))
                  },
                  summary: { items: [] }
                });
                pdf.save('produk-top-pendapatan.pdf');
              }}
            >
              <FileDown className="w-4 h-4 mr-2" />Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topByRevenue} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `${v/1000000}jt`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Distribution */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Pendapatan per Kategori</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'PENDAPATAN PER KATEGORI',
                  company: {
                    name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                    address: settings.store_address || appPublicSettings?.company_address || ''
                  },
                  logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                  periodLabel: 'Semua Data',
                  table: {
                    headers: ['Kategori', 'Pendapatan', 'Qty'],
                    rows: categoryData.map(c => ([
                      c.name,
                      `Rp ${c.revenue.toLocaleString('id-ID')}`,
                      String(c.qty)
                    ]))
                  },
                  summary: { items: [] }
                });
                pdf.save('pendapatan-per-kategori.pdf');
              }}
            >
              <FileDown className="w-4 h-4 mr-2" />Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `Rp ${value.toLocaleString('id-ID')}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Most Profitable Products */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" /> Produk Paling Menguntungkan
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'PRODUK PALING MENGUNTUNGKAN',
                  company: {
                    name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                    address: settings.store_address || appPublicSettings?.company_address || ''
                  },
                  logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                  periodLabel: 'Semua Data',
                  table: {
                    headers: ['#', 'Produk', 'Kategori', 'Qty Terjual', 'Pendapatan', 'HPP', 'Laba Kotor', 'Margin %'],
                    rows: topByProfit.map((p, idx) => ([
                      String(idx + 1),
                      p.name,
                      p.category || '-',
                      String(p.qtySold),
                      `Rp ${p.revenue.toLocaleString('id-ID')}`,
                      `Rp ${p.costOfGoodsSold.toLocaleString('id-ID')}`,
                      `Rp ${p.grossProfit.toLocaleString('id-ID')}`,
                      `${p.margin.toFixed(1)}%`
                    ]))
                  },
                  summary: { items: [] }
                });
                pdf.save('produk-paling-menguntungkan.pdf');
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
                <TableHead>Produk</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-center">Qty Terjual</TableHead>
                <TableHead className="text-right">Pendapatan</TableHead>
                <TableHead className="text-right">HPP</TableHead>
                <TableHead className="text-right">Laba Kotor</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topByProfit.map((product, idx) => (
                <TableRow key={product.id}>
                  <TableCell>
                    {idx < 3 ? (
                      <Badge className={idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-slate-400' : 'bg-orange-400'}>
                        {idx + 1}
                      </Badge>
                    ) : (
                      <span className="text-slate-500">{idx + 1}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{product.category || '-'}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
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
                  <TableCell className="text-right">Rp {product.revenue.toLocaleString('id-ID')}</TableCell>
                  <TableCell className="text-right text-slate-500">Rp {product.costOfGoodsSold.toLocaleString('id-ID')}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">
                    Rp {product.grossProfit.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className={product.margin >= 20 ? 'bg-green-100 text-green-700' : product.margin >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}>
                      {product.margin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Products by Margin */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5 text-purple-500" /> Produk dengan Margin Tertinggi
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const settings = getSettings();
              const pdf = renderReportPdf({
                title: 'PRODUK DENGAN MARGIN TERTINGGI',
                company: {
                  name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                  address: settings.store_address || appPublicSettings?.company_address || ''
                },
                logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                periodLabel: 'Semua Data',
                table: {
                  headers: ['Produk', 'Harga Beli', 'Harga Jual', 'Markup %', 'Margin %'],
                  rows: topByMargin.map(p => ([
                    p.name,
                    `Rp ${Number(p.buyPrice || 0).toLocaleString('id-ID')} / ${String(p.priceUnit || 'PCS').toUpperCase()}`,
                    `Rp ${Number(p.sellPrice || 0).toLocaleString('id-ID')} / ${String(p.priceUnit || 'PCS').toUpperCase()}`,
                    `${p.markup.toFixed(1)}%`,
                    `${p.margin.toFixed(1)}%`
                  ]))
                },
                summary: { items: [] }
              });
              pdf.save('produk-margin-tertinggi.pdf');
            }}
          >
            <FileDown className="w-4 h-4 mr-2" />Export PDF
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
              <TableHead className="text-right">Harga Beli</TableHead>
              <TableHead className="text-right">Harga Jual</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topByMargin.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell className="text-right">
                  Rp {Number(product.buyPrice || 0).toLocaleString('id-ID')}
                  <span className="ml-1 text-xs text-slate-500">/ {String(product.priceUnit || 'PCS').toUpperCase()}</span>
                </TableCell>
                <TableCell className="text-right">
                  Rp {Number(product.sellPrice || 0).toLocaleString('id-ID')}
                  <span className="ml-1 text-xs text-slate-500">/ {String(product.priceUnit || 'PCS').toUpperCase()}</span>
                </TableCell>
                  <TableCell className="text-right text-blue-600">{product.markup.toFixed(1)}%</TableCell>
                  <TableCell className="text-right">
                    <Badge className="bg-green-100 text-green-700">{product.margin.toFixed(1)}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Low Stock */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Stok Menipis
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'PRODUK DENGAN STOK MENIPIS',
                  company: {
                    name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                    address: settings.store_address || appPublicSettings?.company_address || ''
                  },
                  logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                  periodLabel: 'Semua Data',
                  table: {
                    headers: ['Produk', 'Stok', 'Min'],
                    rows: lowStock.map(p => ([
                      p.name,
                      String(p.stock),
                      String((() => {
                        const unit = String(p.defaultUnit || 'PCS').toUpperCase();
                        const per = Number(p.pcsPerDus || 1);
                        const minPcs = Number(p.minStock || 0);
                        if (unit !== 'PCS' && per > 1) return Math.ceil(minPcs / per);
                        return minPcs;
                      })())
                    ]))
                  },
                  summary: { items: [] }
                });
                pdf.save('stok-menipis.pdf');
              }}
            >
              <FileDown className="w-4 h-4 mr-2" />Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right text-red-600 font-semibold">
                      {(() => {
                        const unit = String(product.defaultUnit || 'PCS').toUpperCase();
                        const per = Number(product.pcsPerDus || 1);
                        const stockPcs = Number(product.stockPcsOriginal || 0);
                        if (unit !== 'PCS' && per > 1) {
                          const unitQty = Math.floor(stockPcs / per);
                          const rem = stockPcs % per;
                          return `${unitQty} ${unit}${rem > 0 ? ` + ${rem} PCS` : ''}`;
                        }
                        return `${stockPcs} PCS`;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">
                        {(() => {
                          const unit = String(product.defaultUnit || 'PCS').toUpperCase();
                          const per = Number(product.pcsPerDus || 1);
                          const minPcs = Number(product.minStock || 0);
                          if (unit !== 'PCS' && per > 1) {
                            const minPacks = Math.ceil(minPcs / per);
                            return `${minPacks} ${unit}`;
                          }
                          return `${minPcs} PCS`;
                        })()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {lowStock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-green-600">
                      ✓ Semua stok aman
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Dead Stock */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-orange-600 flex items-center gap-2">
              <Package className="w-5 h-5" /> Produk Tidak Laku (Dead Stock)
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const settings = getSettings();
                const pdf = renderReportPdf({
                  title: 'PRODUK TIDAK LAKU (DEAD STOCK)',
                  company: {
                    name: settings.store_name || appPublicSettings?.app_name || 'Perusahaan Anda',
                    address: settings.store_address || appPublicSettings?.company_address || ''
                  },
                  logoUrl: settings.logo_url || appPublicSettings?.logo_url || null,
                  periodLabel: 'Semua Data',
                  table: {
                    headers: ['Produk', 'Stok', 'Nilai Stok'],
                    rows: deadStock.slice(0, 10).map(p => ([
                      p.name,
                      String(p.stock),
                      `Rp ${(p.stock * p.buyPrice).toLocaleString('id-ID')}`
                    ]))
                  },
                  summary: { items: [] }
                });
                pdf.save('produk-dead-stock.pdf');
              }}
            >
              <FileDown className="w-4 h-4 mr-2" />Export PDF
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="text-right">Nilai Stok</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deadStock.slice(0, 10).map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const unit = String(product.defaultUnit || 'PCS').toUpperCase();
                        const per = Number(product.pcsPerDus || 1);
                        const stockPcs = Number(product.stockPcsOriginal || 0);
                        if (unit !== 'PCS' && per > 1) {
                          const unitQty = Math.floor(stockPcs / per);
                          const rem = stockPcs % per;
                          return `${unitQty} ${unit}${rem > 0 ? ` + ${rem} PCS` : ''}`;
                        }
                        return `${stockPcs} PCS`;
                      })()}
                    </TableCell>
                    <TableCell className="text-right text-orange-600">
                      Rp {(product.stock * product.buyPrice).toLocaleString('id-ID')}
                    </TableCell>
                  </TableRow>
                ))}
                {deadStock.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-4 text-green-600">
                      ✓ Semua produk terjual
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
