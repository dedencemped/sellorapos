import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext.jsx';
import { base44 } from '@/api/base44Client';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { getSettings } from '@/lib/settings';
import { renderReportPdf } from '@/utils/pdfReport';
import { Trash2, FileText } from "lucide-react";

export default function GenerateLisensi() {
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('trial');
  const [selectedPackage, setSelectedPackage] = useState('Basic');
  const [months, setMonths] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [payloadPreview, setPayloadPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [licenses, setLicenses] = useState([]);
  const [licensesLoading, setLicensesLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [price, setPrice] = useState('');

  useEffect(() => {
    try {
      const s = getSettings();
      setCompanyName(s.store_name || '');
      setAddress(s.store_address || '');
      setPhone(s.store_phone || '');
    } catch {}
    const loadLicenses = async () => {
      try {
        setLicensesLoading(true);
        const rows = await base44.license.list(20);
        setLicenses(Array.isArray(rows) ? rows : []);
      } catch {
        setLicenses([]);
      } finally {
        setLicensesLoading(false);
      }
    };
    loadLicenses().catch(() => {});
    const onSettings = (e) => {
      const s = e?.detail || getSettings();
      setCompanyName(s.store_name || '');
      setAddress(s.store_address || '');
      setPhone(s.store_phone || '');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('settings:updated', onSettings);
      return () => window.removeEventListener('settings:updated', onSettings);
    }
  }, []);

  const authorized = String(user?.role || '') === 'license_admin'

  const recomputeDates = (t, m, sDate) => {
    const sd = new Date(sDate);
    if (t === 'trial') {
      const ed = new Date(sd.getTime() + 14 * 24 * 60 * 60 * 1000);
      setEndDate(ed.toISOString().slice(0, 10));
    } else if (t === 'lifetime') {
      setEndDate('');
    } else {
      const ed = new Date(sd);
      ed.setMonth(ed.getMonth() + Number(m || 1));
      setEndDate(ed.toISOString().slice(0, 10));
    }
  };

  useEffect(() => {
    recomputeDates(type, months, startDate);
  }, [type, months, startDate]);

  const onGenerate = async () => {
    try {
      setLoading(true);
      const dataToSubmit = {
        company_name: companyName,
        email,
        phone,
        address,
        type,
        package_name: selectedPackage,
        package: selectedPackage,
        months: type === 'custom' ? Number(months || 0) : undefined,
        start_date: startDate,
        price: price ? Number(price) : undefined
      };
      console.log('Sending payload to server:', JSON.stringify(dataToSubmit));
      
      // Update local preview and license key before hitting API
      try {
        const obj = {
          ...dataToSubmit,
          end_date: endDate || null,
          price: price ? Number(price) : null,
          nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        };
        const json = JSON.stringify(obj);
        const enc = new TextEncoder().encode(json);
        const b64 = typeof window !== 'undefined' ? window.btoa(String.fromCharCode(...enc)) : '';
        if (b64) setLicenseKey(b64);
        setPayloadPreview(JSON.stringify(obj, null, 2));
      } catch (err) {
        console.error('Local preview error:', err);
      }

      const res = await base44.license.generate(dataToSubmit);
      setLicenseKey(String(res.license_key || ''));
      setSavedId(res.id || null);
      try {
        setLicensesLoading(true);
        const rows = await base44.license.list(20);
        setLicenses(Array.isArray(rows) ? rows : []);
      } catch {} finally {
        setLicensesLoading(false);
      }
      const preview = {
        company_name: companyName,
        email,
        phone,
        address,
        type,
        package_name: selectedPackage,
        start_date: res.start_date || startDate,
        end_date: res.end_date || endDate || null,
        status: res.status,
        license_key: res.license_key || ''
      };
      setPayloadPreview(JSON.stringify(preview, null, 2));
      toast.success('Lisensi berhasil dibuat dan disimpan');
    } catch (e) {
      toast.error(e?.message || 'Gagal membuat lisensi');
    } finally {
      setLoading(false);
    }
  };

  const onCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(licenseKey);
      } else {
        const ta = document.createElement('textarea');
        ta.value = licenseKey;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success('Kode lisensi disalin');
    } catch {
      toast.error('Gagal menyalin lisensi');
    }
  };

  const onReset = () => {
    setCompanyName('');
    setEmail('');
    setPhone('');
    setAddress('');
    setType('trial');
    setSelectedPackage('Basic');
    setMonths(1);
    const today = new Date().toISOString().slice(0, 10);
    setStartDate(today);
    setEndDate('');
    setLicenseKey('');
    setPayloadPreview('');
  };

  const onDownload = () => {
    try {
      const data = payloadPreview ? JSON.parse(payloadPreview) : {
        company_name: companyName,
        email,
        phone,
        address,
        type,
        start_date: startDate,
        end_date: endDate || null
      };
      const s = getSettings();
      const vf = data.start_date ? new Date(data.start_date) : null;
      const vu = data.end_date ? new Date(data.end_date) : null;
      const rows = [
        ['Nama Perusahaan', data.company_name || '-'],
        ['Email', data.email || '-'],
        ['Telepon', data.phone || '-'],
        ['Alamat', data.address || '-'],
        ['Paket', data.package_name || '-'],
        ['Tipe Lisensi', data.type || '-'],
        ['Tanggal Mulai', vf ? vf.toLocaleDateString('id-ID') : '-'],
        ['Tanggal Berakhir', vu ? vu.toLocaleDateString('id-ID') : (data.type === 'lifetime' ? 'Lifetime' : '-')],
        ['License Key', licenseKey || '-'],
      ];
      const pdf = renderReportPdf({
        title: 'FILE LISENSI APLIKASI',
        company: { name: s.store_name || 'Perusahaan Anda', address: s.store_address || '' },
        logoUrl: s.logo_url || null,
        table: { headers: ['Keterangan', 'Nilai'], rows }
      });
      pdf.save(`lisensi-${(data.company_name || 'unknown').replace(/\s+/g,'-').toLowerCase()}.pdf`);
      toast.success('Lisensi diunduh sebagai PDF');
    } catch (e) {
      toast.error(e?.message || 'Gagal membuat PDF lisensi');
    }
  };
  
  const onEditRow = async (lic) => {
    try {
      setActionLoadingId(lic.id);
      const company = window.prompt('Nama Perusahaan', lic.company_name || '') ?? lic.company_name;
      const email2 = window.prompt('Email', lic.email || '') ?? lic.email;
      const phone2 = window.prompt('No Telp/HP', lic.phone || '') ?? lic.phone;
      const addr2 = window.prompt('Alamat', lic.address || '') ?? lic.address;
      const payload = { company_name: company, email: email2, phone: phone2, address: addr2 };
      await base44.license.update(lic.id, payload);
      const rows = await base44.license.list(20);
      setLicenses(Array.isArray(rows) ? rows : []);
      toast.success('Lisensi diperbarui');
    } catch (e) {
      toast.error(e?.message || 'Gagal memperbarui lisensi');
    } finally {
      setActionLoadingId(null);
    }
  };
  
  const onDeleteRow = async (lic) => {
    try {
      const ok = window.confirm(`Hapus lisensi ID ${lic.id}?`);
      if (!ok) return;
      setActionLoadingId(lic.id);
      await base44.license.delete(lic.id);
      const rows = await base44.license.list(20);
      setLicenses(Array.isArray(rows) ? rows : []);
      toast.success('Lisensi dihapus');
    } catch (e) {
      toast.error(e?.message || 'Gagal menghapus lisensi');
    } finally {
      setActionLoadingId(null);
    }
  };
  
  const onPrintRow = (lic) => {
    try {
      const w = window.open('', '_blank', 'noopener,noreferrer');
      if (!w) throw new Error('Tidak bisa membuka jendela cetak');
      const html = `
        <html>
          <head>
            <title>Cetak Lisensi #${lic.id}</title>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; }
              h1 { font-size: 18px; margin-bottom: 12px; }
              table { border-collapse: collapse; width: 100%; }
              td { padding: 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
              .key { font-weight: bold; width: 160px; }
              .license { word-break: break-all; }
            </style>
          </head>
          <body>
            <h1>Detail Lisensi</h1>
            <table>
              <tr><td class="key">ID</td><td>${lic.id}</td></tr>
              <tr><td class="key">Perusahaan</td><td>${lic.company_name || '-'}</td></tr>
              <tr><td class="key">Email</td><td>${lic.email || '-'}</td></tr>
              <tr><td class="key">No Telp/HP</td><td>${lic.phone || '-'}</td></tr>
              <tr><td class="key">Alamat</td><td>${lic.address || '-'}</td></tr>
              <tr><td class="key">Paket</td><td>${lic.package_name || '-'}</td></tr>
              <tr><td class="key">Tipe</td><td>${lic.type || '-'}</td></tr>
              <tr><td class="key">Mulai</td><td>${lic.start_date ? new Date(lic.start_date).toLocaleDateString('id-ID') : '-'}</td></tr>
              <tr><td class="key">Berakhir</td><td>${lic.end_date ? new Date(lic.end_date).toLocaleDateString('id-ID') : '-'}</td></tr>
              <tr><td class="key">Status</td><td>${lic.status || '-'}</td></tr>
              <tr><td class="key">Harga</td><td>${lic.price != null ? 'Rp ' + Number(lic.price).toLocaleString('id-ID') : '-'}</td></tr>
              <tr><td class="key">License Key</td><td class="license">${lic.license_key || '-'}</td></tr>
            </table>
            <script>window.print();</script>
          </body>
        </html>
      `;
      w.document.write(html);
      w.document.close();
    } catch {
      toast.error('Gagal mencetak lisensi');
    }
  };
  const onInvoiceRow = (lic) => {
    try {
      const price = lic.price != null ? Number(lic.price) : null;
      const s = getSettings();
      const vf = lic.start_date ? new Date(lic.start_date) : null;
      const vu = lic.end_date ? new Date(lic.end_date) : null;
      const rows = [
        ['Nama Toko', lic.company_name || '-'],
        ['Alamat', lic.address || '-'],
        ['Email', lic.email || '-'],
        ['Telepon', lic.phone || '-'],
        ['Paket', lic.package_name || '-'],
        ['Tipe Lisensi', lic.type || '-'],
        ['Tanggal Mulai', vf ? vf.toLocaleDateString('id-ID') : '-'],
        ['Tanggal Berakhir', vu ? vu.toLocaleDateString('id-ID') : (lic.type === 'lifetime' ? 'Lifetime' : '-')],
        ['Harga', price != null ? `Rp ${Number(price).toLocaleString('id-ID')}` : '-'],
      ];
      const pdf = renderReportPdf({
        title: 'INVOICE LISENSI APLIKASI',
        company: null,
        logoUrl: null,
        table: { headers: ['Keterangan', 'Nilai'], rows },
        showMeta: false,
        summary: { items: [{ label: 'Total', value: price != null ? `Rp ${Number(price).toLocaleString('id-ID')}` : '-' }] },
        noteLines: [
          'Pembayaran Tunai atau Transfer Melalui:',
          'Bank Mandiri : 000-000000-000000',
          'a/n CV. DIGITAL NIAGA SOLUSINDO',
          'Lakukan Konfirmasi Pembayaran hanya di email / WhatsUp resmi kami :',
          'email : solusindodigitalniaga@gmail.com',
          'Whatsup Customer Representative : 085 222 906 706',
        ]
      });
      pdf.save(`invoice-lisensi-${lic.id}.pdf`);
      toast.success('Invoice lisensi diunduh');
    } catch (e) {
      toast.error(e?.message || 'Gagal membuat invoice lisensi');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Generate Lisensi</h1>
      {!authorized ? (
        <div className="p-4 bg-white dark:bg-slate-900 border rounded-md">
          <p className="mt-2 text-slate-600">Halaman ini hanya untuk user dengan role license_admin.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-white dark:bg-slate-900 border rounded-md space-y-3">
          <div>
            <Label>Nama Perusahaan</Label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>No Telp/HP</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Alamat</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Paket Aplikasi ({selectedPackage})</Label>
              <Select value={selectedPackage} onValueChange={(v) => {
                console.log('Package selected:', v);
                setSelectedPackage(v);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Basic">Basic</SelectItem>
                  <SelectItem value="Profesional">Profesional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipe Lisensi</Label>
              <Select value={type} onValueChange={(v) => {
                setType(v);
                if (v === 'tahunan') setMonths(12);
                else if (v === 'bulanan') setMonths(1);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="bulanan">Bulanan</SelectItem>
                  <SelectItem value="tahunan">Tahunan</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              {type === 'custom' && (
                <div className="mb-2">
                  <Label>Durasi (bulan)</Label>
                  <Input type="number" min={1} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
                </div>
              )}
              <div>
                <Label>Harga</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Masukkan harga (Rp)"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Tanggal Mulai</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Tanggal Expired</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={type === 'lifetime'} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={onGenerate} disabled={loading || !companyName}>
              {loading ? 'Membuat...' : 'Generate Lisensi'}
            </Button>
            <Button type="button" variant="outline" onClick={onReset}>
              Reset Form
            </Button>
          </div>
        </div>
        <div className="p-4 bg-white dark:bg-slate-900 border rounded-md space-y-3">
          <p className="font-medium">License Key</p>
          <Input value={licenseKey} readOnly />
          {savedId && <p className="text-xs text-slate-600">ID tersimpan: {savedId}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCopy} disabled={!licenseKey}>
              Copy License Key
            </Button>
            <Button type="button" variant="outline" onClick={onDownload} disabled={!licenseKey}>
              Download Lisensi
            </Button>
          </div>
          <p className="font-medium mt-4">Detail Lisensi</p>
          <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded">{payloadPreview}</pre>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="font-medium">Lisensi Tersimpan</p>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    setLicensesLoading(true);
                    const rows = await base44.license.list(20);
                    setLicenses(Array.isArray(rows) ? rows : []);
                    toast.success('Daftar lisensi diperbarui');
                  } catch (e) {
                    toast.error(e?.message || 'Gagal memuat daftar lisensi');
                  } finally {
                    setLicensesLoading(false);
                  }
                }}
              >
                Muat Ulang
              </Button>
            </div>
            <div className="mt-3">
              {licensesLoading ? (
                <p className="text-sm text-slate-500">Memuat...</p>
              ) : licenses.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada lisensi</p>
              ) : (
                <div className="overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Perusahaan</th>
                        <th className="py-2 pr-3">Paket</th>
                        <th className="py-2 pr-3">Tipe</th>
                        <th className="py-2 pr-3">Mulai</th>
                        <th className="py-2 pr-3">Berakhir</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Key</th>
                        <th className="py-2 pr-3">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {licenses.map((l) => (
                        <tr key={l.id} className="border-b">
                          <td className="py-2 pr-3">{l.id}</td>
                          <td className="py-2 pr-3">{l.company_name}</td>
                          <td className="py-2 pr-3">{l.package_name}</td>
                          <td className="py-2 pr-3">{l.type}</td>
                          <td className="py-2 pr-3">{l.start_date ? new Date(l.start_date).toLocaleDateString('id-ID') : '-'}</td>
                          <td className="py-2 pr-3">{l.end_date ? new Date(l.end_date).toLocaleDateString('id-ID') : '-'}</td>
                          <td className="py-2 pr-3">{l.status}</td>
                          <td className="py-2 pr-3 break-all">{l.license_key}</td>
                          <td className="py-2 pr-3">
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" onClick={() => onDeleteRow(l)} disabled={actionLoadingId === l.id} aria-label="Hapus">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                              <Button type="button" variant="outline" onClick={() => onInvoiceRow(l)} aria-label="Invoice PDF">
                                <FileText className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
