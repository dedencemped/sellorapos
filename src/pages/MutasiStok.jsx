import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpCircle, ArrowDownCircle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import StockDisplay from "@/components/pos/StockDisplay";

export default function MutasiStok() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('in');
  const [qtyRaw, setQtyRaw] = useState(0);
  const [adjustmentUnit, setAdjustmentUnit] = useState('PCS');
  const [notes, setNotes] = useState('');

  const { data: mutations = [] } = useQuery({
    queryKey: ['mutations'],
    queryFn: () => base44.entities.StockMutation.list('-created_date'),
  });
  const { data: transfers = [] } = useQuery({
    queryKey: ['mutations_transfers'],
    queryFn: () => base44.stockTransfers.list({ sort: '-created_date' })
  });
  const transferDocMap = React.useMemo(() => {
    const map = {};
    (transfers || []).forEach(t => {
      map[String(t.id)] = t.doc_number || `#${t.id}`;
    });
    return map;
  }, [transfers]);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list(),
  });

  const selectedProduct = products.find(p => String(p.id) === productId);

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const product = selectedProduct;
      if (!product) throw new Error('Produk tidak ditemukan');

      const qtyPcs = adjustmentUnit === 'DUS' || adjustmentUnit === getPackLabel(product) ? qtyRaw * (product.pcs_per_dus || 1) : qtyRaw;
      
      // Kirim satu request saja, server akan menangani transaksi stock update + mutation record
      await base44.entities.StockMutation.create({
        product_id: product.id,
        product_name: product.name,
        type: adjustmentType === 'out' ? 'out' : 'in',
        qty_pcs: Math.abs(qtyPcs),
        reference_type: 'adjustment',
        notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['mutations'] });
      setShowDialog(false);
      setProductId('');
      setQtyRaw(0);
      setAdjustmentUnit('PCS');
      setNotes('');
      toast.success('Penyesuaian stok berhasil!');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const filteredMutations = mutations
    .filter(m => String(m?.reference_type || '') !== 'return_purchase')
    .filter(m => {
      const q = (search || '').toLowerCase();
      if (!q) return true;
      const name = String(m?.product_name || '').toLowerCase();
      const notesText = String(m?.notes || '').toLowerCase();
      const isTransfer = String(m?.reference_type || '') === 'stock_transfer';
      const doc = isTransfer ? String(transferDocMap[String(m?.reference_id)] || (m?.reference_id ? `#${m.reference_id}` : '')).toLowerCase() : '';
      return name.includes(q) || notesText.includes(q) || (isTransfer && doc && doc.includes(q));
    });

  const getPackLabel = (product) => {
    const per = Number(product?.pcs_per_dus || 1);
    const raw = String(product?.default_unit || '').trim();
    if (raw) return raw.toUpperCase();
    if (per > 1) return 'DUS';
    return 'PCS';
  };

  const formatWithUnit = (pcs, unitRaw = 'PCS', pcsPerPack = 1) => {
    const unit = String(unitRaw || 'PCS').toUpperCase();
    const per = Number(pcsPerPack || 1);
    if (unit !== 'PCS') {
      if (per > 1) {
        const pack = Math.floor(pcs / per);
        const rem = pcs % per;
        if (pack > 0 && rem > 0) return `${pack} ${unit} + ${rem} PCS`;
        if (pack > 0) return `${pack} ${unit}`;
        return `${rem} PCS`;
      }
      return `${pcs} ${unit}`;
    }
    return `${pcs} PCS`;
  };

  const getTypeIcon = (type) => {
    if (type === 'in') return <ArrowUpCircle className="w-4 h-4 text-green-500" />;
    if (type === 'out') return <ArrowDownCircle className="w-4 h-4 text-red-500" />;
    return <RefreshCw className="w-4 h-4 text-blue-500" />;
  };

  const getTypeBadge = (type, refType) => {
    if (type === 'in') {
      if (refType === 'purchase') return <Badge className="bg-green-100 text-green-700">Pembelian</Badge>;
      if (refType === 'return_sale') return <Badge className="bg-green-100 text-green-700">Retur Jual</Badge>;
      return <Badge className="bg-green-100 text-green-700">Masuk</Badge>;
    }
    if (type === 'out') {
      if (refType === 'sale') return <Badge className="bg-red-100 text-red-700">Penjualan</Badge>;
      return <Badge className="bg-red-100 text-red-700">Keluar</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-700">Penyesuaian</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Mutasi Stok</h1>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />Penyesuaian Stok
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari produk..."
          className="pl-9"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Mutasi Stok</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Stok Sebelum</TableHead>
                <TableHead>Stok Sesudah</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMutations.map((mutation) => (
                <TableRow key={mutation.id}>
                  <TableCell>{format(new Date(mutation.created_date), 'dd MMM yyyy HH:mm', { locale: id })}</TableCell>
                  <TableCell className="font-medium">{mutation.product_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getTypeIcon(mutation.type)}
                      {getTypeBadge(mutation.type, mutation.reference_type)}
                    </div>
                  </TableCell>
                  {(() => {
                    const product = products.find(p => String(p.id) === String(mutation.product_id));
                    const unit = getPackLabel(product);
                    const per = product?.pcs_per_dus || 1;
                    const sign = mutation.type === 'out' ? '-' : '+';
                    return (
                      <>
                        <TableCell className={mutation.type === 'out' ? 'text-red-600' : 'text-green-600'}>
                          <div className="flex items-center gap-1">
                            <span>{sign}</span>
                            <StockDisplay stockPcs={mutation.qty_pcs || 0} pcsPerDus={per} unitName={unit} showWarning={false} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <StockDisplay stockPcs={mutation.stock_before || 0} pcsPerDus={per} unitName={unit} showWarning={false} />
                        </TableCell>
                        <TableCell className="font-semibold">
                          <StockDisplay stockPcs={mutation.stock_after || 0} pcsPerDus={per} unitName={unit} showWarning={false} />
                        </TableCell>
                      </>
                    );
                  })()}
                  <TableCell className="text-sm text-slate-500">
                    {(() => {
                      const raw = String(mutation.notes || '').trim();
                      if (raw) return raw;
                      if (String(mutation.reference_type || '') === 'stock_transfer') {
                        const doc = transferDocMap[String(mutation.reference_id)] || (mutation.reference_id ? `#${mutation.reference_id}` : '');
                        return doc ? `Transfer ${doc}` : 'Transfer';
                      }
                      return '-';
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Adjustment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Penyesuaian Stok Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Produk</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} (Stok: {(() => {
                        const unit = getPackLabel(p);
                        const per = p.pcs_per_dus || 1;
                        if (per > 1) {
                          const q = Math.floor((p.stock_pcs || 0) / per);
                          const r = (p.stock_pcs || 0) % per;
                          return `${q} ${unit}${r > 0 ? ` + ${r} PCS` : ''}`;
                        }
                        return `${p.stock_pcs || 0} ${unit}`;
                      })()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProduct && (
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-500">Stok Saat Ini</p>
                <div className="font-bold text-lg">
                  <StockDisplay stockPcs={selectedProduct.stock_pcs} pcsPerDus={selectedProduct.pcs_per_dus} unitName={selectedProduct.default_unit || 'PCS'} showWarning={false} />
                </div>
              </div>
            )}

            <div>
              <Label>Tipe Penyesuaian</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Tambah Stok (Masuk)</SelectItem>
                  <SelectItem value="out">Kurangi Stok (Keluar)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Jumlah</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={qtyRaw}
                  onChange={(e) => setQtyRaw(Number(e.target.value))}
                  min="1"
                  className="flex-1"
                />
                {selectedProduct?.pcs_per_dus > 1 && (
                  <Select value={adjustmentUnit} onValueChange={setAdjustmentUnit}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PCS">PCS</SelectItem>
                      <SelectItem value={getPackLabel(selectedProduct)}>
                        {getPackLabel(selectedProduct)}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {selectedProduct && qtyRaw > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600">Stok Setelah Penyesuaian</p>
                <div className="font-bold text-lg text-blue-900">
                  {(() => {
                    const packLabel = getPackLabel(selectedProduct);
                    const isPack = adjustmentUnit === packLabel;
                    const qtyPcs = isPack ? qtyRaw * (selectedProduct.pcs_per_dus || 1) : qtyRaw;
                    const newStock = adjustmentType === 'out'
                      ? (selectedProduct.stock_pcs || 0) - qtyPcs
                      : (selectedProduct.stock_pcs || 0) + qtyPcs;
                    return <StockDisplay stockPcs={newStock} pcsPerDus={selectedProduct.pcs_per_dus} unitName={getPackLabel(selectedProduct)} showWarning={false} />
                  })()}
                </div>
              </div>
            )}

            <div>
              <Label>Catatan</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Alasan penyesuaian..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
              <Button 
                onClick={() => adjustmentMutation.mutate()} 
                disabled={!selectedProduct || qtyRaw <= 0 || adjustmentMutation.isPending}
              >
                {adjustmentMutation.isPending ? 'Memproses...' : 'Simpan'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
