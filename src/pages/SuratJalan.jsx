import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Printer, Truck, User, Calendar, Hash } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { getSettings } from "@/lib/settings";

export default function SuratJalan() {
  const [search, setSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-sale_date'),
  });

  const filteredSales = sales.filter(s => {
    const inv = String(s.invoice_number || s.id || '').toLowerCase();
    const cust = String(s.customer_name || '').toLowerCase();
    const q = search.toLowerCase();
    return (inv.includes(q) || cust.includes(q)) && s.status !== 'returned';
  });

  const handlePrint = (sale) => {
    setSelectedSale(sale);
    setShowPrintModal(true);
  };

  const printSuratJalan = async () => {
    const printContent = document.getElementById('surat-jalan-print-area');
    const windowPrint = window.open('', '', 'left=0,top=0,width=800,height=900,toolbar=0,scrollbars=0,status=0');
    
    const settings = getSettings();
    const storeName = settings.store_name || 'POS System';
    const storeAddress = settings.store_address || '';
    const storePhone = settings.store_phone || '';
    const storeEmail = settings.store_email || '';
    const storeFax = settings.store_fax || '';
    const storeNPWP = settings.store_npwp || '';
    const storeLicense = settings.store_business_license || '';
    const logoUrl = settings.logo_url || '';
    const logoHtml = logoUrl ? `<img src="${logoUrl}" class="logo" />` : '';
    const inv = selectedSale.invoice_number || selectedSale.id;
    const dateText = format(new Date(selectedSale.sale_date || selectedSale.created_date), 'dd MMMM yyyy', { locale: id });
    const customerName = selectedSale.customer_name || 'Umum';
    let resolvedCustomer = null;
    if (selectedSale.customer_id && (!selectedSale.customer_address || !selectedSale.customer_phone)) {
      try {
        if (base44.entities.Customer.get) {
          resolvedCustomer = await base44.entities.Customer.get(selectedSale.customer_id);
        } else {
          const allCustomers = await base44.entities.Customer.list();
          resolvedCustomer = (allCustomers || []).find(c => String(c.id) === String(selectedSale.customer_id)) || null;
        }
      } catch {}
    }
    const customerAddress = selectedSale.customer_address || resolvedCustomer?.address || '-';
    const customerPhone = selectedSale.customer_phone || resolvedCustomer?.phone || '-';

    windowPrint.document.write(`
      <html>
        <head>
          <title>Surat Jalan - ${selectedSale.invoice_number || selectedSale.id}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; padding: 20px; color: #000; font-size: 10pt; }
            .header { margin-bottom: 18px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
            .header-left { display: flex; align-items: center; gap: 12px; width: 35%; }
            .header-center { flex: 1; text-align: center; }
            .header-right { width: 35%; text-align: right; font-size: 10pt; }
            .logo { height: 48px; max-width: 160px; object-fit: contain; display: block; }
            .store-name { font-size: 11pt; font-weight: bold; margin-bottom: 2px; line-height: 1.15; }
            .store-info { font-size: 9pt; line-height: 1.1; }
            .doc-title { font-size: 13pt; font-weight: bold; text-decoration: underline; margin-top: 8px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 20px; font-size: 10pt; }
            .info-item { margin-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; border: 1px solid #000; }
            thead th { border-bottom: 1px solid #000; padding: 3px 5px; text-align: left; font-size: 9.5pt; font-weight: bold; background-color: transparent; }
            tbody td { border: 0; padding: 1px 3px; text-align: left; font-size: 9.5pt; line-height: 1.1; }
            .footer-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 18px; font-size: 10pt; }
            .sig-space { height: 28px; }
            .sig-name { font-size: 9.5pt; }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-row">
              <div class="header-left">
                ${logoHtml}
                <div>
                  <div class="store-name">${storeName}</div>
                  <div class="store-info">${storeAddress}</div>
                  ${storePhone ? `<div class="store-info">Telp: ${storePhone}</div>` : ``}
                  ${storeEmail ? `<div class="store-info">Email: ${storeEmail}</div>` : ``}
                  ${storeFax ? `<div class="store-info">Fax: ${storeFax}</div>` : ``}
                  ${storeNPWP ? `<div class="store-info">NPWP: ${storeNPWP}</div>` : ``}
                  ${storeLicense ? `<div class="store-info">Izin Usaha: ${storeLicense}</div>` : ``}
                </div>
              </div>
              <div class="header-center">
                <div class="doc-title">SURAT JALAN</div>
              </div>
              <div class="header-right">
                <div><strong>No. Faktur:</strong> ${inv}</div>
                <div><strong>Tanggal:</strong> ${dateText}</div>
                <div><strong>Kepada:</strong> ${customerName}</div>
                <div><strong>Alamat:</strong> ${customerAddress}</div>
                <div><strong>No. Telp:</strong> ${customerPhone}</div>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">No</th>
                <th>Nama Barang</th>
                <th style="width: 100px; text-align: center;">Jumlah</th>
                <th style="width: 100px; text-align: center;">Satuan</th>
              </tr>
            </thead>
            <tbody>
              ${(selectedSale.items || []).map((item, index) => `
                <tr>
                  <td style="text-align: center;">${index + 1}</td>
                  <td>${item.product_name}</td>
                  <td style="text-align: center;">${item.qty}</td>
                  <td style="text-align: center;">${item.unit || 'PCS'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div style="margin-bottom: 10px; font-size: 10pt;">
            <strong>Keterangan:</strong> ${selectedSale.notes || '-'}
          </div>
          
          <div class="footer-grid">
            <div>
              <p>Penerima,</p>
              <div class="sig-space"></div>
              <div class="sig-name">( .................... )</div>
            </div>
            <div>
              <p>Sopir/Kurir,</p>
              <div class="sig-space"></div>
              <div class="sig-name">( .................... )</div>
            </div>
            <div>
              <p>Hormat Kami,</p>
              <div class="sig-space"></div>
              <div class="sig-name">( .................... )</div>
            </div>
          </div>
          
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    windowPrint.document.close();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6 text-primary" />
          Surat Jalan
        </h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari no faktur atau nama pelanggan..."
          className="pl-9"
        />
      </div>

      <Card className="overflow-hidden border-none shadow-md">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead className="w-[180px]"><Hash className="w-4 h-4 inline mr-1" /> No. Faktur</TableHead>
              <TableHead><Calendar className="w-4 h-4 inline mr-1" /> Tanggal</TableHead>
              <TableHead><User className="w-4 h-4 inline mr-1" /> Pelanggan</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-32 text-center text-slate-500">
                  Tidak ada data penjualan untuk dibuat surat jalan
                </TableCell>
              </TableRow>
            ) : (
              filteredSales.map((sale) => (
                <TableRow key={sale.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <TableCell className="font-mono font-medium text-primary">
                    {sale.invoice_number || sale.id || '-'}
                  </TableCell>
                  <TableCell>
                    {format(new Date(sale.sale_date || sale.created_date), 'dd MMM yyyy HH:mm', { locale: id })}
                  </TableCell>
                  <TableCell className="font-medium">
                    {sale.customer_name || 'Umum'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-2 border-primary text-primary hover:bg-primary hover:text-white"
                      onClick={() => handlePrint(sale)}
                    >
                      <Printer className="w-4 h-4" />
                      Cetak Surat Jalan
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showPrintModal} onOpenChange={setShowPrintModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pratinjau Surat Jalan</DialogTitle>
          </DialogHeader>
          
          {selectedSale && (
            <div className="space-y-6 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h2 className="text-xl font-bold text-primary uppercase">Surat Jalan</h2>
                  <p className="text-sm text-slate-500 font-mono">#{selectedSale.invoice_number || selectedSale.id}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{format(new Date(selectedSale.sale_date || selectedSale.created_date), 'dd MMMM yyyy', { locale: id })}</p>
                  <p className="text-slate-500">Pelanggan: <span className="text-slate-900 dark:text-slate-100 font-medium">{selectedSale.customer_name || 'Umum'}</span></p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase text-slate-500">Daftar Barang</p>
                <div className="border rounded-md overflow-hidden bg-white dark:bg-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                        <TableHead className="w-12 text-center">No</TableHead>
                        <TableHead>Nama Barang</TableHead>
                        <TableHead className="text-center">Jumlah</TableHead>
                        <TableHead className="text-center">Satuan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedSale.items || []).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-center text-slate-500">{idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-center font-bold">{item.qty}</TableCell>
                          <TableCell className="text-center text-slate-500">{item.unit || 'PCS'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setShowPrintModal(false)}>
                  Tutup
                </Button>
                <Button className="gap-2" onClick={printSuratJalan}>
                  <Printer className="w-4 h-4" />
                  Konfirmasi Cetak
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
