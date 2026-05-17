import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const emptyUser = { username: '', full_name: '', role: 'staf', password: '' };

export default function User() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState(emptyUser);
  const [branchIds, setBranchIds] = useState([]);
  const { data: branches = [] } = useQuery({
    queryKey: ['branches'],
    queryFn: () => base44.branches.list()
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date'),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        const payload = { username: data.username, full_name: data.full_name, role: data.role };
        if (data.password && data.password.length > 0) payload.password = data.password;
        return base44.entities.User.update(editing.id, payload);
      } else {
        return base44.entities.User.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowDialog(false);
      setEditing(null);
      setFormData(emptyUser);
      toast.success(editing ? 'User diperbarui!' : 'User ditambahkan!');
    },
    onError: (error) => {
      toast.error(error?.message || 'Gagal menyimpan user');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.User.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User dihapus!');
    }
  });

  const handleEdit = async (user) => {
    setEditing(user);
    setFormData({ username: user.username, full_name: user.full_name, role: user.role, password: '' });
    try {
      const list = await base44.userBranches.get(user.id);
      setBranchIds(Array.isArray(list) ? list.map(String) : []);
    } catch {
      setBranchIds([]);
    }
    setShowDialog(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(formData, {
      onSuccess: async (res) => {
        try {
          const uid = editing ? editing.id : (res?.id || null);
          if (uid) {
            await base44.userBranches.set(uid, branchIds.map(id => Number(id)));
          }
        } catch {}
      }
    });
  };

  const filteredUsers = users.filter(u => {
    const role = (u.role || '').toLowerCase();
    if (['superadmin', 'license_admin'].includes(role)) return false;
    return u.username?.toLowerCase().includes(search.toLowerCase()) ||
           u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
           u.role?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Manajemen User</h1>
        <Dialog open={showDialog} onOpenChange={(open) => {
          setShowDialog(open);
          if (!open) { setEditing(null); setFormData(emptyUser); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Tambah User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit User' : 'Tambah User Baru'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Username *</Label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Nama Lengkap *</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Peran *</Label>
                <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih peran" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="kasir">Kasir</SelectItem>
                    <SelectItem value="staf">Staf</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{editing ? 'Password (opsional, isi untuk ganti)' : 'Password *'}</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required={!editing}
                />
              </div>
              <div>
                <Label>Akses Cabang</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-auto pr-2">
                  {(branches || []).map(b => {
                    const id = String(b.id);
                    const checked = branchIds.includes(id);
                    return (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            if (v) setBranchIds(prev => Array.from(new Set([...prev, id])));
                            else setBranchIds(prev => prev.filter(x => x !== id));
                          }}
                        />
                        <span>{b.name || `Cabang ${id}`}</span>
                      </label>
                    );
                  })}
                </div>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari user..." className="pl-9" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Nama Lengkap</TableHead>
              <TableHead>Peran</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-mono flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-400" />
                  {user.username}
                </TableCell>
                <TableCell>{user.full_name}</TableCell>
                <TableCell className="capitalize">{user.role}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-red-500" onClick={() => {
                    if (confirm('Hapus user ini?')) deleteMutation.mutate(user.id);
                  }}>
                    <Trash2 className="w-4 h-4" />
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
