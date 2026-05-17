import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye, Undo2, Printer, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import ReceiptModal from "@/components/pos/ReceiptModal";

export default function RiwayatPenjualan() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [returnNotes, setReturnNotes] = useState('');
  const [returnItems, setReturnItems] = useState([]);
  const [editingSale, setEditingSale] = useState(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-sale_date'),
  });

  const displayInvoice = (s) => s?.invoice_number || s?.id || '-';

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const parseSaleItems = (sale) => {
    const raw = sale?.items;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  useEffect(() => {
    if (!showDetail || !selectedSale) return;
    const items = parseSaleItems(selectedSale);
    setReturnItems(items.map((it) => ({
      selected: true,
      qty: Math.max(0, Number(it?.qty || 0) || 0)
    })));
    setReturnNotes('');
  }, [showDetail, selectedSale?.id]);

  const returnMutation = useMutation({
    mutationFn: async ({ sale, notes, itemsToReturn }) => {
      const cleanNotes = String(notes || '').trim();
      const existing = String(sale.notes || '').trim();
      const baseReturNote = cleanNotes ? `Retur: ${cleanNotes}` : 'Retur penjualan';

      const currentItems = parseSaleItems(sale);
      const returns = Array.isArray(itemsToReturn) ? itemsToReturn : [];
      const returnMap = new Map();
      for (const r of returns) {
        const idx = Number(r?.index);
        const qty = Number(r?.qty);
        if (!Number.isFinite(idx) || !Number.isFinite(qty)) continue;
        if (idx < 0 || idx >= currentItems.length) continue;
        const maxQty = Math.max(0, Number(currentItems[idx]?.qty || 0) || 0);
        const clamped = Math.min(maxQty, Math.max(0, qty));
        if (clamped > 0) returnMap.set(idx, clamped);
      }

      let returnedCostTotal = 0;
      for (const [idx, qtyReturn] of returnMap.entries()) {
        const item = currentItems[idx];
        const product = products.find(p => String(p.id) === String(item.product_id));
        if (product) {
          const unit = String(item.unit || '').trim().toUpperCase();
          const perDus = Number(item.pcs_per_dus ?? product.pcs_per_dus ?? 1) || 1;
          const qtyPcs = unit === 'DUS' ? qtyReturn * perDus : qtyReturn;
          const before = Number(product.stock_pcs || 0) || 0;
          const newStock = before + qtyPcs;

          await base44.entities.Product.update(product.id, { stock_pcs: newStock });

          const costPerPcs = (() => {
            const v = Number(item.cost_price || 0) || 0;
            if (v > 0) return v;
            const buyPcs = Number(product.buy_price_pcs || 0) || 0;
            if (buyPcs > 0) return buyPcs;
            const per = Number(product.pcs_per_dus || 1) || 1;
            const buyDus = Number(product.buy_price_dus || 0) || 0;
            return per > 0 ? (buyDus / per) : 0;
          })();
          if (costPerPcs > 0) {
            returnedCostTotal += (Number(qtyPcs || 0) || 0) * costPerPcs;
          }

          await base44.entities.StockMutation.create({
            product_id: String(item.product_id),
            product_name: item.product_name,
            type: 'in',
            qty_pcs: qtyPcs,
            stock_before: before,
            stock_after: newStock,
            purchase_price: Number(item.cost_price || 0),
            reference_type: 'return_sale',
            reference_id: sale.id,
            notes: `Retur item ${item.product_name} (${qtyReturn} ${item.unit || ''}) - ${sale.invoice_number || sale.id}${cleanNotes ? ' - ' + cleanNotes : ''}`
          });
        }
      }

      const updatedItems = [];
      for (let i = 0; i < currentItems.length; i++) {
        const item = currentItems[i];
        const oldQty = Math.max(0, Number(item?.qty || 0) || 0);
        const qtyReturn = returnMap.get(i) || 0;
        const newQty = Math.max(0, oldQty - qtyReturn);
        if (newQty <= 0) continue;
        const price = Number(item?.price || 0) || 0;
        updatedItems.push({
          ...item,
          qty: newQty,
          subtotal: Math.round(newQty * price)
        });
      }

      const newSubtotal = updatedItems.reduce((acc, it) => acc + (Number(it?.subtotal || 0) || 0), 0);
      const dtype = String(sale.discount_type || '').trim().toLowerCase();
      const dval = Number(sale.discount_value || 0) || 0;
      let discountAmount = 0;
      if (dtype === 'percent') {
        discountAmount = Math.round(newSubtotal * dval / 100);
      } else if (dtype === 'nominal') {
        discountAmount = Math.min(newSubtotal, Math.max(0, dval));
      }
      const taxPercent = Number(sale.tax_percent || 0) || 0;
      const taxBase = Math.max(0, newSubtotal - discountAmount);
      const taxAmount = Math.max(0, Math.round(taxBase * taxPercent / 100));
      const newTotal = Math.max(0, taxBase + taxAmount);

      const method = String(sale.payment_method || '').trim().toLowerCase();
      const paid = Math.max(0, Number(sale.paid_amount || 0) || 0);
      const changeAmount = method === 'tempo' ? 0 : Math.max(0, paid - newTotal);
      const debtAmount = method === 'tempo' ? Math.max(0, newTotal - paid) : 0;

      const isAllReturned = updatedItems.length === 0;
      const beforeTotal = Math.max(0, Number(sale.total || 0) || 0);
      const afterTotal = isAllReturned ? 0 : newTotal;
      const returNominal = Math.max(0, Math.round(beforeTotal - afterTotal));
      const combinedNotes = [
        existing || null,
        baseReturNote,
        `ReturNominal=${returNominal}`
      ].filter(Boolean).join(' | ');
      const oldTotalCost = Math.max(0, Number(sale.total_cost || 0) || 0);
      const newTotalCost = isAllReturned ? 0 : Math.max(0, oldTotalCost - returnedCostTotal);
      const newTotalProfit = isAllReturned ? 0 : Math.max(0, afterTotal - newTotalCost);
      const payload = isAllReturned ? {
        status: 'returned',
        notes: combinedNotes,
        items: [],
        subtotal: 0,
        discount_amount: 0,
        tax_amount: 0,
        total: 0,
        paid_amount: 0,
        change_amount: 0,
        debt_amount: 0,
        due_date: null,
        total_cost: 0,
        total_profit: 0
      } : {
        status: 'completed',
        notes: combinedNotes,
        items: updatedItems,
        subtotal: newSubtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total: newTotal,
        paid_amount: paid,
        change_amount: changeAmount,
        debt_amount: debtAmount,
        due_date: method === 'tempo' && debtAmount > 0 ? (sale.due_date || null) : null,
        total_cost: newTotalCost,
        total_profit: newTotalProfit
      };

      const oldDebt = Math.max(0, Number(sale.debt_amount || 0) || 0);
      await base44.entities.Sale.update(sale.id, payload);

      try {
        const isTempo = method === 'tempo';
        const custId = sale.customer_id;
        const reduce = Math.max(0, oldDebt - (payload.debt_amount || 0));
        if (isTempo && custId && reduce > 0) {
          let customer = null;
          if (base44.entities.Customer.get) {
            customer = await base44.entities.Customer.get(custId);
          } else {
            const allCustomers = await base44.entities.Customer.list();
            customer = allCustomers.find(c => String(c.id) === String(custId));
          }
          if (customer) {
            const newDebt = Math.max(0, (customer.total_debt || 0) - reduce);
            await base44.entities.Customer.update(custId, { total_debt: newDebt });
          }
        }
      } catch {}
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDetail(false);
      setReturnNotes('');
      setReturnItems([]);
      toast.success('Retur penjualan berhasil!');
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ saleId, payload }) => {
      return base44.entities.Sale.update(saleId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setShowEdit(false);
      setEditingSale(null);
      setEditNotes('');
      setEditDueDate('');
      toast.success('Penjualan berhasil diperbarui!');
    },
    onError: (error) => {
      toast.error(error?.message || 'Gagal memperbarui penjualan');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (sale) => {
      if (sale?.status === 'returned') {
        await base44.entities.Sale.delete(sale.id);
        return;
      }
      const items = parseSaleItems(sale);

      for (const item of items) {
        const product = products.find(p => String(p.id) === String(item.product_id));
        if (product) {
          const unit = String(item.unit || '').trim().toUpperCase();
          const perDus = Number(item.pcs_per_dus ?? product.pcs_per_dus ?? 1) || 1;
          const qtyNum = Number(item.qty || 0) || 0;
          const qtyPcs = unit === 'DUS' ? qtyNum * perDus : qtyNum;
          const before = Number(product.stock_pcs || 0) || 0;
          const newStock = before + qtyPcs;

          await base44.entities.Product.update(product.id, { stock_pcs: newStock });

          try {
            await base44.entities.StockMutation.create({
              product_id: String(item.product_id),
              product_name: item.product_name,
              type: 'in',
              qty_pcs: qtyPcs,
              stock_before: before,
              stock_after: newStock,
              purchase_price: Number(item.cost_price || 0),
              reference_type: 'delete_sale',
              reference_id: sale.id,
              notes: `Hapus transaksi penjualan ${sale.invoice_number || sale.id}`
            });
          } catch {}
        }
      }

      try {
        const isTempo = String(sale.payment_method || '').trim().toLowerCase() === 'tempo';
        const custId = sale.customer_id;
        const debt = Number(sale.debt_amount || 0);
        if (isTempo && custId && debt > 0) {
          let customer = null;
          if (base44.entities.Customer.get) {
            customer = await base44.entities.Customer.get(custId);
          } else {
            const allCustomers = await base44.entities.Customer.list();
            customer = (allCustomers || []).find(c => String(c.id) === String(custId)) || null;
          }
          if (customer) {
            const newDebt = Math.max(0, (customer.total_debt || 0) - debt);
            await base44.entities.Customer.update(custId, { total_debt: newDebt });
          }
        }
      } catch {}

      await base44.entities.Sale.delete(sale.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Penjualan berhasil dihapus!');
    },
    onError: (error) => {
      toast.error(error?.message || 'Gagal menghapus penjualan');
    }
  });

  const filteredSales = sales.filter(s => {
    const inv = String(displayInvoice(s)).toLowerCase();
    const cust = String(s.customer_name || '').toLowerCase();
    const q = search.toLowerCase();
    return inv.includes(q) || cust.includes(q);
  });

  const handleViewDetail = (sale) => {
    setSelectedSale(sale);
    setShowDetail(true);
  };

  const handlePrintReceipt = (sale) => {
    setSelectedSale(sale);
    setShowReceipt(true);
  };

  const handleEditSale = (sale) => {
    setEditingSale(sale);
    setEditNotes(String(sale?.notes || ''));
    setEditDueDate(String(sale?.due_date || ''));
    setShowEdit(true);
  };

  const methodLabel = (m) => {
    const v = String(m || '').trim().toLowerCase();
    if (v === 'cash') return 'Tunai';
    if (v === 'transfer') return 'Transfer';
    if (v === 'qris') return 'QRIS';
    if (v === 'tempo') return 'Tempo';
    return v || '-';
  };

  const getReturnNote = (sale) => {
    if (!sale) return '';
    const raw = String(sale.notes || '');
    const parts = raw.split('|').map(s => s.trim());
    const returPart = parts.find(p => p.toLowerCase().startsWith('retur:'));
    if (returPart) {
      const idx = returPart.indexOf(':');
      const only = idx >= 0 ? returPart.slice(idx + 1).trim() : '';
      return only;
    }
    if (parts.some(p => p.toLowerCase().startsWith('retur penjualan'))) {
      return 'Retur penjualan';
    }
    return '';
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Riwayat Penjualan</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari no faktur atau pelanggan..."
          className="pl-9"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Faktur</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pembayaran</TableHead>
              <TableHead>Keterangan Retur</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-mono">{displayInvoice(sale)}</TableCell>
                <TableCell>{format(new Date(sale.sale_date || sale.created_date), 'dd MMM yyyy HH:mm', { locale: id })}</TableCell>
                <TableCell>{sale.customer_name || '-'}</TableCell>
                <TableCell className="font-semibold">Rp {sale.total?.toLocaleString('id-ID')}</TableCell>
                <TableCell><Badge variant="secondary">{methodLabel(sale.payment_method)}</Badge></TableCell>
                <TableCell className="max-w-[220px] truncate" title={getReturnNote(sale) || ''}>
                  {getReturnNote(sale) || '-'}
                </TableCell>
                <TableCell>
                  {sale.status === 'returned' ? (
                    <Badge variant="destructive">Diretur</Badge>
                  ) : getReturnNote(sale) ? (
                    <Badge variant="secondary" className="text-red-600">Retur Sebagian</Badge>
                  ) : sale.debt_amount > 0 ? (
                    <Badge variant="outline" className="text-amber-600">Piutang</Badge>
                  ) : (
                    <Badge variant="outline" className="text-green-600">Lunas</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="Detail" onClick={() => handleViewDetail(sale)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEditSale(sale)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Cetak Struk" onClick={() => handlePrintReceipt(sale)}>
                    <Printer className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500"
                    title="Hapus"
                    onClick={() => {
                      if (confirm('Hapus transaksi penjualan ini? Stok akan dikembalikan.')) {
                        deleteMutation.mutate(sale);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showEdit} onOpenChange={(open) => {
        setShowEdit(open);
        if (!open) {
          setEditingSale(null);
          setEditNotes('');
          setEditDueDate('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Penjualan {displayInvoice(editingSale)}</DialogTitle>
          </DialogHeader>
          {editingSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <div className="text-slate-500">Pelanggan</div>
                  <div className="font-medium">{editingSale.customer_name || '-'}</div>
                </div>
                <div>
                  <div className="text-slate-500">Metode</div>
                  <div className="font-medium">{methodLabel(editingSale.payment_method)}</div>
                </div>
                <div>
                  <div className="text-slate-500">Total</div>
                  <div className="font-medium">Rp {Number(editingSale.total || 0).toLocaleString('id-ID')}</div>
                </div>
              </div>

              {String(editingSale.payment_method || '').trim().toLowerCase() === 'tempo' && (
                <div>
                  <Label htmlFor="edit-due-date">Jatuh Tempo</Label>
                  <Input
                    id="edit-due-date"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="edit-notes">Catatan</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Catatan (opsional)"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowEdit(false)}
                  disabled={editMutation.isPending}
                >
                  Batal
                </Button>
                <Button
                  onClick={() => {
                    const payload = {
                      notes: String(editNotes || '').trim() || '',
                      due_date: String(editingSale.payment_method || '').trim().toLowerCase() === 'tempo'
                        ? (String(editDueDate || '').trim() || null)
                        : null
                    };
                    editMutation.mutate({ saleId: editingSale.id, payload });
                  }}
                  disabled={editMutation.isPending}
                >
                  {editMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Penjualan {displayInvoice(selectedSale)}</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Tanggal</p>
                  <p className="font-medium">{format(new Date(selectedSale.sale_date || selectedSale.created_date), 'dd MMM yyyy HH:mm', { locale: id })}</p>
                </div>
                <div>
                  <p className="text-slate-500">Kasir</p>
                  <p className="font-medium">{selectedSale.cashier_name || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Pelanggan</p>
                  <p className="font-medium">{selectedSale.customer_name || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Metode Pembayaran</p>
                  <p className="font-medium">{methodLabel(selectedSale.payment_method)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500">Keterangan</p>
                  <p className="font-medium">{selectedSale.notes || '-'}</p>
                </div>
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Harga</TableHead>
                      <TableHead>Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parseSaleItems(selectedSale).map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.qty} {item.unit}</TableCell>
                        <TableCell>Rp {item.price?.toLocaleString('id-ID')}</TableCell>
                        <TableCell>Rp {item.subtotal?.toLocaleString('id-ID')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>Rp {selectedSale.subtotal?.toLocaleString('id-ID')}</span>
                </div>
                {selectedSale.discount_amount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Diskon</span>
                    <span>- Rp {selectedSale.discount_amount?.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {selectedSale.tax_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Pajak ({selectedSale.tax_percent}%)</span>
                    <span>Rp {selectedSale.tax_amount?.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>Rp {selectedSale.total?.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dibayar</span>
                  <span>Rp {selectedSale.paid_amount?.toLocaleString('id-ID')}</span>
                </div>
                {selectedSale.change_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Kembalian</span>
                    <span>Rp {selectedSale.change_amount?.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {selectedSale.debt_amount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Piutang</span>
                    <span>Rp {selectedSale.debt_amount?.toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>

              {selectedSale.status !== 'returned' && (
                <>
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[64px]">Pilih</TableHead>
                          <TableHead>Produk</TableHead>
                          <TableHead className="w-[120px] text-right">Qty Beli</TableHead>
                          <TableHead className="w-[140px] text-right">Qty Retur</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parseSaleItems(selectedSale).map((item, idx) => {
                          const qtyBeli = Math.max(0, Number(item?.qty || 0) || 0);
                          const row = returnItems[idx] || { selected: false, qty: 0 };
                          const qtyRetur = Math.min(qtyBeli, Math.max(0, Number(row.qty || 0) || 0));
                          return (
                            <TableRow key={`retur-${idx}`}>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.selected)}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setReturnItems((prev) => prev.map((p, i) => i === idx ? { ...p, selected: checked } : p));
                                  }}
                                  className="h-4 w-4"
                                />
                              </TableCell>
                              <TableCell>{item.product_name}</TableCell>
                              <TableCell className="text-right">{qtyBeli} {item.unit}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={qtyBeli}
                                  value={qtyRetur}
                                  onChange={(e) => {
                                    const next = Math.min(qtyBeli, Math.max(0, Number(e.target.value)));
                                    setReturnItems((prev) => prev.map((p, i) => i === idx ? { ...p, qty: next } : p));
                                  }}
                                  className="h-8 text-right"
                                  disabled={!row.selected}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>

                  <div className="space-y-2">
                    <Label htmlFor="return-notes">Keterangan Retur</Label>
                    <Textarea
                      id="return-notes"
                      placeholder="Tuliskan alasan/keterangan retur (opsional)"
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end">
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      const items = parseSaleItems(selectedSale);
                      const itemsToReturn = items
                        .map((_, idx) => {
                          const row = returnItems[idx];
                          if (!row?.selected) return null;
                          const qtyBeli = Math.max(0, Number(items[idx]?.qty || 0) || 0);
                          const qtyRetur = Math.min(qtyBeli, Math.max(0, Number(row.qty || 0) || 0));
                          if (qtyRetur <= 0) return null;
                          return { index: idx, qty: qtyRetur };
                        })
                        .filter(Boolean);
                      if (itemsToReturn.length === 0) {
                        toast.error('Pilih item dan qty retur dulu');
                        return;
                      }
                      if (confirm('Retur item yang dipilih? Stok akan dikembalikan.')) {
                        returnMutation.mutate({ sale: selectedSale, notes: returnNotes, itemsToReturn });
                      }
                    }}
                    disabled={returnMutation.isPending}
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    {returnMutation.isPending ? 'Memproses...' : 'Retur Penjualan'}
                  </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReceiptModal
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        sale={selectedSale}
      />
    </div>
  );
}
