import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from 'sonner';

const emptyBranch = { name: '', code: '', address: '' };

export default function Cabang() {
  const qc = useQueryClient();
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => base44.branches.list()
  });

  const [form, setForm] = useState({ ...emptyBranch });
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const createMutation = useMutation({
    mutationFn: async (payload) => base44.branches.create(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Cabang berhasil ditambahkan');
      setForm({ ...emptyBranch });
    },
    onError: () => toast.error('Gagal menambahkan cabang')
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => base44.branches.update(id, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Cabang diperbarui');
      setEditOpen(false);
      setEditing(null);
    },
    onError: () => toast.error('Gagal memperbarui cabang')
  });
  const deleteMutation = useMutation({
    mutationFn: async (id) => base44.branches.delete(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Cabang dihapus');
    },
    onError: (e) => toast.error(e?.message || 'Gagal menghapus cabang')
  });

  const submitCreate = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Nama cabang wajib diisi');
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      code: form.code?.trim() || null,
      address: form.address?.trim() || null
    });
  };

  const openEdit = (b) => {
    setEditing(b);
    setEditOpen(true);
  };
  const submitEdit = async () => {
    if (!editing?.name?.trim()) {
      toast.error('Nama cabang wajib diisi');
      return;
    }
    updateMutation.mutate({
      id: editing.id,
      payload: {
        name: editing.name?.trim(),
        code: editing.code?.trim() || null,
        address: editing.address?.trim() || null
      }
    });
  };
  const remove = (b) => {
    if (Number(b.id) === 1) {
      toast.error('Cabang default tidak dapat dihapus');
      return;
    }
    if (!window.confirm(`Hapus cabang "${b.name}"?`)) return;
    deleteMutation.mutate(b.id);
  };

  const columns = useMemo(() => [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Nama' },
    { key: 'code', label: 'Kode' },
    { key: 'address', label: 'Alamat' }
  ], []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Manajemen Cabang</h1>
        <p className="text-slate-500">Kelola cabang toko: tambah, ubah, dan hapus.</p>
      </div>

      <Card className="p-4">
        <form onSubmit={submitCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <Label>Nama</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Kode</Label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Alamat</Label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full h-[38px] min-h-[38px] px-3 py-2 border rounded-md text-sm bg-transparent"
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <Button type="submit" disabled={createMutation.isPending}>Tambah Cabang</Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(c => (<TableHead key={c.key}>{c.label}</TableHead>))}
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(branches || []).map((b) => (
              <TableRow key={b.id}>
                <TableCell>{b.id}</TableCell>
                <TableCell>{b.name}</TableCell>
                <TableCell>{b.code || '-'}</TableCell>
                <TableCell>{b.address || '-'}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Dialog open={editOpen && editing?.id === b.id} onOpenChange={(v) => { if (!v) setEditOpen(false); }}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="sm" onClick={() => openEdit(b)}>Edit</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Cabang</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Nama</Label>
                          <Input value={editing?.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                        </div>
                        <div>
                          <Label>Kode</Label>
                          <Input value={editing?.code || ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                        </div>
                        <div>
                          <Label>Alamat</Label>
                          <textarea
                            value={editing?.address || ''}
                            onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                            className="w-full h-24 px-3 py-2 border rounded-md text-sm bg-transparent"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setEditOpen(false)}>Batal</Button>
                          <Button onClick={submitEdit} disabled={updateMutation.isPending}>Simpan</Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button variant="destructive" size="sm" onClick={() => remove(b)} disabled={Number(b.id) === 1 || deleteMutation.isPending}>
                    Hapus
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
