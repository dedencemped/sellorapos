import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, User, Phone, MapPin, Upload, Download, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from 'xlsx';

const emptyCustomer = { name: '', phone: '', address: '', total_debt: 0 };

export default function Pelanggan() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptyCustomer);
  const importInputRef = useRef(null);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list('-created_date'),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-sale_date'),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing 
      ? base44.entities.Customer.update(editing.id, data)
      : base44.entities.Customer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowDialog(false);
      setEditing(null);
      setFormData(emptyCustomer);
      toast.success(editing ? 'Pelanggan diperbarui!' : 'Pelanggan ditambahkan!');
    },
    onError: (error) => {
      toast.error(error?.message || 'Gagal menyimpan pelanggan');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Customer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Pelanggan dihapus!');
    }
  });

  const handleEdit = (customer) => {
    setEditing(customer);
    setFormData(customer);
    setShowDialog(true);
  };

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const getCustomerStats = (customerId) => {
    const customerSales = sales.filter(s => s.customer_id === customerId);
    return {
      totalTransactions: customerSales.length,
      totalSpent: customerSales.reduce((sum, s) => sum + (s.total || 0), 0)
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
          phone: String(nk['no_hp'] ?? nk['telp'] ?? nk['phone'] ?? '').trim(),
          address: String(nk['alamat'] ?? nk['address'] ?? '').trim(),
          total_debt: Number(nk['piutang'] ?? nk['total_debt'] ?? 0) || 0
        };
      }).filter(p => p.name && p.name.length > 0);
      if (payloads.length === 0) {
        toast.error('Tidak ada baris valid (kolom Nama wajib diisi)');
        return;
      }
      let created = 0;
      let updated = 0;
      for (const c of payloads) {
        const existing = customers.find(x => (c.phone && x.phone && x.phone === c.phone) || (x.name && x.name.toLowerCase() === c.name.toLowerCase()));
        if (existing) {
          await base44.entities.Customer.update(existing.id, c);
          updated += 1;
        } else {
          await base44.entities.Customer.create(c);
          created += 1;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Import selesai: ${created} tambah, ${updated} update`);
    } catch {
      toast.error('Gagal import Excel');
    }
  };

  const downloadCustomerTemplate = () => {
    const headers = ['Nama', 'No HP', 'Alamat', 'Piutang'];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pelanggan');
    XLSX.writeFile(wb, 'template-pelanggan.xlsx');
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
        <h1 className="text-2xl font-bold">Manajemen Pelanggan</h1>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".xlsx,.xls" onChange={onImportFileChange} className="hidden" />
          <Button variant="outline" onClick={() => importInputRef.current?.click()}><Upload className="w-4 h-4 mr-2" />Import Excel</Button>
          <Button variant="outline" onClick={downloadCustomerTemplate}><Download className="w-4 h-4 mr-2" />Unduh Template</Button>
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) { setEditing(null); setFormData(emptyCustomer); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Tambah Pelanggan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
              <div>
                <Label>Nama *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>No HP</Label>
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
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari pelanggan..." className="pl-9" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Total Transaksi</TableHead>
              <TableHead>Total Belanja</TableHead>
              <TableHead>Piutang</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map((customer) => {
              const stats = getCustomerStats(customer.id);
              return (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="font-medium">{customer.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {customer.phone && (
                        <p className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <span>{customer.phone}</span>
                          {waLink(customer.phone) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(waLink(customer.phone), '_blank', 'noopener')}
                              className="ml-1 text-green-600"
                              aria-label="WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </p>
                      )}
                      {customer.address && <p className="flex items-center gap-1 text-slate-500"><MapPin className="w-3 h-3" />{customer.address}</p>}
                    </div>
                  </TableCell>
                  <TableCell>{stats.totalTransactions} transaksi</TableCell>
                  <TableCell>Rp {stats.totalSpent.toLocaleString('id-ID')}</TableCell>
                  <TableCell>
                    {customer.total_debt > 0 ? (
                      <span className="text-red-600 font-medium">Rp {customer.total_debt?.toLocaleString('id-ID')}</span>
                    ) : (
                      <span className="text-green-600">Lunas</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(customer)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => {
                      if (confirm('Hapus pelanggan ini?')) deleteMutation.mutate(customer.id);
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
