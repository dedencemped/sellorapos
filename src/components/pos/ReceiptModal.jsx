import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, FileText } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { getSettings } from "@/lib/settings";
import { base44 } from '@/api/base44Client';

export default function ReceiptModal({ open, onClose, sale, storeName = "TOKO ANDA" }) {
  const receiptRef = useRef(null);
  const [resolvedCustomer, setResolvedCustomer] = useState(null);

  useEffect(() => {
    let canceled = false;
    const run = async () => {
      if (!sale) {
        setResolvedCustomer(null);
        return;
      }
      const custId = sale?.customer_id;
      const needsAddress = !String(sale?.customer_address || '').trim();
      const needsPhone = !String(sale?.customer_phone || '').trim();
      if (!custId || (!needsAddress && !needsPhone)) {
        setResolvedCustomer(null);
        return;
      }
      try {
        let customer = null;
        if (base44.entities.Customer.get) {
          customer = await base44.entities.Customer.get(custId);
        } else {
          const allCustomers = await base44.entities.Customer.list();
          customer = (allCustomers || []).find(c => String(c.id) === String(custId)) || null;
        }
        if (!canceled) setResolvedCustomer(customer || null);
      } catch {
        if (!canceled) setResolvedCustomer(null);
      }
    };
    run();
    return () => { canceled = true; };
  }, [sale?.customer_id, sale?.customer_address, sale?.customer_phone]);

  if (!sale) return null;

  const safeFormatDate = (dateVal) => {
    try {
      if (!dateVal) return '-';
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '-';
      return format(d, 'dd MMM yyyy HH:mm', { locale: id });
    } catch (e) {
      return '-';
    }
  };

  const invoiceNumber = sale.invoice_number || sale.id || '-';
  const dateStr = safeFormatDate(sale.sale_date || sale.created_date);
  
  const settingsUI = getSettings();
  const displayStoreUI = settingsUI.store_name || storeName;
  const displayAddressUI = settingsUI.store_address || '';
  const displayPhoneUI = settingsUI.store_phone || '';
  const displayEmailUI = settingsUI.store_email || '';
  const displayFaxUI = settingsUI.store_fax || '';
  const displayNPWPUI = settingsUI.store_npwp || '';
  const displayLicenseUI = settingsUI.store_business_license || '';
  const displayReceiptFooterUI = settingsUI.receipt_footer || '';

  const toNumberLoose = (val) => {
    if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val) : 0;
    if (val === null || val === undefined) return 0;
    const raw = String(val).trim();
    const cleaned = raw.replace(/[^\d.,-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '--') return 0;
    if (cleaned.includes('.') && cleaned.includes(',')) {
      const lastSep = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
      const intPart = cleaned.slice(0, lastSep).replace(/[^\d-]/g, '');
      const fracPart = cleaned.slice(lastSep + 1).replace(/[^\d]/g, '');
      const normalized = `${intPart}.${fracPart}`;
      const n = parseFloat(normalized);
      return Number.isFinite(n) ? Math.round(n) : 0;
    }
    const normalized = cleaned.replace(',', '.');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? Math.round(n) : 0;
  };

  const items = Array.isArray(sale.items)
    ? sale.items
    : (typeof sale.items === 'string'
        ? (() => { try { return JSON.parse(sale.items) } catch { return [] } })()
        : (sale.items ? [sale.items] : []));
  const normItems = items.map((it) => {
    const qtyNum = toNumberLoose(it.qty);
    const priceNum = toNumberLoose(it.price);
    const subNum = it.subtotal !== undefined ? toNumberLoose(it.subtotal) : qtyNum * priceNum;
    return {
      product_id: it.product_id,
      product_name: it.product_name,
      qty: qtyNum,
      unit: it.unit,
      price: priceNum,
      subtotal: subNum
    };
  });
  const computedSubtotal = normItems.reduce((s, it) => s + Number(it.subtotal || 0), 0);

  const methodLabel = (m) => {
    const v = String(m || '').trim().toLowerCase();
    if (v === 'cash') return 'Tunai';
    if (v === 'transfer') return 'Transfer';
    if (v === 'qris') return 'QRIS';
    if (v === 'tempo') return 'Tempo';
    return v || '-';
  };

  const subtotal = computedSubtotal;
  const rawDiscountAmount = sale.discount_amount !== undefined
    ? toNumberLoose(sale.discount_amount)
    : (() => {
        const dtype = String(sale.discount_type || '').toLowerCase();
        const dval = Number(sale.discount_value || 0);
        if (dtype === 'percent') return Math.round(subtotal * dval / 100);
        if (dtype === 'nominal') return dval;
        return 0;
      })();
  const discountAmount = Math.max(0, rawDiscountAmount);
  const rawTaxAmount = sale.tax_amount !== undefined
    ? toNumberLoose(sale.tax_amount)
    : Math.round((subtotal - discountAmount) * Number(sale.tax_percent || 0) / 100);
  const taxAmount = Math.max(0, rawTaxAmount);
  const total = Number(sale.total !== undefined ? toNumberLoose(sale.total) : Math.max(0, (subtotal - discountAmount) + taxAmount));
  const paid = toNumberLoose(sale.paid_amount || 0);
  const changeFromField = sale.change_amount !== undefined ? toNumberLoose(sale.change_amount) : undefined;
  const debtFromField = sale.debt_amount !== undefined ? toNumberLoose(sale.debt_amount) : undefined;
  const method = String(sale.payment_method || '').trim().toLowerCase();
  const isTempo = method === 'tempo';
  const computedChange = (changeFromField && changeFromField > 0) ? changeFromField : (!isTempo ? Math.max(0, paid - total) : 0);
  const computedDebt = (debtFromField && debtFromField > 0) ? debtFromField : (isTempo ? Math.max(0, total - paid) : 0);
  const shownMethod = methodLabel(sale.payment_method);

  const handlePrint = () => {
    setTimeout(() => {
      const settings = getSettings();
      const printContent = receiptRef.current;
      const itemsCount = Array.isArray(normItems) ? normItems.length : 0;
      const baseHeightMm = 110;
      const perItemMm = 8;
      const maxHeightMm = 600;
      const paperHeightMm = Math.min(maxHeightMm, Math.max(140, baseHeightMm + (itemsCount * perItemMm)));
      const printWindow = window.open('', '', 'width=380,height=720');
      printWindow.document.write(`
        <html>
          <head>
            <title>Struk ${invoiceNumber}</title>
            <style>
              @page { size: 80mm ${paperHeightMm}mm; margin: 0; }
              html, body { width: 80mm; margin: 0; padding: 0; }
              body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.2; }
              .receipt { padding: 4mm 3mm; box-sizing: border-box; }
              .receipt * { box-sizing: border-box; }
              .receipt p { margin: 0; }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .font-bold { font-weight: 700; }
              .text-xs { font-size: 9px; }
              .text-sm { font-size: 11px; }
              .text-lg { font-size: 13px; }
              .mb-1 { margin-bottom: 2px; }
              .mb-2 { margin-bottom: 4px; }
              .mb-4 { margin-bottom: 8px; }
              .mt-4 { margin-top: 8px; }
              .pt-1 { padding-top: 2px; }
              .pt-2 { padding-top: 4px; }
              .py-2 { padding-top: 4px; padding-bottom: 4px; }
              .border-t { border-top: 1px dashed #000; }
              .border-dashed { border-top-style: dashed; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              .space-y-1 > * + * { margin-top: 2px; }
              .center { text-align: center; }
              .small { font-size: 9px; }
            </style>
          </head>
          <body>
            <div class="receipt">
              ${printContent.innerHTML}
              ${settings.receipt_footer ? `<div class="center small" style="margin-top:6px;">${settings.receipt_footer}</div>` : ``}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
      printWindow.close();
    }, 0);
  };

  const handlePrintInvoice = () => {
    const settings = getSettings();
    const logoHtml = settings.logo_url ? `<img src="${settings.logo_url}" class="logo" />` : ``;
    const extraCompanyLines = [
      settings.store_address ? String(settings.store_address) : '',
      settings.store_phone ? `Telp: ${settings.store_phone}` : '',
      settings.store_email ? `Email: ${settings.store_email}` : '',
      settings.store_fax ? `Fax: ${settings.store_fax}` : '',
      settings.store_npwp ? `NPWP: ${settings.store_npwp}` : '',
      settings.store_business_license ? `Izin Usaha: ${settings.store_business_license}` : ''
    ].filter(Boolean).map(l => `<div class="muted">${l}</div>`).join('');
    const rowsHtml = normItems.map((it, idx) => `
      <tr>
        <td style="padding:1px 3px;">${idx + 1}</td>
        <td style="padding:1px 3px;">${it.product_name}</td>
        <td style="padding:1px 3px;text-align:center;">${it.qty} ${it.unit}</td>
        <td style="padding:1px 3px;text-align:right;">Rp ${toNumberLoose(it.price || 0).toLocaleString('id-ID')}</td>
        <td style="padding:1px 3px;text-align:right;">Rp ${toNumberLoose(it.subtotal || 0).toLocaleString('id-ID')}</td>
      </tr>
    `).join('');
    const discountRow = discountAmount > 0 ? `
      <tr>
        <td colspan="4" style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Diskon</td>
        <td style="padding:4px 6px;border-top:1px solid #000;text-align:right;">- Rp ${discountAmount.toLocaleString('id-ID')}</td>
      </tr>
    ` : '';
    const taxRow = taxAmount > 0 ? `
      <tr>
        <td colspan="4" style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Pajak (${Number(sale.tax_percent || 0)}%)</td>
        <td style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Rp ${taxAmount.toLocaleString('id-ID')}</td>
      </tr>
    ` : '';
    const sisaRow = computedDebt > 0 ? `
      <tr>
        <td colspan="4" style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Sisa Bayar</td>
        <td style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Rp ${computedDebt.toLocaleString('id-ID')}</td>
      </tr>
    ` : '';
    const customerBlock = sale.customer_name ? `<div><strong>Pelanggan:</strong> ${sale.customer_name}</div>` : `<div><strong>Pelanggan:</strong> -</div>`;
    const cashierBlock = sale.cashier_name ? `<div><strong>Kasir:</strong> ${sale.cashier_name}</div>` : '';
    const methodBlock = `<div><strong>Metode:</strong> ${shownMethod}</div>`;
    const displayStore = settings.store_name || storeName;
    const cashierName = String(sale.cashier_name || '').trim() || 'Kasir';
    const customerNameText = String(sale.customer_name || '').trim() || '-';
    const customerAddressText = String(sale.customer_address || resolvedCustomer?.address || '').trim();
    const customerPhoneText = String(sale.customer_phone || resolvedCustomer?.phone || '').trim();
    const dueDateText = (() => {
      try {
        if (!sale.due_date) return '';
        const d = new Date(sale.due_date);
        if (isNaN(d.getTime())) return '';
        return format(d, 'dd MMM yyyy', { locale: id });
      } catch {
        return '';
      }
    })();

    const terbilangID = (value) => {
      const n0 = Math.max(0, Math.floor(Number(value || 0)));
      const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
      const toWords = (n) => {
        if (n < 12) return satuan[n];
        if (n < 20) return `${satuan[n - 10]} belas`;
        if (n < 100) {
          const puluh = Math.floor(n / 10);
          const rest = n % 10;
          return `${satuan[puluh]} puluh${rest ? ` ${toWords(rest)}` : ''}`;
        }
        if (n < 200) return `seratus${n - 100 ? ` ${toWords(n - 100)}` : ''}`;
        if (n < 1000) {
          const ratus = Math.floor(n / 100);
          const rest = n % 100;
          return `${satuan[ratus]} ratus${rest ? ` ${toWords(rest)}` : ''}`;
        }
        if (n < 2000) return `seribu${n - 1000 ? ` ${toWords(n - 1000)}` : ''}`;
        if (n < 1_000_000) {
          const ribu = Math.floor(n / 1000);
          const rest = n % 1000;
          return `${toWords(ribu)} ribu${rest ? ` ${toWords(rest)}` : ''}`;
        }
        if (n < 1_000_000_000) {
          const juta = Math.floor(n / 1_000_000);
          const rest = n % 1_000_000;
          return `${toWords(juta)} juta${rest ? ` ${toWords(rest)}` : ''}`;
        }
        if (n < 1_000_000_000_000) {
          const m = Math.floor(n / 1_000_000_000);
          const rest = n % 1_000_000_000;
          return `${toWords(m)} miliar${rest ? ` ${toWords(rest)}` : ''}`;
        }
        const t = Math.floor(n / 1_000_000_000_000);
        const rest = n % 1_000_000_000_000;
        return `${toWords(t)} triliun${rest ? ` ${toWords(rest)}` : ''}`;
      };
      const result = toWords(n0).trim();
      return result ? `${result} rupiah` : 'nol rupiah';
    };
    const terbilangText = terbilangID(total);

    const metaHtml = `
      <table class="meta">
        <tr>
          <td class="meta-label">No Faktur</td>
          <td class="meta-sep">:</td>
          <td class="meta-val">${invoiceNumber}</td>
        </tr>
        <tr>
          <td class="meta-label">Kepada</td>
          <td class="meta-sep">:</td>
          <td class="meta-val">${customerNameText}</td>
        </tr>
        <tr>
          <td class="meta-label">Alamat</td>
          <td class="meta-sep">:</td>
          <td class="meta-val">${customerAddressText}</td>
        </tr>
        <tr>
          <td class="meta-label">No Telp</td>
          <td class="meta-sep">:</td>
          <td class="meta-val">${customerPhoneText}</td>
        </tr>
        <tr>
          <td class="meta-label">Tgl Faktur</td>
          <td class="meta-sep">:</td>
          <td class="meta-val">${dateStr}</td>
        </tr>
        ${dueDateText ? `
        <tr>
          <td class="meta-label">Jatuh Tempo</td>
          <td class="meta-sep">:</td>
          <td class="meta-val">${dueDateText}</td>
        </tr>` : ``}
      </table>
    `;

    const footerInfoHtml = `
      <div class="footer-top">
        <div class="terbilang terbilang-box"><strong>Terbilang :</strong> ${terbilangText}</div>
      </div>
    `;

    const signsHtml = settings.show_invoice_signatures === false ? `` : `
      <table class="sign-table">
        <tr>
          <td class="sign-col">
            <div class="sign-title">Diterima Oleh</div>
            <div class="sign-space"></div>
            <div class="sign-line"></div>
            <div class="sign-name">&nbsp;</div>
            <div class="sign-meta"><strong>Tanggal & Jam Diterima</strong> :&nbsp;</div>
          </td>
          <td class="note-col">
            <div class="note-box note-box-sign">
              <div><strong>PERHATIAN :</strong></div>
              <div>Barang diterima telah sesuai dengan fisik barang & Dokumen</div>
            </div>
          </td>
          <td class="sign-col">
            <div class="sign-title">Hormat Kami</div>
            <div class="sign-space"></div>
            <div class="sign-line"></div>
            <div class="sign-name">${displayStore}</div>
          </td>
        </tr>
      </table>`;
    const html = `
      <html>
        <head>
          <title>Faktur ${invoiceNumber}</title>
          <style>
            @page { size: A4; margin: 16mm; }
            body { font-family: "Courier New", Courier, monospace; color: #000; font-size: 10pt; line-height: 1.15; }
            .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; gap: 10px; }
            .left { display: flex; align-items: center; gap: 10px; }
            .logo { height: 44px; max-width: 150px; object-fit: contain; display: block; }
            .store { font-size: 12pt; font-weight: 700; color: #000; line-height: 1.15; }
            .muted { color: #000; font-size: 8.5pt; line-height: 1.1; }
            .right { width: 46%; text-align: left; font-size: 8.25pt; line-height: 1.1; }
            .doc-title { text-align: center; font-weight: 700; font-size: 11pt; margin: 6px 0; }
            .meta { width: 100%; border: 0; border-collapse: collapse; }
            .meta td { padding: 2px 4px; font-size: 8.25pt; vertical-align: top; }
            .meta-label { width: 76px; }
            .meta-sep { width: 10px; text-align: center; }
            .meta-val { width: auto; }
            table { width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 9pt; }
            thead th { text-align: left; background: transparent; font-weight: 700; padding: 2px 4px; border-bottom: 1px solid #000; font-size: 9pt; }
            td { padding: 1px 3px; font-size: 9pt; vertical-align: top; border: 0; line-height: 1.1; }
            .totals { margin-top: 12px; width: 100%; border-collapse: collapse; }
            .terbilang { margin-bottom: 4px; }
            .terbilang-box { border: 1px solid #000; padding: 3px 5px; }
            .note-box { border: 1px solid #000; padding: 4px 6px; font-size: 8.25pt; line-height: 1.1; }
            .sign-table { width: 100%; border-collapse: collapse; margin-top: 8px; border: 0 !important; }
            .sign-table td { border: 0 !important; }
            .sign-col { width: 33%; vertical-align: top; text-align: left; font-size: 8.25pt; }
            .note-col { width: 34%; vertical-align: top; padding: 0 8px; }
            .note-box-sign { margin-top: 14px; }
            .sign-title { font-weight: 700; margin-bottom: 2px; }
            .sign-space { height: 36px; }
            .sign-line { border-top: 1px solid #000; margin: 18px 0 3px; }
            .sign-name { font-size: 8.25pt; line-height: 1.1; }
            .sign-meta { font-size: 8.25pt; line-height: 1.1; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="head">
            <div class="left">
              ${logoHtml}
              <div>
                <div class="store">${displayStore}</div>
                ${extraCompanyLines}
              </div>
            </div>
            <div class="right">${metaHtml}</div>
          </div>

          <div class="doc-title">FAKTUR PENJUALAN</div>

          <table>
            <thead>
              <tr>
                <th style="width:28px;">No</th>
                <th>Produk</th>
                <th style="width:84px;text-align:center;">Qty</th>
                <th style="width:120px;text-align:right;">Harga</th>
                <th style="width:130px;text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr>
                <td colspan="4" style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Subtotal</td>
                <td style="padding:4px 6px;border-top:1px solid #000;text-align:right;">Rp ${subtotal.toLocaleString('id-ID')}</td>
              </tr>
              ${discountRow}
              ${taxRow}
              ${sisaRow}
              <tr>
                <td colspan="4" style="padding:6px;border-top:1px solid #000;text-align:right;font-weight:700;">TOTAL</td>
                <td style="padding:6px;border-top:1px solid #000;text-align:right;font-weight:700;">Rp ${total.toLocaleString('id-ID')}</td>
              </tr>
            </tbody>
          </table>

          ${footerInfoHtml}
          ${signsHtml}
        </body>
      </html>
    `;
    const w = window.open('', '', 'width=1024,height=768');
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  };

  return (
    <Dialog open={open} onOpenChange={onClose} key={sale.id || sale.invoice_number}>
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col" key={`content-${sale.id || sale.invoice_number}`}>
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            Struk Pembayaran
          </DialogTitle>
        </DialogHeader>
        
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div ref={receiptRef} className="font-mono text-sm p-4 bg-white border rounded" key={sale.id || sale.invoice_number}>
            <div className="text-center mb-4">
              <p className="font-bold text-lg">{displayStoreUI}</p>
              {displayAddressUI ? <p className="text-xs text-slate-500">{displayAddressUI}</p> : null}
              {displayPhoneUI ? <p className="text-xs text-slate-500">Telp: {displayPhoneUI}</p> : null}
              {displayEmailUI ? <p className="text-xs text-slate-500">Email: {displayEmailUI}</p> : null}
              {displayFaxUI ? <p className="text-xs text-slate-500">Fax: {displayFaxUI}</p> : null}
              {displayNPWPUI ? <p className="text-xs text-slate-500">NPWP: {displayNPWPUI}</p> : null}
              {displayLicenseUI ? <p className="text-xs text-slate-500">Izin Usaha: {displayLicenseUI}</p> : null}
              <p className="text-xs text-slate-500">Terima kasih telah berbelanja</p>
            </div>
            
            <div className="border-t border-dashed pt-2 mb-2">
              <p>No: {invoiceNumber}</p>
              <p>Tanggal: {dateStr}</p>
              {sale.cashier_name && <p>Kasir: {sale.cashier_name}</p>}
              {sale.customer_name && <p>Pelanggan: {sale.customer_name}</p>}
              <p>Metode: {shownMethod}</p>
            </div>
            
            <div className="border-t border-dashed py-2">
              {normItems.map((item, idx) => (
                <div key={`${item.product_id || idx}-${idx}`} className="mb-1">
                  <p>{item.product_name}</p>
                  <div className="flex justify-between text-xs">
                    <span>{item.qty} {item.unit} x Rp {toNumberLoose(item.price || 0).toLocaleString('id-ID')}</span>
                    <span>Rp {toNumberLoose(item.subtotal || 0).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="border-t border-dashed pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>
                    {(() => {
                      const dtype = String(sale.discount_type || '').toLowerCase();
                      if (dtype === 'percent') {
                        return `Diskon (${Number(sale.discount_value || 0)}%)`;
                      }
                      return 'Diskon';
                    })()}
                  </span>
                  <span>- Rp {discountAmount.toLocaleString('id-ID')}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Pajak ({Number(sale.tax_percent || 0)}%)</span>
                  <span>Rp {taxAmount.toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t border-dashed pt-1">
                <span>TOTAL</span>
                <span>Rp {total.toLocaleString('id-ID')}</span>
              </div>
            </div>
            
            {displayReceiptFooterUI ? (
              <div className="text-center mt-4 text-xs text-slate-500">
                <p>{displayReceiptFooterUI}</p>
              </div>
            ) : (
              <div className="text-center mt-4 text-xs text-slate-500">
                <p>*** Terima Kasih ***</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handlePrint} className="col-span-1">
            <Printer className="w-4 h-4 mr-2" />
            Cetak Struk
          </Button>
          <Button variant="outline" onClick={handlePrintInvoice} className="col-span-1">
            <FileText className="w-4 h-4 mr-2" />
            Cetak Faktur
          </Button>
          <Button variant="secondary" onClick={onClose} className="col-span-1">
            Baru
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
