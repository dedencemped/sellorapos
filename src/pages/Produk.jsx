import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, AlertTriangle, Upload, Download, Printer, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import StockDisplay from "@/components/pos/StockDisplay";
import * as XLSX from 'xlsx';
import BarcodeLabelPrint from "@/components/BarcodeLabelPrint.jsx";
import { useAuth } from '@/lib/AuthContext.jsx';
import { formatCrudError } from '@/lib/utils';

const emptyProduct = {
  custom_id: '', barcode: '', name: '', category: '', brand: '', image_url: '', default_unit: 'PCS', pcs_per_dus: 1,
  buy_price_pcs: 0, buy_price_dus: 0, sell_price_pcs: 0, sell_price_dus: 0,
  stock_pcs: 0, min_stock_pcs: 0, is_active: true
};

export default function Produk() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentRole = String(user?.role || '').toLowerCase();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(emptyProduct);
  const importInputRef = useRef(null);
  const [showScan, setShowScan] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [labelProduct, setLabelProduct] = useState(null);
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [adminOverrideToken, setAdminOverrideToken] = useState(null);
  const [adminOverrideExp, setAdminOverrideExp] = useState(0);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
  });

  const { data: units = [] } = useQuery({
    queryKey: ['units'],
    queryFn: () => base44.entities.Unit.list(),
  });

  const saveMutation = useMutation({
    mutationFn: ({ data, overrideToken }) => {
      const headers = overrideToken ? { 'X-Admin-Override': overrideToken } : undefined;
      return data?.id
        ? base44.entities.Product.update(data.id, data.payload, { headers })
        : base44.entities.Product.create(data.payload, { headers });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDialog(false);
      setEditingProduct(null);
      setFormData(emptyProduct);
      toast.success(editingProduct ? 'Produk diperbarui!' : 'Produk ditambahkan!');
    },
    onError: (error) => {
      toast.error(formatCrudError(error, { entityLabel: 'produk' }));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, overrideToken }) => {
      const headers = overrideToken ? { 'X-Admin-Override': overrideToken } : undefined;
      return base44.entities.Product.delete(id, undefined, { headers });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Produk dihapus!');
    }
  });

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData(product);
    setShowDialog(true);
  };

  const openAdminAuth = (action) => {
    setPendingAction(() => action);
    setAdminPassword('');
    setShowAdminAuth(true);
  };
  const runWithRoleGuard = (action) => {
    if (currentRole === 'kasir') {
      const stillValid = adminOverrideToken && Number(adminOverrideExp || 0) > Date.now();
      if (stillValid) {
        action(adminOverrideToken);
        return;
      }
      openAdminAuth(action);
      return;
    }
    action(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const nameText = String(formData.name || '').trim();
    const barcodeText = String(formData.barcode || '').trim();
    if (!nameText) {
      toast.error('Nama produk wajib diisi');
      return;
    }
    const unitUpper = String(formData.default_unit || 'PCS').trim().toUpperCase() || 'PCS';
    const per = Number(formData.pcs_per_dus || 1) || 1;
    if (unitUpper !== 'PCS' && per <= 1) {
      toast.error(`Jumlah PCS per ${unitUpper} wajib lebih dari 1`);
      return;
    }
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const editingId = editingProduct?.id != null ? String(editingProduct.id) : null;
    const barcodeDup = barcodeText
      ? products.find(p => normalize(p?.barcode) === normalize(barcodeText) && String(p?.id) !== String(editingId))
      : null;
    if (barcodeDup) {
      toast.error(`Barcode sudah ada (dipakai oleh: ${String(barcodeDup?.name || '-').trim() || '-'}). Gunakan barcode lain atau edit produk tersebut.`);
      return;
    }
    const nameDup = products.find(p => normalize(p?.name) === normalize(nameText) && String(p?.id) !== String(editingId));
    if (nameDup) {
      toast.error(`Nama produk sudah ada. Gunakan nama lain atau edit produk tersebut.`);
      return;
    }
    runWithRoleGuard((overrideToken) => {
      const payload = { ...formData, name: nameText, barcode: barcodeText };
      const id = editingProduct?.id || null;
      saveMutation.mutate({ data: { id, payload }, overrideToken });
    });
  };
  const handleFormKeyDown = (e) => {
    if (e.key === 'Enter') {
      const target = e.target;
      const tag = String(target?.tagName || '').toLowerCase();
      if (tag !== 'textarea') {
        e.preventDefault();
        const form = e.currentTarget;
        const focusable = Array.from(form.querySelectorAll('input, select, textarea, button')).filter(el => !el.disabled && el.tabIndex !== -1);
        const index = focusable.indexOf(target);
        const next = focusable[index + 1];
        if (next) {
          next.focus();
          if (next.select) { try { next.select(); } catch {} }
        } else {
          const submitBtn = focusable.find(el => el.type === 'submit');
          if (submitBtn) submitBtn.focus();
        }
      }
    }
  };

  const handleImageFile = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });
      const maxSize = 512;
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/webp', 0.85);
      setFormData(prev => ({ ...prev, image_url: compressed }));
      toast.success('Gambar berhasil diunggah');
    } catch {
      toast.error('Gagal memproses gambar produk');
    }
  };
  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock_pcs <= (p.min_stock_pcs || 0));

  const triggerImport = () => {
    importInputRef.current?.click();
  };

  const normalizeKey = (k) => String(k || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const parseBool = (v) => {
    const s = String(v ?? '').trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'ya' || s === 'yes' || s === 'aktif') return true;
    if (s === '0' || s === 'false' || s === 'tidak' || s === 'no' || s === 'nonaktif') return false;
    return Boolean(v);
  };

  const onImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows || rows.length === 0) {
        toast.error('File kosong atau tidak valid');
        return;
      }
      const mapRow = (row) => {
        const mapped = {};
        const nk = {};
        for (const k of Object.keys(row)) {
          nk[normalizeKey(k)] = row[k];
        }
        const unit = String(nk['satuan'] ?? nk['default_unit'] ?? nk['unit'] ?? '').trim().toUpperCase() || 'PCS';
        mapped.custom_id = String(nk['id'] ?? nk['custom_id'] ?? nk['kode'] ?? '').trim();
        mapped.barcode = String(nk['barcode'] ?? nk['kode_barcode'] ?? '').trim();
        mapped.name = String(nk['nama'] ?? nk['name'] ?? '').trim();
        mapped.category = String(nk['kategori'] ?? nk['category'] ?? '').trim();
        mapped.brand = String(nk['merek'] ?? nk['brand'] ?? '').trim();
        mapped.default_unit = unit;
        mapped.pcs_per_dus = Number(nk['pcs_per_dus'] ?? nk['pcsperdus'] ?? nk['pcs_per_unit'] ?? nk['pcs_per_kemasan'] ?? 1) || 1;
        mapped.buy_price_pcs = Number(nk['buy_price_pcs'] ?? nk['harga_beli_pcs'] ?? nk['harga_beli_per_pcs'] ?? 0) || 0;
        mapped.buy_price_dus = Number(nk['buy_price_dus'] ?? nk['harga_beli'] ?? nk['harga_beli_unit'] ?? nk['harga_beli_kemasan'] ?? 0) || 0;
        mapped.sell_price_pcs = Number(nk['sell_price_pcs'] ?? nk['harga_jual_pcs'] ?? nk['harga_jual_per_pcs'] ?? 0) || 0;
        mapped.sell_price_dus = Number(nk['sell_price_dus'] ?? nk['harga_jual'] ?? nk['harga_jual_unit'] ?? nk['harga_jual_kemasan'] ?? 0) || 0;
        mapped.stock_pcs = Number(nk['stock_pcs'] ?? nk['stok_pcs'] ?? nk['stok'] ?? 0) || 0;
        mapped.min_stock_pcs = Number(nk['min_stock_pcs'] ?? nk['min_stok_pcs'] ?? nk['stok_minimum'] ?? 0) || 0;
        mapped.is_active = nk['is_active'] !== undefined || nk['aktif'] !== undefined ? parseBool(nk['is_active'] ?? nk['aktif']) : true;
        return mapped;
      };
      const payloads = rows.map(mapRow).filter(r => (r.name && r.name.length > 0));
      if (payloads.length === 0) {
        toast.error('Tidak ada baris valid (kolom Nama wajib diisi)');
        return;
      }
      await new Promise((resolve) => {
        runWithRoleGuard(async (overrideToken) => {
          const headers = overrideToken ? { 'X-Admin-Override': overrideToken } : undefined;
          let created = 0;
          let updated = 0;
          for (const p of payloads) {
            const existing = products.find(x => (p.barcode && x.barcode && x.barcode === p.barcode) || (p.custom_id && x.custom_id && x.custom_id === p.custom_id));
            if (existing) {
              await base44.entities.Product.update(existing.id, p, { headers });
              updated += 1;
            } else {
              await base44.entities.Product.create(p, { headers });
              created += 1;
            }
          }
          await queryClient.invalidateQueries({ queryKey: ['products'] });
          toast.success(`Import selesai: ${created} tambah, ${updated} update`);
          resolve();
        });
      });
    } catch (err) {
      toast.error(formatCrudError(err, { entityLabel: 'produk' }));
    }
  };

  const downloadProductTemplate = () => {
    const headers = [
      'ID',
      'Barcode',
      'Nama',
      'Kategori',
      'Merek',
      'Satuan',
      'PCS per DUS',
      'Harga Beli PCS',
      'Harga Beli Unit',
      'Harga Jual PCS',
      'Harga Jual Unit',
      'Stok PCS',
      'Stok Minimum PCS',
      'Aktif'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produk');
    XLSX.writeFile(wb, 'template-produk.xlsx');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Manajemen Produk</h1>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFileChange} className="hidden" />
          <Button
            variant="outline"
            onClick={() => {
              runWithRoleGuard(() => triggerImport());
            }}
          >
            <Upload className="w-4 h-4 mr-2" />Import Excel
          </Button>
          <Button variant="outline" onClick={downloadProductTemplate}><Download className="w-4 h-4 mr-2" />Unduh Template</Button>
          <Button
            onClick={() => {
              runWithRoleGuard(() => {
                setEditingProduct(null);
                setFormData(emptyProduct);
                setShowDialog(true);
              });
            }}
          >
            <Plus className="w-4 h-4 mr-2" />Tambah Produk
          </Button>
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) { setEditingProduct(null); setFormData(emptyProduct); }
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ID Produk</Label>
                  <Input value={formData.custom_id} onFocus={(e) => e.target.select()} onChange={(e) => setFormData({...formData, custom_id: e.target.value})} placeholder="Opsional: ID unik produk" />
                </div>
                <div>
                  <Label>Barcode / Kode</Label>
                  <Input value={formData.barcode} onFocus={(e) => e.target.select()} onChange={(e) => setFormData({...formData, barcode: e.target.value})} placeholder="Scan atau input manual" />
                </div>
                <div>
                  <Label>Nama Produk *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                </div>
                <div>
                  <Label>Kategori</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                    <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Merek</Label>
                  <Input value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <Label>Gambar Produk</Label>
                  <div className="flex items-center gap-3 mt-1">
                    {formData.image_url ? (
                      <img src={formData.image_url} alt="produk" className="w-16 h-16 object-cover rounded-md border" />
                    ) : (
                      <div className="w-16 h-16 rounded-md border flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageFile(e.target.files?.[0] || null)}
                      />
                      {formData.image_url && (
                        <Button type="button" variant="outline" onClick={() => setFormData({ ...formData, image_url: '' })}>
                          Hapus Gambar
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Maksimal 512×512 px. Disimpan sebagai WebP terkompres.</p>
                </div>
                <div>
                  <Label>Satuan</Label>
                  <Select
                    value={String(formData.default_unit || '')}
                    onValueChange={(val) => {
                      const unit = String(val || '').trim().toUpperCase() || 'PCS';
                      if (unit === 'DUS' && (Number(formData.pcs_per_dus || 1) || 1) <= 1) {
                        setFormData({ ...formData, default_unit: val, pcs_per_dus: 12 });
                        return;
                      }
                      setFormData({ ...formData, default_unit: val });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Pilih satuan" /></SelectTrigger>
                    <SelectContent>
                      {(units && units.length > 0
                        ? units.map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)
                        : [
                            <SelectItem key="PCS" value="PCS">PCS</SelectItem>,
                            <SelectItem key="DUS" value="DUS">DUS</SelectItem>
                          ]
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Satuan & Konversi</CardTitle></CardHeader>
                <CardContent>
                  <div>
                    <Label>{`Jumlah PCS per ${String(formData.default_unit || 'UNIT').toUpperCase()}`}</Label>
                    <Input
                      type="number"
                      value={formData.pcs_per_dus}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const per = Number(e.target.value);
                        const currentDus = Number(formData.buy_price_dus || 0);
                        const pcs = per > 0 && currentDus > 0 ? Number((currentDus / per).toFixed(2)) : formData.buy_price_pcs;
                        setFormData({ ...formData, pcs_per_dus: per, buy_price_pcs: pcs });
                      }}
                      min={String(formData.default_unit || 'PCS').trim().toUpperCase() === 'PCS' ? 1 : 2}
                    />
                    <p className="text-xs text-slate-500 mt-1">{`1 ${String(formData.default_unit || 'UNIT').toUpperCase()} = ${formData.pcs_per_dus} PCS`}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Harga</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {(() => {
                    const raw = String(formData.default_unit || '').trim();
                    const unit = (raw || 'PCS').toUpperCase();
                    const showUnit = unit !== 'PCS';
                    const labelUnit = showUnit ? raw : 'DUS';
                    return showUnit ? (
                      <div>
                        <Label>{`Harga Beli (${labelUnit})`}</Label>
                        <Input
                          type="number"
                          value={formData.buy_price_dus}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            const per = Number(formData.pcs_per_dus || 1) || 1;
                            const pcs = per > 0 ? Number((val / per).toFixed(2)) : val;
                            setFormData({ ...formData, buy_price_dus: val, buy_price_pcs: pcs });
                          }}
                        />
                      </div>
                    ) : null;
                  })()}
                  <div>
                    <Label>Harga Beli (PCS)</Label>
                    <Input
                      type="number"
                      value={formData.buy_price_pcs}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, buy_price_pcs: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    {(() => {
                      const u = String(formData.default_unit || '').trim();
                      const unit = (u || 'PCS').toUpperCase();
                      const label = `Harga Jual (PCS)${unit === 'PCS' ? ' *' : ''}`;
                      return <Label>{label}</Label>;
                    })()}
                    <Input
                      type="number"
                      value={formData.sell_price_pcs}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, sell_price_pcs: Number(e.target.value) })}
                      required={String(formData.default_unit || '').trim().toUpperCase() === 'PCS' || String(formData.default_unit || '') === ''}
                    />
                  </div>
                  <div>
                    {(() => {
                      const raw = String(formData.default_unit || '').trim();
                      const unit = (raw || 'PCS').toUpperCase();
                      let labelUnit = 'DUS';
                      if (unit !== 'PCS' && unit !== 'DUS') {
                        labelUnit = raw;
                      }
                      const isRequired = unit === 'DUS' || (unit !== 'PCS' && unit !== 'DUS' && raw !== '');
                      const label = `Harga Jual (${labelUnit})${isRequired ? ' *' : ''}`;
                      return <Label>{label}</Label>;
                    })()}
                    <Input
                      type="number"
                      value={formData.sell_price_dus}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setFormData({ ...formData, sell_price_dus: Number(e.target.value) })}
                      required={(() => {
                        const raw = String(formData.default_unit || '').trim();
                        const unit = (raw || 'PCS').toUpperCase();
                        return unit === 'DUS' || (unit !== 'PCS' && unit !== 'DUS' && raw !== '');
                      })()}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Stok</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  {(() => {
                    const per = Number(formData.pcs_per_dus || 1);
                    const raw = String(formData.default_unit || '').trim();
                    const unit = raw ? raw.toUpperCase() : (per > 1 ? 'DUS' : 'PCS');
                    const showPack = per > 1 && unit !== 'PCS';
                    if (showPack) {
                      const startUnitQty = Math.floor((formData.stock_pcs || 0) / per);
                      const startRem = (formData.stock_pcs || 0) % per;
                      const minUnitQty = Math.floor((formData.min_stock_pcs || 0) / per);
                      const minRem = (formData.min_stock_pcs || 0) % per;
                      return (
                        <>
                          <div className="space-y-2">
                            <Label>{`Stok Awal (${unit})`}</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={startUnitQty}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const q = Number(e.target.value);
                                  const r = (formData.stock_pcs || 0) % per;
                                  setFormData({ ...formData, stock_pcs: q * per + r });
                                }}
                                min="0"
                                className="w-28"
                              />
                              <span className="text-slate-500">+ PCS</span>
                              <Input
                                type="number"
                                value={startRem}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  let r = Number(e.target.value);
                                  if (r < 0) r = 0;
                                  if (r > per - 1) r = per - 1;
                                  const q = Math.floor((formData.stock_pcs || 0) / per);
                                  setFormData({ ...formData, stock_pcs: q * per + r });
                                }}
                                min="0"
                                max={per - 1}
                                className="w-28"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>{`Stok Minimum (${unit})`}</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={minUnitQty}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  const q = Number(e.target.value);
                                  const r = (formData.min_stock_pcs || 0) % per;
                                  setFormData({ ...formData, min_stock_pcs: q * per + r });
                                }}
                                min="0"
                                className="w-28"
                              />
                              <span className="text-slate-500">+ PCS</span>
                              <Input
                                type="number"
                                value={minRem}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  let r = Number(e.target.value);
                                  if (r < 0) r = 0;
                                  if (r > per - 1) r = per - 1;
                                  const q = Math.floor((formData.min_stock_pcs || 0) / per);
                                  setFormData({ ...formData, min_stock_pcs: q * per + r });
                                }}
                                min="0"
                                max={per - 1}
                                className="w-28"
                              />
                            </div>
                          </div>
                        </>
                      );
                    }
                    return (
                      <>
                        <div>
                          <Label>{`Stok Awal (${unit})`}</Label>
                          <Input
                            type="number"
                            value={formData.stock_pcs}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setFormData({ ...formData, stock_pcs: Number(e.target.value) })}
                            min="0"
                          />
                        </div>
                        <div>
                          <Label>{`Stok Minimum (${unit})`}</Label>
                          <Input
                            type="number"
                            value={formData.min_stock_pcs}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setFormData({ ...formData, min_stock_pcs: Number(e.target.value) })}
                            min="0"
                          />
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {lowStockProducts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-medium">{lowStockProducts.length} produk stok menipis</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="pl-9" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barcode</TableHead>
              <TableHead>Nama Produk</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Harga Jual</TableHead>
              <TableHead>Stok</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-mono">{product.barcode || '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded object-cover border" />
                    ) : (
                      <div className="w-10 h-10 rounded border flex items-center justify-center text-slate-400">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{product.name}</p>
                      {product.brand && <p className="text-xs text-slate-500">{product.brand}</p>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{product.category || '-'}</TableCell>
                <TableCell>
                  {(() => {
                    const per = Number(product.pcs_per_dus || 1);
                    const raw = String(product.default_unit || '').trim();
                    const packLabel = raw ? raw.toUpperCase() : (per > 1 ? 'DUS' : 'PCS');
                    const showPackRow = (packLabel !== 'PCS') || (per > 1);
                    return (
                      <div className="text-sm">
                        <p>PCS: Rp {Number(product.sell_price_pcs ?? 0).toLocaleString('id-ID')}</p>
                        {showPackRow && (
                          <p className="text-slate-500">{packLabel}: Rp {Number(product.sell_price_dus ?? 0).toLocaleString('id-ID')}</p>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <StockDisplay stockPcs={product.stock_pcs} pcsPerDus={product.pcs_per_dus} minStock={product.min_stock_pcs} unitName={product.default_unit || 'PCS'} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      runWithRoleGuard(() => handleEdit(product));
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { setLabelProduct(product); setShowLabel(true); }}
                    title="Cetak Label"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => {
                    if (!confirm('Hapus produk ini?')) return;
                    runWithRoleGuard((overrideToken) => {
                      deleteMutation.mutate({ id: product.id, overrideToken });
                    });
                  }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <BarcodeLabelPrint
        open={showLabel}
        onOpenChange={setShowLabel}
        product={labelProduct}
      />

      <Dialog open={showAdminAuth} onOpenChange={setShowAdminAuth}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Otorisasi Admin</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const res = await base44.auth.adminOverride(adminUsername, adminPassword);
                const token = res?.override_token;
                if (!token) {
                  toast.error('Otorisasi admin gagal');
                  return;
                }
                setAdminOverrideToken(token);
                setAdminOverrideExp(Number(res?.expires_at || 0) || (Date.now() + 5 * 60 * 1000));
                const action = pendingAction;
                setShowAdminAuth(false);
                setPendingAction(null);
                setAdminPassword('');
                if (typeof action === 'function') {
                  await action(token);
                }
              } catch (err) {
                toast.error(err?.message || 'Otorisasi admin gagal');
              }
            }}
          >
            <div>
              <Label>Username Admin</Label>
              <Input value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Password Admin</Label>
              <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setShowAdminAuth(false); setPendingAction(null); setAdminPassword(''); }}>
                Batal
              </Button>
              <Button type="submit">Otorisasi</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
