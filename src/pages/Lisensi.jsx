import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext.jsx';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function Lisensi() {
  const { user } = useAuth();
  const [subs, setSubs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('1-bulan');
  const [customMonths, setCustomMonths] = useState(1);
  const [paymentDate, setPaymentDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const s = await base44.subscription.status();
        setSubs(s);
      } catch (e) {
        setSubs(null);
      } finally {
        setLoading(false);
      }
    };
    load().catch(() => {});
  }, []);

  if (user?.role !== 'license_admin') {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Lisensi & Masa Aktif</h1>
        <p className="mt-2 text-slate-600">Halaman ini hanya untuk user dengan role license_admin.</p>
      </div>
    );
  }

  const onSave = async () => {
    try {
      setLoading(true);
      const payload = { plan, payment_date: paymentDate };
      if (plan === 'custom') payload.months = Number(customMonths || 0);
      await base44.subscription.purchase(payload);
      const s = await base44.subscription.status();
      setSubs(s);
      toast.success('Masa aktif diperbarui');
    } catch (e) {
      toast.error(e?.message || 'Gagal menyimpan masa aktif');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Lisensi & Masa Aktif</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-white dark:bg-slate-900 border rounded-md space-y-3">
          <p className="font-medium">Status Saat Ini</p>
          {loading ? (
            <p>Memuat...</p>
          ) : subs ? (
            <>
              <p>Status: <span className="font-semibold">{subs.status}</span></p>
              <p>Berlaku sampai: <span className="font-semibold">{subs.valid_until ? new Date(subs.valid_until).toLocaleString('id-ID') : '-'}</span></p>
              <p>Sisa hari: <span className="font-semibold">{subs.days_left ?? '-'}</span></p>
            </>
          ) : (
            <p>Tidak ada data masa aktif</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                setLoading(true);
                const s = await base44.subscription.status();
                setSubs(s);
                toast.success('Status diperbarui');
              } catch (e) {
                toast.error(e?.message || 'Gagal memuat status');
              } finally {
                setLoading(false);
              }
            }}
          >
            Muat Ulang Status
          </Button>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border rounded-md space-y-3">
          <p className="font-medium">Tambah Masa Aktif</p>
          <div>
            <Label>Paket</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1-bulan">1 Bulan</SelectItem>
                <SelectItem value="6-bulan">6 Bulan</SelectItem>
                <SelectItem value="1-tahun">1 Tahun</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {plan === 'custom' && (
            <div>
              <Label>Jumlah Bulan</Label>
              <Input
                type="number"
                min={1}
                value={customMonths}
                onChange={(e) => setCustomMonths(Number(e.target.value))}
              />
            </div>
          )}
          <div>
            <Label>Tanggal Pembayaran</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <Button type="button" onClick={onSave} disabled={loading}>
            {loading ? 'Menyimpan...' : 'Simpan Masa Aktif'}
          </Button>
        </div>
      </div>
    </div>
  );
}
