import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Building2, Phone, MapPin, Upload, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from 'xlsx';

const emptySupplier = { name: '', phone: '', address: '', total_debt: 0 };

export default function Supplier() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptySupplier);
  const importInputRef = useRef(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list('-created_date'),
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.list('-purchase_date'),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing 
      ? base44.entities.Supplier.update(editing.id, data)
      : base44.entities.Supplier.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setShowDialog(false);
      setEditing(null);
      setFormData(emptySupplier);
      toast.success(editing ? 'Supplier diperbarui!' : 'Supplier ditambahkan!');
    },
    onError: (error) => {
      toast.error(error?.message || 'Gagal menyimpan supplier');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Supplier.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier dihapus!');
    }
  });

  const handleEdit = (supplier) => {
    setEditing(supplier);
    setFormData(supplier);
    setShowDialog(true);
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.phone?.includes(search)
  );

  const getSupplierStats = (supplierId) => {
    const supplierPurchases = purchases.filter(p => p.supplier_id === supplierId);
    return {
      totalPurchases: supplierPurchases.length,
      totalAmount: supplierPurchases.reduce((sum, p) => sum + (p.total || 0), 0)
    };
  };

  const normalizeKey = (k) => String(k || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const onImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!rows || rows.length === 0) {
        toast.error('File kosong atau tidak valid');
        return;
      }
      const payloads = rows.map(row => {
        const nk = {};
        for (const k of Object.keys(row)) nk[normalizeKey(k)] = row[k];
        return {
          name: String(nk['nama'] ?? nk['name'] ?? '').trim(),
          phone: String(nk['kontak'] ?? nk['telp'] ?? nk['phone'] ?? '').trim(),
          address: String(nk['alamat'] ?? nk['address'] ?? '').trim(),
          total_debt: Number(nk['utang'] ?? nk['total_debt'] ?? 0) || 0
        };
      }).filter(p => p.name && p.name.length > 0);
      if (payloads.length === 0) {
        toast.error('Tidak ada baris valid (kolom Nama wajib diisi)');
        return;
      }
      let created = 0;
      let updated = 0;
      for (const s of payloads) {
        const existing = suppliers.find(x => (s.phone && x.phone && x.phone === s.phone) || (x.name && x.name.toLowerCase() === s.name.toLowerCase()));
        if (existing) {
          await base44.entities.Supplier.update(existing.id, s);
          updated += 1;
        } else {
          await base44.entities.Supplier.create(s);
          created += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(`Import selesai: ${created} tambah, ${updated} update`);
    } catch {
      toast.error('Gagal import Excel');
    }
  };

  const downloadSupplierTemplate = () => {
    const headers = ['Nama', 'Kontak', 'Alamat', 'Utang'];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier');
    XLSX.writeFile(wb, 'template-supplier.xlsx');
  };

  const waLink = (phone) => {
    if (!phone) return null;
    const digits = String(phone).replace(/\D+/g, '');
    if (!digits) return null;
    const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : (digits.startsWith('62') ? digits : digits);
    return `https://wa.me/${normalized}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Manajemen Supplier</h1>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFileChange} className="hidden" />
          <Button variant="outline" onClick={() => importInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Import Excel</Button>
          <Button variant="outline" onClick={downloadSupplierTemplate}><Download className="w-4 h-4 mr-2" />Unduh Template</Button>
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) { setEditing(null); setFormData(emptySupplier); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Tambah Supplier</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Supplier' : 'Tambah Supplier Baru'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
              <div>
                <Label>Nama *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>Kontak</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  {waLink(formData.phone) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(waLink(formData.phone), '_blank', 'noopener')}
                      aria-label="WhatsApp"
                      className="text-green-600"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <Label>Alamat</Label>
                <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} />
              </div>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari supplier..." className="pl-9" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Total Pembelian</TableHead>
              <TableHead>Total Nilai</TableHead>
              <TableHead>Utang</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSuppliers.map((supplier) => {
              const stats = getSupplierStats(supplier.id);
              return (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-purple-600" />
                      </div>
                      <span className="font-medium">{supplier.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {supplier.phone && (
                        <p className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{supplier.phone}</span>
                          {waLink(supplier.phone) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(waLink(supplier.phone), '_blank', 'noopener')}
                              className="ml-1 text-green-600"
                              aria-label="WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </p>
                      )}
                      {supplier.address && <p className="flex items-center gap-1 text-slate-500"><MapPin className="w-3 h-3" />{supplier.address}</p>}
                    </div>
                  </TableCell>
                  <TableCell>{stats.totalPurchases} transaksi</TableCell>
                  <TableCell>Rp {stats.totalAmount.toLocaleString('id-ID')}</TableCell>
                  <TableCell>
                    {supplier.total_debt > 0 ? (
                      <span className="text-red-600 font-medium">Rp {supplier.total_debt?.toLocaleString('id-ID')}</span>
                    ) : (
                      <span className="text-green-600">Lunas</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(supplier)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => {
                      if (confirm('Hapus supplier ini?')) deleteMutation.mutate(supplier.id);
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
