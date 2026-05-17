import React, { useEffect, useState } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";
import { getSettings, saveSettings, resetSettings } from '@/lib/settings';
import { useAuth } from '@/lib/AuthContext.jsx';
import { base44 } from '@/api/base44Client';

export default function Pengaturan() {
  const [form, setForm] = useState(getSettings());
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const [subs, setSubs] = useState(null);
  const [currentSub, setCurrentSub] = useState(null);
  const [subsLoading, setSubsLoading] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);

  const handleLogoFile = async (file) => {
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
      const compressed = canvas.toDataURL('image/png', 0.9);
      setForm({ ...form, logo_url: compressed });
      toast.success('Logo berhasil diunggah');
    } catch {
      toast.error('Gagal memproses gambar logo');
    }
  };

  useEffect(() => {
    setForm(getSettings());
    const loadSubs = async () => {
      try {
        setSubsLoading(true);
        const s = await base44.subscription.status();
        setSubs(s);
        const cur = await base44.subscription.current();
        setCurrentSub(cur);
      } catch {
        setSubs(null);
        setCurrentSub(null);
      } finally {
        setSubsLoading(false);
      }
    };
    loadSubs().catch(() => {});
  }, []);

  const onSave = (e) => {
    e.preventDefault();
    setSaving(true);
    const next = saveSettings(form);
    setForm(next);
    setSaving(false);
    toast.success('Pengaturan disimpan');
  };

  const onReset = () => {
    const next = resetSettings();
    setForm(next);
    toast.success('Pengaturan dikembalikan ke default');
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Pengaturan Sistem</h1>
      <form onSubmit={onSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
        <Accordion type="multiple" defaultValue={['identitas','penjualan']} className="bg-white dark:bg-slate-900 border rounded-md divide-y">
          {['license_admin','admin','superadmin'].includes(user?.role) && (
            <AccordionItem value="lisensi">
              <AccordionTrigger className="px-4">Lisensi & Masa Aktif</AccordionTrigger>
              <AccordionContent className="px-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-md">
                    <p className="font-medium">Status Saat Ini</p>
                    <div className="mt-2 text-sm">
                      {subsLoading ? (
                        <p>Memuat status...</p>
                      ) : subs ? (
                        <>
                          <p>Paket: <span className="font-bold text-primary">{subs.package_name || 'Basic'}</span></p>
                          <p>Status: <span className="font-semibold">{subs.status}</span></p>
                          <p>Berlaku sampai: <span className="font-semibold">{subs.valid_until ? new Date(subs.valid_until).toLocaleString('id-ID') : '-'}</span></p>
                          <p>Sisa hari: <span className="font-semibold">{subs.days_left ?? '-'}</span></p>
                          {typeof subs.days_left === 'number' && subs.days_left <= 7 && subs.days_left >= 0 && (
                            <p className="mt-2 text-red-600">Masa aktif tinggal {subs.days_left} hari, segera melakukan perpanjangan.</p>
                          )}
                        </>
                      ) : (
                        <p>Tidak ada data masa aktif</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={async () => {
                        try {
                          setSubsLoading(true);
                          const s = await base44.subscription.status();
                          setSubs(s);
                          const cur = await base44.subscription.current();
                          setCurrentSub(cur);
                          toast.success('Status diperbarui');
                        } catch (e) {
                          toast.error(e?.message || 'Gagal memuat status');
                        } finally {
                          setSubsLoading(false);
                        }
                      }}
                    >
                      Muat Ulang Status
                    </Button>
                    
                  </div>
                  
                  <div className="p-4 border rounded-md">
                    <p className="font-medium">Aktivasi Lisensi</p>
                    <div className="mt-2 space-y-3">
                      <div>
                        <Label>License Key</Label>
                        <Input value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="Masukkan lisensi" />
                      </div>
                      <Button
                        type="button"
                        disabled={activating || !licenseKey}
                        onClick={async () => {
                          try {
                            setActivating(true);
                            const r = await base44.license.activate({ license_key: licenseKey });
                            const s = await base44.subscription.status();
                            setSubs(s);
                            toast.success('Lisensi diaktifkan');
                          } catch (e) {
                            toast.error(e?.message || 'Gagal aktivasi lisensi');
                          } finally {
                            setActivating(false);
                          }
                        }}
                      >
                        Aktifkan Lisensi
                      </Button>
                      {subs && (
                        <div className="text-sm">
                          <p>Paket: <span className="font-bold text-primary">{subs.package_name || 'Basic'}</span></p>
                          <p>Status: <span className="font-semibold">{subs.status}</span></p>
                          <p>Berlaku sampai: <span className="font-semibold">{subs.valid_until ? new Date(subs.valid_until).toLocaleString('id-ID') : '-'}</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
          <AccordionItem value="identitas">
            <AccordionTrigger className="px-4">Identitas Toko</AccordionTrigger>
            <AccordionContent className="px-4 space-y-4">
              <div>
                <Label>Nama Toko</Label>
                <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} />
              </div>
              <div>
                <Label>Alamat</Label>
                <Input value={form.store_address} onChange={(e) => setForm({ ...form, store_address: e.target.value })} />
              </div>
              <div>
                <Label>No. Telepon</Label>
                <Input value={form.store_phone} onChange={(e) => setForm({ ...form, store_phone: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={form.store_email || ''} onChange={(e) => setForm({ ...form, store_email: e.target.value })} />
              </div>
              <div>
                <Label>Fax</Label>
                <Input value={form.store_fax || ''} onChange={(e) => setForm({ ...form, store_fax: e.target.value })} />
              </div>
              <div>
                <Label>NPWP</Label>
                <Input value={form.store_npwp || ''} onChange={(e) => setForm({ ...form, store_npwp: e.target.value })} />
              </div>
              <div>
                <Label>Izin Usaha</Label>
                <Input value={form.store_business_license || ''} onChange={(e) => setForm({ ...form, store_business_license: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Logo (Upload Gambar)</Label>
                {form.logo_url && (
                  <div className="flex items-center gap-3">
                    <img src={form.logo_url} alt="logo" className="h-12 w-12 object-contain border rounded bg-white" />
                    <Button variant="outline" onClick={() => setForm({ ...form, logo_url: '' })}>Hapus Logo</Button>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />
                <p className="text-xs text-slate-500">Maksimal 512×512 px, akan dikompresi otomatis.</p>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="penjualan">
            <AccordionTrigger className="px-4">Penjualan</AccordionTrigger>
            <AccordionContent className="px-4 space-y-4">
              <div>
                <Label>Diskon Default</Label>
                <div className="flex gap-2">
                  <Select value={form.default_discount_type} onValueChange={(v) => setForm({ ...form, default_discount_type: v })}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nominal">Rp</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={form.default_discount_value}
                    onChange={(e) => setForm({ ...form, default_discount_value: Number(e.target.value) })}
                    placeholder="Nilai"
                  />
                </div>
              </div>
              <div>
                <Label>Pajak Default (%)</Label>
                <Input
                  type="number"
                  value={form.default_tax_percent}
                  onChange={(e) => setForm({ ...form, default_tax_percent: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Metode Pembayaran Default</Label>
                <Select value={form.default_payment_method} onValueChange={(v) => setForm({ ...form, default_payment_method: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tunai</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                    <SelectItem value="tempo">Tempo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </AccordionContent>
          </AccordionItem>
          
          
        </Accordion>
        </div>

        <div className="space-y-6">
        <Accordion type="multiple" defaultValue={['cetak','tampilan']} className="bg-white dark:bg-slate-900 border rounded-md divide-y">
          <AccordionItem value="cetak">
            <AccordionTrigger className="px-4">Cetak</AccordionTrigger>
            <AccordionContent className="px-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Tampilkan Area Tanda Tangan di Faktur</p>
                  <p className="text-sm text-slate-500">Dua kolom: Penerima & Yang Menerima</p>
                </div>
                <Switch
                  checked={!!form.show_invoice_signatures}
                  onCheckedChange={(v) => setForm({ ...form, show_invoice_signatures: v })}
                />
              </div>
              <div>
                <Label>Footer Struk</Label>
                <Input value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} />
              </div>
              <div>
                <Label>Footer Faktur</Label>
                <Input value={form.invoice_footer} onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tampilan">
            <AccordionTrigger className="px-4">Tampilan</AccordionTrigger>
            <AccordionContent className="px-4 space-y-4">
              <div>
                <Label>Tema Default</Label>
                <Select value={form.theme} onValueChange={(v) => setForm({ ...form, theme: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistem</SelectItem>
                    <SelectItem value="light">Terang</SelectItem>
                    <SelectItem value="dark">Gelap</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Warna Utama</Label>
                <Select value={form.primary_color} onValueChange={(v) => setForm({ ...form, primary_color: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="violet">Violet</SelectItem>
                    <SelectItem value="blue">Biru</SelectItem>
                    <SelectItem value="emerald">Hijau</SelectItem>
                    <SelectItem value="amber">Amber</SelectItem>
                    <SelectItem value="rose">Merah Muda</SelectItem>
                    <SelectItem value="cyan">Cyan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Warna Aksen</Label>
                <Select value={form.accent_color} onValueChange={(v) => setForm({ ...form, accent_color: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="violet">Violet</SelectItem>
                    <SelectItem value="blue">Biru</SelectItem>
                    <SelectItem value="emerald">Hijau</SelectItem>
                    <SelectItem value="amber">Amber</SelectItem>
                    <SelectItem value="rose">Merah Muda</SelectItem>
                    <SelectItem value="cyan">Cyan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Radius Sudut</Label>
                <Select value={form.border_radius} onValueChange={(v) => setForm({ ...form, border_radius: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sm">Kecil</SelectItem>
                    <SelectItem value="md">Sedang</SelectItem>
                    <SelectItem value="lg">Besar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sidebar Tersembunyi Saat Mulai</p>
                  <p className="text-sm text-slate-500">Sidebar dalam keadaan collapse saat aplikasi dibuka</p>
                </div>
                <Switch
                  checked={!!form.sidebar_collapsed}
                  onCheckedChange={(v) => setForm({ ...form, sidebar_collapsed: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Mode Mobile</p>
                  <p className="text-sm text-slate-500">Optimasi tampilan untuk layar ponsel</p>
                </div>
                <Switch
                  checked={!!form.mobile_mode}
                  onCheckedChange={(v) => setForm({ ...form, mobile_mode: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Mode Ringkas (Compact)</p>
                  <p className="text-sm text-slate-500">Jarak elemen lebih rapat, tinggi bar lebih pendek</p>
                </div>
                <Switch
                  checked={!!form.compact_mode}
                  onCheckedChange={(v) => setForm({ ...form, compact_mode: v })}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="scanner">
            <AccordionTrigger className="px-4">Scanner Barcode</AccordionTrigger>
            <AccordionContent className="px-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Global Scanner Listener</p>
                  <p className="text-sm text-slate-500">Scan barcode otomatis tanpa klik kotak pencarian</p>
                </div>
                <Switch
                  checked={!!form.scanner_global_listener}
                  onCheckedChange={(v) => setForm({ ...form, scanner_global_listener: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Auto Focus Pencarian</p>
                  <p className="text-sm text-slate-500">Fokus otomatis ke kolom cari setelah scan/tambah barang</p>
                </div>
                <Switch
                  checked={!!form.scanner_auto_focus}
                  onCheckedChange={(v) => setForm({ ...form, scanner_auto_focus: v })}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
          
        </Accordion>
        </div>

        <div className="lg:col-span-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onReset}>
            Kembalikan Default
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </Button>
        </div>
      </form>
    </div>
  );
}
