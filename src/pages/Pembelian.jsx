import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext.jsx';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import ProductSearch from "@/components/pos/ProductSearch";
import { getSettings } from "@/lib/settings";

export default function Pembelian() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const branchId = user?.branch_id || 0;
  const [showDialog, setShowDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editState, setEditState] = useState({
    id: '',
    supplierId: '',
    supplierName: '',
    invoice: '',
    paymentMethod: 'cash',
    paidAmount: 0,
    total: 0,
    debtAmount: 0,
    purchaseDate: format(new Date(), 'yyyy-MM-dd'),
    original: null
  });
  const methodLabel = (m) => {
    const v = String(m || '').trim().toLowerCase();
    if (v === 'cash') return 'Tunai';
    if (v === 'transfer') return 'Transfer';
    if (v === 'tempo') return 'Tempo';
    return v || '-';
  };

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.list('-purchase_date'),
  });

  const filteredPurchases = purchases.filter((p) => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return true;
    const inv = String(p?.invoice_number || p?.id || '').toLowerCase();
    const sup = String(p?.supplier_name || '').toLowerCase();
    return inv.includes(q) || sup.includes(q);
  });

  const addItem = (product) => {
    const existing = items.findIndex(i => i.product_id === product.id);
    if (existing >= 0) {
      const newItems = [...items];
      newItems[existing].qty += 1;
      setItems(newItems);
    } else {
      const pcsPerDus = product.pcs_per_dus || 1;
      const derivedBuyPcs = product.buy_price_pcs && product.buy_price_pcs > 0
        ? product.buy_price_pcs
        : ((product.buy_price_dus || 0) && pcsPerDus > 0 ? (product.buy_price_dus / pcsPerDus) : 0);
      const duRaw = String(product.default_unit || '').trim();
      const duUpper = duRaw.toUpperCase();
      const initialUnit = 'PCS';
      const customUnit = duUpper && duUpper !== 'PCS' ? duUpper : '';
      const packPrice = (product.buy_price_dus && product.buy_price_dus > 0)
        ? product.buy_price_dus
        : (derivedBuyPcs * pcsPerDus);
      const initialPrice = initialUnit === 'PCS' ? derivedBuyPcs : packPrice;
      setItems([...items, {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode,
        qty: 1,
        unit: initialUnit,
        price: initialPrice,
        pcs_per_dus: pcsPerDus,
        custom_unit: customUnit
      }]);
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    if (field === 'unit') {
      const product = products.find(p => p.id === newItems[index].product_id);
      const pcsPerDus = product?.pcs_per_dus || 1;
      const buyPcs = (product?.buy_price_pcs && product.buy_price_pcs > 0)
        ? product.buy_price_pcs
        : ((product?.buy_price_dus || 0) && pcsPerDus > 0 ? (product.buy_price_dus / pcsPerDus) : 0);
      const packPrice = (product?.buy_price_dus && product.buy_price_dus > 0)
        ? product.buy_price_dus
        : (buyPcs * pcsPerDus);
      newItems[index].price = String(value || '').toUpperCase() === 'PCS' ? buyPcs : packPrice;
    }
    setItems(newItems);
  };

  const removeItem = (index) => setItems(items.filter((_, i) => i !== index));

  const total = items.reduce((sum, item) => sum + (item.qty * item.price), 0);
  const debtAmount = paymentMethod === 'tempo' ? total - paidAmount : 0;

  const generateInvoice = () => {
    const date = format(new Date(), 'yyyyMMdd');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `PO-${date}-${random}`;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error('Supplier wajib dipilih');
      if (items.length === 0) throw new Error('Tambahkan minimal 1 produk');
      for (const item of items) {
        if (!item.product_id) throw new Error('Produk tidak valid');
        if (!item.qty || item.qty <= 0) throw new Error(`Qty untuk ${item.product_name} harus > 0`);
        if (item.price === undefined || item.price < 0) throw new Error(`Harga untuk ${item.product_name} tidak valid`);
      }
      const supplier = suppliers.find(s => String(s.id) === String(supplierId));
      const methodKey = String(paymentMethod || '').trim().toLowerCase();
      const purchaseData = {
        invoice_number: generateInvoice(),
        supplier_id: supplierId ? String(supplierId) : null,
        supplier_name: supplier?.name,
        items: items.map(i => ({ ...i, subtotal: i.qty * i.price })),
        subtotal: total,
        total,
        payment_method: methodKey,
        paid_amount: methodKey === 'tempo' ? paidAmount : total,
        debt_amount: debtAmount,
        purchase_date: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
        status: 'completed',
        branch_id: branchId
      };

      const purchase = await base44.entities.Purchase.create(purchaseData);
      if (!purchase || !purchase.id) {
        throw new Error('Gagal menyimpan data pembelian ke server');
      }

      // Update supplier debt
      if (paymentMethod === 'tempo' && debtAmount > 0 && supplier) {
        try {
          await base44.entities.Supplier.update(supplier.id, {
            total_debt: (supplier.total_debt || 0) + debtAmount
          });
        } catch {}
      }

      return purchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowDialog(false);
      setItems([]);
      setSupplierId('');
      setPaidAmount(0);
      setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
      toast.success('Pembelian berhasil disimpan!');
    },
    onError: (error) => {
      toast.error(error?.message || 'Gagal menyimpan pembelian');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (purchase) => {
      // Coba hapus berdasarkan ID dulu, jika 404 baru fallback ke invoice_number
      try {
        await base44.entities.Purchase.delete(purchase.id);
      } catch (e) {
        const msg = String(e?.message || '');
        if (msg.includes('Tidak bisa hapus: stok dari pembelian ini sudah terpakai')) {
          const ok = confirm('Stok dari pembelian ini terdeteksi sudah terpakai. Hapus paksa? (Hanya akan mengurangi stok yang masih tersisa dari pembelian ini)');
          if (!ok) throw e;
          const key = purchase.id;
          await base44.entities.Purchase.delete(key, { force: 1 });
        } else if (msg.includes('Not Found') || msg.includes('status 404')) {
          const key = purchase.invoice_number || purchase.id;
          await base44.entities.Purchase.delete(key);
        } else {
          throw e;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Pembelian dihapus');
    },
    onError: (e) => {
      toast.error(e?.message || 'Gagal menghapus pembelian');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const p = editState.original;
      if (!p) throw new Error('Data tidak valid');
      const newMethod = String(editState.paymentMethod || '').trim().toLowerCase();
      const newPaid = newMethod === 'tempo' ? Number(editState.paidAmount || 0) : Number(p.total || 0);
      const newDebt = newMethod === 'tempo' ? Math.max(0, Number(p.total || 0) - newPaid) : 0;
      const payload = {
        invoice_number: editState.invoice,
        supplier_id: editState.supplierId || null,
        supplier_name: editState.supplierName || null,
        payment_method: newMethod,
        paid_amount: newPaid,
        debt_amount: newDebt,
        purchase_date: editState.purchaseDate ? new Date(editState.purchaseDate).toISOString() : null
      };
      const updated = await base44.entities.Purchase.update(editState.id, payload);
      try {
        const oldSupplierId = p.supplier_id ? String(p.supplier_id) : '';
        const newSupplierId = editState.supplierId ? String(editState.supplierId) : '';
        const oldDebt = Number(p.debt_amount || 0);
        const deltaSameSupplier = newSupplierId && oldSupplierId === newSupplierId ? (newDebt - oldDebt) : 0;
        if (deltaSameSupplier !== 0) {
          const s = suppliers.find(x => String(x.id) === newSupplierId);
          if (s) {
            await base44.entities.Supplier.update(s.id, { total_debt: Math.max(0, (Number(s.total_debt || 0)) + deltaSameSupplier) });
          }
        } else if (oldSupplierId && newSupplierId && oldSupplierId !== newSupplierId) {
          const oldS = suppliers.find(x => String(x.id) === oldSupplierId);
          if (oldS && oldDebt > 0) {
            await base44.entities.Supplier.update(oldS.id, { total_debt: Math.max(0, Number(oldS.total_debt || 0) - oldDebt) });
          }
          if (newDebt > 0) {
            const newS = suppliers.find(x => String(x.id) === newSupplierId);
            if (newS) {
              await base44.entities.Supplier.update(newS.id, { total_debt: Math.max(0, Number(newS.total_debt || 0) + newDebt) });
            }
          }
        }
      } catch {}
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowEditDialog(false);
      toast.success('Pembelian diperbarui');
    },
    onError: (e) => {
      toast.error(e?.message || 'Gagal memperbarui pembelian');
    }
  });

  const handleEdit = (purchase) => {
    const d = purchase.purchase_date ? new Date(purchase.purchase_date) : (purchase.created_date ? new Date(purchase.created_date) : new Date());
    const dateStr = isNaN(d.getTime()) ? format(new Date(), 'yyyy-MM-dd') : format(d, 'yyyy-MM-dd');
    setEditState({
      id: purchase.id,
      supplierId: purchase.supplier_id ? String(purchase.supplier_id) : '',
      supplierName: purchase.supplier_name || '',
      invoice: purchase.invoice_number || '',
      paymentMethod: purchase.payment_method || 'cash',
      paidAmount: Number(purchase.paid_amount || 0),
      total: Number(purchase.total || 0),
      debtAmount: Number(purchase.debt_amount || 0),
      purchaseDate: dateStr,
      original: purchase
    });
    setShowEditDialog(true);
  };

  const handlePrint = (purchase) => {
    try {
      const settings = getSettings();
      const items = Array.isArray(purchase.items) ? purchase.items : (typeof purchase.items === 'string' ? JSON.parse(purchase.items) : []);
      const rowsHtml = items.map((it, idx) => {
        const qty = Number(it.qty || 0);
        const unit = String(it.unit || '').toUpperCase();
        const price = Number(it.price || 0);
        const sub = it.subtotal !== undefined ? Number(it.subtotal || 0) : (qty * price);
        return `
          <tr>
            <td style="padding:6px;border:1px solid #e5e7eb;">${idx + 1}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;">${it.product_name || ''}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:center;">${qty} ${unit}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">Rp ${price.toLocaleString('id-ID')}</td>
            <td style="padding:6px;border:1px solid #e5e7eb;text-align:right;">Rp ${sub.toLocaleString('id-ID')}</td>
          </tr>
        `;
      }).join('');
      const totalNum = Number(purchase.total || 0);
      const paidNum = Number(purchase.paid_amount || 0);
      const debtNum = Number(purchase.debt_amount || Math.max(0, totalNum - paidNum));
      const method = methodLabel(purchase.payment_method);
      const inv = purchase.invoice_number || purchase.id || '-';
      const d = purchase.purchase_date ? new Date(purchase.purchase_date) : (purchase.created_date ? new Date(purchase.created_date) : new Date());
      const dateStr = isNaN(d.getTime()) ? '-' : format(d, 'dd MMM yyyy', { locale: id });
      const html = `
        <html>
          <head>
            <title>Faktur Pembelian ${inv}</title>
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
                <div><strong>Supplier:</strong> ${purchase.supplier_name || '-'}</div>
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

  // Fitur retur pembelian di-nonaktifkan sesuai permintaan

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Pembelian Barang</h1>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />Input Pembelian
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari no faktur atau supplier..."
          className="pl-9"
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Faktur</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Pembayaran</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPurchases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  Data tidak ditemukan
                </TableCell>
              </TableRow>
            ) : (
              filteredPurchases.map((purchase) => (
                <TableRow key={purchase.id}>
                  <TableCell className="font-mono">{purchase.invoice_number}</TableCell>
                  <TableCell>{format(new Date(purchase.purchase_date || purchase.created_date), 'dd MMM yyyy', { locale: id })}</TableCell>
                  <TableCell>{purchase.supplier_name || '-'}</TableCell>
                  <TableCell>Rp {purchase.total?.toLocaleString('id-ID')}</TableCell>
                  <TableCell>
                    <Badge variant={String(purchase.payment_method).trim().toLowerCase() === 'tempo' ? 'secondary' : 'default'}>
                      {methodLabel(purchase.payment_method)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {purchase.debt_amount > 0 ? (
                      <Badge variant="destructive">Utang: Rp {purchase.debt_amount?.toLocaleString('id-ID')}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600">Lunas</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(purchase)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Cetak Faktur" onClick={() => handlePrint(purchase)}>
                      <Printer className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                      onClick={() => {
                        if (confirm('Hapus pembelian ini? Stok akan dikembalikan jika belum terpakai.')) {
                          deleteMutation.mutate(purchase);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => {
        setShowDialog(open);
        if (!open) {
          setItems([]);
          setSupplierId('');
          setPaidAmount(0);
          setPaymentMethod('cash');
          setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Input Pembelian Baru</DialogTitle>
          </DialogHeader>
          
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.info('Menyimpan pembelian...'); saveMutation.mutate(); }}>
            <div>
              <Label>Tanggal</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tambah Produk</Label>
              <ProductSearch products={products} onSelect={addItem} placeholder="Cari produk..." />
            </div>

            {items.length > 0 && (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Satuan</TableHead>
                      <TableHead>Harga</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>
                          <Input type="number" value={item.qty} onChange={(e) => updateItem(index, 'qty', Number(e.target.value))} className="w-20" />
                        </TableCell>
                        <TableCell>
                          <Select value={item.unit} onValueChange={(v) => updateItem(index, 'unit', v)}>
                            <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PCS">PCS</SelectItem>
                              {(() => {
                                const prod = products.find(p => p.id === item.product_id);
                                const raw = String(prod?.default_unit || item.custom_unit || '').trim();
                                const upper = raw.toUpperCase();
                                const packUnit = upper && upper !== 'PCS' ? upper : (item.pcs_per_dus > 1 ? 'DUS' : '');
                                if (!packUnit || packUnit === 'PCS') return null;
                                return <SelectItem value={packUnit}>{packUnit}</SelectItem>;
                              })()}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.price} onChange={(e) => updateItem(index, 'price', Number(e.target.value))} className="w-28" />
                        </TableCell>
                        <TableCell>Rp {(item.qty * item.price).toLocaleString('id-ID')}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(index)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Metode Pembayaran</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tunai</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="tempo">Tempo (Utang)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {paymentMethod === 'tempo' && (
                <div>
                  <Label>Jumlah Bayar</Label>
                  <Input type="number" value={paidAmount} onChange={(e) => setPaidAmount(Number(e.target.value))} />
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>Rp {total.toLocaleString('id-ID')}</span>
              </div>
              {paymentMethod === 'tempo' && debtAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Sisa Utang</span>
                  <span>Rp {debtAmount.toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDialog(false);
                  setItems([]);
                  setSupplierId('');
                  setPaidAmount(0);
                  setPaymentMethod('cash');
                  setPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
                }}
              >Batal</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Pembelian'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={(open) => setShowEditDialog(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Pembelian</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }}>
            <div>
              <Label>No. Faktur</Label>
              <Input value={editState.invoice} onChange={(e) => setEditState({ ...editState, invoice: e.target.value })} />
            </div>
            <div>
              <Label>Tanggal</Label>
              <Input type="date" value={editState.purchaseDate} onChange={(e) => setEditState({ ...editState, purchaseDate: e.target.value })} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Select
                value={editState.supplierId}
                onValueChange={(v) => {
                  const s = suppliers.find(x => String(x.id) === String(v));
                  setEditState({ ...editState, supplierId: v, supplierName: s?.name || '' });
                }}>
                <SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Metode Pembayaran</Label>
                <Select value={editState.paymentMethod} onValueChange={(v) => setEditState({ ...editState, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tunai</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="tempo">Tempo (Utang)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {String(editState.paymentMethod).trim().toLowerCase() === 'tempo' && (
                <div>
                  <Label>Jumlah Bayar</Label>
                  <Input
                    type="number"
                    value={editState.paidAmount}
                    onChange={(e) => setEditState({ ...editState, paidAmount: Number(e.target.value || 0) })}
                  />
                </div>
              )}
            </div>
            <div className="bg-slate-50 p-3 rounded">
              <div className="flex justify-between">
                <span>Total</span>
                <span>Rp {Number(editState.total || 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>Batal</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
 
      
    </div>
  );
}
