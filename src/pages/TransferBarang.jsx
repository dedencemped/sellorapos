import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from 'sonner';
import { renderReportPdf } from '@/utils/pdfReport';
import { getSettings } from '@/lib/settings';

export default function TransferBarang() {
  const qc = useQueryClient();
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => base44.branches.list()
  });
  // Pilih cabang asal/tujuan
  const [fromBranchId, setFromBranchId] = useState('');
  // Load products dari cabang asal (override header ke branch asal)
  const { data: sourceProducts = [] } = useQuery({
    queryKey: ['products_from', fromBranchId],
    queryFn: () => base44.products.listByBranch(fromBranchId, '-created_date')
  });

  const [toBranchId, setToBranchId] = useState('');
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQty, setCurrentQty] = useState('');
  const [currentQtyPcs, setCurrentQtyPcs] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState('');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receiveNotes, setReceiveNotes] = useState('');

  const addItem = () => {
    const pidStr = String(currentProductId || '').trim();
    const packInput = Number(currentQty);
    const pcsInput = Number(currentQtyPcs || 0);
    if (!pidStr || (!Number.isFinite(packInput) && !Number.isFinite(pcsInput)) || (packInput <= 0 && pcsInput <= 0)) {
      toast.error('Pilih produk dan qty yang valid');
      return;
    }
    const prod = (sourceProducts || []).find(p => String(p.id) === pidStr);
    if (!prod) {
      toast.error('Produk tidak ditemukan di cabang asal');
      return;
    }
    const unit = String(prod?.default_unit || 'PCS').trim().toUpperCase();
    const perDus = Number(prod?.pcs_per_dus || 1) || 1;
    let qtyPcs = 0;
    
    if (perDus > 1) {
      const packPcs = Number.isFinite(packInput) && packInput > 0 ? Math.round(packInput * perDus) : 0;
      const extraPcs = Number.isFinite(pcsInput) && pcsInput > 0 ? Math.round(pcsInput) : 0;
      qtyPcs = packPcs + extraPcs;
    } else {
      qtyPcs = Number.isFinite(packInput) && packInput > 0 ? Math.round(packInput) : Math.round(pcsInput);
    }
    if (!Number.isFinite(qtyPcs) || qtyPcs <= 0) {
      toast.error('Qty tidak valid');
      return;
    }
    if ((prod.stock_pcs || 0) < qtyPcs) {
      toast.error('Stok cabang asal tidak mencukupi');
      return;
    }
    setItems(prev => {
      const idx = prev.findIndex(x => String(x.product_id) === String(prod.id));
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = { ...next[idx], qty_pcs: next[idx].qty_pcs + qtyPcs };
        return next;
      }
      // qty_value simpan kuantitas pack (jika unit ≠ PCS), agar histori tetap jelas
      const qv = unit !== 'PCS' && perDus > 1 ? (Number.isFinite(packInput) ? packInput : 0) : null;
      return [...prev, { 
        product_id: String(prod.id), 
        source_product_id: prod.source_product_id || String(prod.id), // Gunakan source_product_id asli atau ID saat ini jika itu pusat
        name: prod.name, 
        barcode: prod.barcode || null, 
        unit, 
        pcs_per_dus: perDus, 
        qty_value: qv, 
        qty_pcs: qtyPcs,
        category: prod.category || null,
        brand: prod.brand || null,
        image_url: prod.image_url || null
      }];
    });
    setCurrentQty('');
    setCurrentQtyPcs('');
  };

  const removeItem = (pid) => {
    setItems(prev => prev.filter(x => String(x.product_id) !== String(pid)));
  };
  const removeItemAt = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const to_branch_id = Number(toBranchId);
      if (!to_branch_id) {
        throw new Error('Cabang tujuan wajib dipilih');
      }
      if (items.length === 0) {
        throw new Error('Minimal 1 item untuk transfer');
      }
      return base44.stockTransfers.create({
        from_branch_id: Number(fromBranchId),
        to_branch_id,
        items: items.map(it => ({
          product_id: it.product_id,
          source_product_id: it.source_product_id, // Teruskan source_product_id
          name: it.name,
          qty_value: it.qty_value || null,
          unit: it.unit || null,
          qty_pcs: it.qty_pcs,
          barcode: it.barcode || null,
          // Tambahkan metadata lengkap untuk sinkronisasi di sisi server
          category: it.category || null,
          brand: it.brand || null,
          image_url: it.image_url || null,
          src_default_unit: it.unit || null,
          src_pcs_per_dus: it.pcs_per_dus || 1
        })),
        notes: notes || null
      });
    },
    onSuccess: async () => {
      toast.success('Transfer berhasil dikirim');
      setItems([]);
      setNotes('');
      setCurrentProductId('');
      setCurrentQty('');
      await qc.invalidateQueries({ queryKey: ['stock_transfers'] });
      await qc.invalidateQueries({ queryKey: ['products_pusat'] });
    },
    onError: (e) => {
      toast.error(e?.message || 'Gagal membuat transfer');
    }
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['stock_transfers'],
    queryFn: () => base44.stockTransfers.list({ sort: '-created_date' })
  });

  const { data: allBranches = [] } = useQuery({
    queryKey: ['all_branches'],
    queryFn: () => base44.branches.list({ all: '1', _t: Date.now() })
  });

  const allowedBranches = useMemo(() => Array.isArray(branches) ? branches : [], [branches]);
  const destinationBranches = useMemo(() => {
    const list = (Array.isArray(allBranches) ? allBranches : []).filter(b => String(b.id) !== String(fromBranchId));
    console.log('TransferBarang Debug - fromBranchId:', fromBranchId);
    console.log('TransferBarang Debug - allBranches count:', allBranches.length);
    console.log('TransferBarang Debug - destinationBranches count:', list.length);
    return list;
  }, [allBranches, fromBranchId]);
  const getBranchName = (id) => {
    const b = (Array.isArray(allBranches) ? allBranches : []).find(x => String(x.id) === String(id));
    return b?.name || `Cabang ${id}`;
  };
  const activeBranchId = useMemo(() => {
    if (typeof window !== 'undefined') return String(localStorage.getItem('active_branch_id') || '1');
    return '1';
  }, []);

  const receiveMutation = useMutation({
    mutationFn: async (payload) => {
      const { transfer, notes } = payload || {};
      return base44.stockTransfers.receive(transfer.id, { notes: notes ?? null });
    },
    onSuccess: async () => {
      toast.success('Transfer diterima');
      setReceiveOpen(false);
      setReceiveTarget(null);
      setReceiveNotes('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['stock_transfers'] }),
        qc.invalidateQueries({ queryKey: ['products'] }),
        qc.invalidateQueries({ queryKey: ['mutations'] })
      ]);
    },
    onError: (e) => {
      toast.error(e?.message || 'Gagal verifikasi terima');
    }
  });

  React.useEffect(() => {
    if (!fromBranchId && activeBranchId) {
      setFromBranchId(activeBranchId);
    } else if (!fromBranchId && allowedBranches.length > 0) {
      setFromBranchId(String(allowedBranches[0].id));
    }
  }, [allowedBranches, fromBranchId, activeBranchId]);
  React.useEffect(() => {
      if (toBranchId && String(toBranchId) === String(fromBranchId)) {
        const alt = destinationBranches[0]?.id;
        setToBranchId(alt ? String(alt) : '');
      }
    }, [fromBranchId, toBranchId, destinationBranches]);
    
    // Default to first available destination if none selected
    React.useEffect(() => {
      if (!toBranchId && destinationBranches.length > 0) {
        setToBranchId(String(destinationBranches[0].id));
      }
    }, [destinationBranches, toBranchId]);
  React.useEffect(() => {
    if (!currentProductId && Array.isArray(sourceProducts) && sourceProducts.length > 0) {
      const first = sourceProducts.find(p => Number(p?.stock_pcs || 0) > 0) || sourceProducts[0];
      if (first) setCurrentProductId(String(first.id));
    }
  }, [sourceProducts, currentProductId]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Transfer Barang</h1>
        <p className="text-slate-500">Kirim stok antar cabang.</p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Cabang Asal</Label>
            <Select value={fromBranchId} onValueChange={(v) => { setFromBranchId(v); setItems([]); setCurrentProductId(''); }}>
              <SelectTrigger><SelectValue placeholder="Pilih cabang asal" /></SelectTrigger>
              <SelectContent>
                {allowedBranches.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name || `Cabang ${b.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Cabang Tujuan</Label>
            <Select value={toBranchId} onValueChange={setToBranchId}>
              <SelectTrigger>
                <SelectValue placeholder={destinationBranches.length === 0 ? "Memuat cabang..." : "Pilih cabang tujuan"} />
              </SelectTrigger>
              <SelectContent>
                {destinationBranches.length > 0 ? (
                  destinationBranches.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name || `Cabang ${b.id}`}</SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-xs text-slate-500 text-center">Tidak ada cabang tujuan lain tersedia</div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Produk (Cabang Asal)</Label>
            <Select value={currentProductId} onValueChange={setCurrentProductId}>
              <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
              <SelectContent>
                {(sourceProducts || []).map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {(() => {
                      const name = p.name;
                      const unit = String(p?.default_unit || 'PCS').trim().toUpperCase();
                      const perDus = Number(p?.pcs_per_dus || 1) || 1;
                      const stockPcs = Number(p?.stock_pcs || 0);
                      if (perDus > 1) {
                        const dus = Math.floor(stockPcs / perDus);
                        const rem = stockPcs % perDus;
                        return `${name} — Stok: ${dus} ${unit}${rem > 0 ? ` + ${rem} PCS` : ''} (${stockPcs} PCS)`;
                      }
                      return `${name} — Stok: ${stockPcs} ${unit}`;
                    })()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(() => {
            const sel = (sourceProducts || []).find(p => String(p.id) === String(currentProductId));
            const u = String(sel?.default_unit || 'PCS').trim().toUpperCase();
            const per = Number(sel?.pcs_per_dus || 1) || 1;
            
            if (per > 1) {
              return (
                <>
                  <div>
                    <Label>{`Qty (${u})`}</Label>
                    <Input value={currentQty} onChange={(e) => setCurrentQty(e.target.value)} type="number" min="0" step="1" />
                    <div className="text-xs text-slate-500 mt-1">{`1 ${u} = ${per} PCS`}</div>
                  </div>
                  <div>
                    <Label>Qty (PCS)</Label>
                    <Input value={currentQtyPcs} onChange={(e) => setCurrentQtyPcs(e.target.value)} type="number" min="0" step="1" />
                    <div className="text-xs text-slate-500 mt-1">Sisa PCS (opsional)</div>
                  </div>
                </>
              );
            }
            return (
              <div>
                <Label>{`Qty (${u})`}</Label>
                <Input value={currentQty} onChange={(e) => setCurrentQty(e.target.value)} type="number" min="1" step="1" />
                <div className="text-xs text-slate-500 mt-1">{`1 ${u} = 1 PCS`}</div>
              </div>
            );
          })()}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            onClick={addItem}
            disabled={
              !currentProductId ||
              (
                (!currentQty || Number(currentQty) <= 0) &&
                (!currentQtyPcs || Number(currentQtyPcs) <= 0)
              )
            }
          >
            Tambah Item
          </Button>
        </div>

        <div>
          <Label>Catatan</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
        </div>

        {fromBranchId && sourceProducts?.length === 0 && (
          <div className="text-xs text-amber-600">
            Tidak ada data produk untuk cabang asal ini, atau Anda tidak memiliki akses.
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((it, idx) => (
              <TableRow key={it.product_id}>
                <TableCell>{it.name}</TableCell>
                <TableCell>
                  {(() => {
                    const unit = String(it?.unit || 'PCS').toUpperCase();
                    const per = Number(it?.pcs_per_dus || 1) || 1;
                    const pcs = Number(it?.qty_pcs || 0);
                    if (per > 1) {
                      const dus = Math.floor(pcs / per);
                      const rem = pcs % per;
                      return `${dus} ${unit}${rem > 0 ? ` + ${rem} PCS` : ''} (${pcs} PCS)`;
                    }
                    return `${pcs} ${unit}`;
                  })()}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); removeItemAt(idx); }}
                  >
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Memproses...' : 'Kirim Transfer'}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3">Riwayat Transfer</h2>
        <Table>
          <TableHeader>
            <TableRow>
            <TableHead>No. Dok</TableHead>
              <TableHead>Dari</TableHead>
              <TableHead>Ke</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Item</TableHead>
            <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(transfers || []).map(t => (
              <TableRow key={t.id}>
                <TableCell className="font-mono">{t.doc_number || `#${t.id}`}</TableCell>
                    <TableCell>{getBranchName(t.from_branch_id)}</TableCell>
                    <TableCell>{getBranchName(t.to_branch_id)}</TableCell>
                <TableCell>{t.transfer_date ? new Date(t.transfer_date).toLocaleString('id-ID') : '-'}</TableCell>
                <TableCell>
                  {(() => {
                    const st = String(t.status || 'sent').toLowerCase();
                    const isReceiver = String(t.to_branch_id) === String(activeBranchId);
                    if (st === 'received') {
                      return <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">Diterima</span>;
                    }
                    return isReceiver
                      ? <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">Menunggu Terima</span>
                      : <span className="px-2 py-1 text-xs rounded bg-yellow-100 text-yellow-700">Terkirim</span>;
                  })()}
                </TableCell>
                <TableCell>{Array.isArray(t.items) ? t.items.length : 0} item</TableCell>
                <TableCell className="text-right">
                  {String(t.to_branch_id) === String(activeBranchId) && String(t.status || 'sent').toLowerCase() !== 'received' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mr-2"
                      onClick={() => { setReceiveTarget(t); setReceiveNotes(''); setReceiveOpen(true); }}
                      disabled={receiveMutation.isPending}
                    >
                      {receiveMutation.isPending ? 'Memproses...' : 'Terima'}
                    </Button>
                  )}
                  
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const settings = getSettings();
                      const rows = (Array.isArray(t.items) ? t.items : []).map(x => {
                        const unit = String(x?.unit || 'PCS').toUpperCase();
                        const per = Number(x?.pcs_per_dus || x?.src_pcs_per_dus || 1) || 1;
                        const pcs = Number(x?.qty_pcs || 0);
                        let label = '';
                        if (per > 1) {
                          const dus = Math.floor(pcs / per);
                          const rem = pcs % per;
                          label = `${dus} ${unit}${rem > 0 ? ` + ${rem} PCS` : ''} (${pcs} PCS)`;
                        } else {
                          label = `${pcs} ${unit}`;
                        }
                        return [x.name || x.barcode || x.product_id, label];
                      });
                      const companyName = settings?.store_name || 'Perusahaan Anda';
                      const senderName = `${companyName} - ${getBranchName(t.from_branch_id)}`;
                      const receiverName = `${companyName} - ${getBranchName(t.to_branch_id)}`;
                      const toDataUrl = async (url) => {
                        if (!url || typeof url !== 'string') return null;
                        if (url.startsWith('data:')) return url;
                        try {
                          const resp = await fetch(url, { mode: 'cors' });
                          const blob = await resp.blob();
                          return await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                          });
                        } catch {
                          return null;
                        }
                      };
                      const logoDataUrl = await toDataUrl(settings?.logo_url);
                      const pdf = renderReportPdf({
                        title: 'SURAT JALAN TRANSFER BARANG',
                        company: { name: settings?.store_name || 'Perusahaan Anda', address: settings?.store_address || '' },
                        logoUrl: logoDataUrl || null,
                        periodLabel: t.doc_number || `#${t.id}`,
                        metaRightLabel: 'Nomor',
                        showSummary: false,
                        table: {
                          headers: ['Nama Barang', 'Qty'],
                          rows
                        },
                        summary: { items: [] },
                        signatures: [
                          { title: 'Pengirim', name: senderName },
                          { title: 'Penerima', name: receiverName }
                        ]
                      });
                      pdf.save(`${t.doc_number || `transfer-${t.id}`}.pdf`);
                    } catch (e) {
                      toast.error('Gagal mencetak nota transfer');
                    }
                  }}>Cetak</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verifikasi Penerimaan</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm font-medium">
              {receiveTarget ? (receiveTarget.doc_number || `#${receiveTarget.id}`) : ''}
            </div>
            
            <div className="max-h-[300px] overflow-auto border rounded-md p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="py-2">Item</TableHead>
                    <TableHead className="py-2 text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiveTarget && Array.isArray(receiveTarget.items) && receiveTarget.items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="py-2 text-xs">{it.name || it.barcode || `Produk ${it.product_id}`}</TableCell>
                      <TableCell className="py-2 text-right text-xs">
                        {(() => {
                          const unit = String(it?.unit || 'PCS').toUpperCase();
                          const per = Number(it?.pcs_per_dus || it?.src_pcs_per_dus || 1) || 1;
                          const pcs = Number(it?.qty_pcs || 0);
                          if (per > 1) {
                            const dus = Math.floor(pcs / per);
                            const rem = pcs % per;
                            return `${dus} ${unit}${rem > 0 ? ` + ${rem} PCS` : ''} (${pcs} PCS)`;
                          }
                          return `${pcs} ${unit}`;
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div>
              <Label>Catatan Penerimaan</Label>
              <Input value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} placeholder="Opsional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReceiveOpen(false); setReceiveTarget(null); setReceiveNotes(''); }} disabled={receiveMutation.isPending}>
              Batal
            </Button>
            <Button onClick={() => receiveMutation.mutate({ transfer: receiveTarget, notes: receiveNotes })} disabled={receiveMutation.isPending || !receiveTarget}>
              {receiveMutation.isPending ? 'Memproses...' : 'Konfirmasi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
