import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight, Wallet, CreditCard, History, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { id } from "date-fns/locale";

export default function UtangPiutang() {
  const queryClient = useQueryClient();
  const [showPayment, setShowPayment] = useState(false);
  const [paymentType, setPaymentType] = useState('receivable'); // receivable or debt
  const [selectedParty, setSelectedParty] = useState(null);
  const [selectedReference, setSelectedReference] = useState(null);
  const [selectedMaxAmount, setSelectedMaxAmount] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.filter({ payment_method: 'tempo' }),
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => base44.entities.Purchase.filter({ payment_method: 'tempo' }),
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments'],
    queryFn: () => base44.entities.Payment.list('-payment_date'),
  });

  const waLink = (phone) => {
    if (!phone) return null;
    const digits = String(phone).replace(/\D+/g, '');
    if (!digits) return null;
    const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : (digits.startsWith('62') ? digits : digits);
    return `https://wa.me/${normalized}`;
  };

  const customerIndex = customers.reduce((acc, c) => {
    acc[String(c.id)] = c;
    return acc;
  }, {});

  const supplierIndex = suppliers.reduce((acc, s) => {
    acc[String(s.id)] = s;
    return acc;
  }, {});

  const receivableInvoiceRows = (() => {
    const tempoSales = (sales || [])
      .filter(s => String(s?.payment_method || '').trim().toLowerCase() === 'tempo')
      .map(s => ({
        sale: s,
        outstanding: Math.max(0, Number(s?.debt_amount || 0)),
      }))
      .filter(x => x.outstanding > 0 && String(x?.sale?.customer_id || '').length > 0)
      .sort((a, b) => {
        const da = a.sale?.sale_date ? new Date(a.sale.sale_date).getTime() : 0;
        const db = b.sale?.sale_date ? new Date(b.sale.sale_date).getTime() : 0;
        return da - db;
      });

    return tempoSales.map((row) => {
      const customerId = String(row.sale?.customer_id || '');
      const customer = customerIndex[customerId] || { id: customerId, name: row.sale?.customer_name };
      return {
        sale: row.sale,
        customer,
        outstanding: row.outstanding,
      };
    });
  })();

  const receivableByCustomer = receivableInvoiceRows.reduce((acc, row) => {
    const cid = String(row?.customer?.id || '');
    if (!cid) return acc;
    acc[cid] = (acc[cid] || 0) + Number(row?.outstanding || 0);
    return acc;
  }, {});

  const customersWithDebt = customers.filter(c => (receivableByCustomer[String(c.id)] || 0) > 0);
  const totalReceivable = receivableInvoiceRows.reduce((sum, row) => sum + (row.outstanding || 0), 0);

  const receivableOutstandingBySaleId = receivableInvoiceRows.reduce((acc, row) => {
    const sid = String(row?.sale?.id || '');
    if (!sid) return acc;
    acc[sid] = Number(row?.outstanding || 0);
    return acc;
  }, {});

  const openReceivablePartyPaymentDialog = (customer) => {
    setPaymentType('receivable');
    setSelectedParty(customer || null);
    setSelectedReference(null);
    setSelectedMaxAmount(0);
    setPaymentAmount(0);
    setShowPayment(true);
  };

  const openReceivableInvoicePaymentDialog = (row) => {
    setPaymentType('receivable');
    setSelectedParty(row?.customer || null);
    setSelectedReference({ type: 'sale', id: row?.sale?.id, label: row?.sale?.invoice_number || row?.sale?.id });
    setSelectedMaxAmount(row?.outstanding || 0);
    setPaymentAmount(row?.outstanding || 0);
    setShowPayment(true);
  };

  const payableInvoiceRows = (() => {
    const tempoPurchases = (purchases || [])
      .filter(p => String(p?.payment_method || '').trim().toLowerCase() === 'tempo')
      .map(p => ({
        purchase: p,
        outstanding: Math.max(0, Number(p?.debt_amount || 0)),
      }))
      .filter(x => x.outstanding > 0 && String(x?.purchase?.supplier_id || '').length > 0)
      .sort((a, b) => {
        const da = a.purchase?.purchase_date ? new Date(a.purchase.purchase_date).getTime() : 0;
        const db = b.purchase?.purchase_date ? new Date(b.purchase.purchase_date).getTime() : 0;
        return da - db;
      });

    return tempoPurchases.map((row) => {
      const supplierId = String(row.purchase?.supplier_id || '');
      const supplier = supplierIndex[supplierId] || { id: supplierId, name: row.purchase?.supplier_name };
      return {
        purchase: row.purchase,
        supplier,
        outstanding: row.outstanding,
      };
    });
  })();

  const payableBySupplier = payableInvoiceRows.reduce((acc, row) => {
    const sid = String(row?.supplier?.id || '');
    if (!sid) return acc;
    acc[sid] = (acc[sid] || 0) + Number(row?.outstanding || 0);
    return acc;
  }, {});

  const suppliersWithDebt = suppliers.filter(s => (payableBySupplier[String(s.id)] || 0) > 0);
  const totalPayable = payableInvoiceRows.reduce((sum, row) => sum + (row.outstanding || 0), 0);

  const payableOutstandingByPurchaseId = payableInvoiceRows.reduce((acc, row) => {
    const pid = String(row?.purchase?.id || '');
    if (!pid) return acc;
    acc[pid] = Number(row?.outstanding || 0);
    return acc;
  }, {});

  const openPayablePartyPaymentDialog = (supplier) => {
    setPaymentType('payable');
    setSelectedParty(supplier || null);
    setSelectedReference(null);
    setSelectedMaxAmount(0);
    setPaymentAmount(0);
    setShowPayment(true);
  };

  const openPayableInvoicePaymentDialog = (row) => {
    setPaymentType('payable');
    setSelectedParty(row?.supplier || null);
    setSelectedReference({ type: 'purchase', id: row?.purchase?.id, label: row?.purchase?.invoice_number || row?.purchase?.id });
    setSelectedMaxAmount(row?.outstanding || 0);
    setPaymentAmount(row?.outstanding || 0);
    setShowPayment(true);
  };

  const handleSubmit = () => {
    setIsSubmittingLocal(true);
    if (!selectedParty) {
      setPaymentError('Pihak pembayaran belum dipilih');
      toast.error('Pihak pembayaran belum dipilih');
      setIsSubmittingLocal(false);
      return;
    }
    if ((paymentType === 'receivable' || paymentType === 'payable') && !selectedReference?.id) {
      setPaymentError('Invoice belum dipilih');
      toast.error('Invoice belum dipilih');
      setIsSubmittingLocal(false);
      return;
    }
    if (paymentAmount <= 0) {
      setPaymentError('Jumlah bayar harus lebih dari 0');
      toast.error('Jumlah bayar harus lebih dari 0');
      setIsSubmittingLocal(false);
      return;
    }
    const maxDebt = selectedReference?.id ? (selectedMaxAmount || 0) : (selectedParty.total_debt || 0);
    if (paymentAmount > maxDebt) {
      setPaymentError('Jumlah bayar tidak boleh melebihi sisa piutang/utang');
      toast.error('Jumlah bayar tidak boleh melebihi sisa piutang/utang');
      setIsSubmittingLocal(false);
      return;
    }
    setPaymentError('');
    paymentMutation.mutate();
  };

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedParty) {
        throw new Error('Pihak pembayaran belum dipilih');
      }
      if (paymentAmount <= 0) {
        throw new Error('Jumlah bayar harus lebih dari 0');
      }
      const maxDebt = selectedReference?.id ? (selectedMaxAmount || 0) : (selectedParty.total_debt || 0);
      if (paymentAmount > maxDebt) {
        throw new Error('Jumlah bayar melebihi sisa piutang/utang');
      }

      if (paymentType === 'receivable') {
        if (!selectedReference?.id) {
          throw new Error('Invoice piutang belum dipilih');
        }
        let sale = null;
        try {
          if (base44.entities.Sale.get) {
            sale = await base44.entities.Sale.get(selectedReference.id);
          } else {
            sale = (sales || []).find(s => String(s?.id) === String(selectedReference.id)) || null;
          }
        } catch {}
        if (!sale) {
          throw new Error('Invoice tidak ditemukan');
        }

        await base44.entities.Payment.create({
          type: 'receivable_payment',
          reference_type: 'sale',
          reference_id: selectedReference.id,
          party_id: selectedParty.id,
          party_name: selectedParty.name,
          amount: paymentAmount,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString(),
          notes: paymentNotes || null
        });

        const newCustomerDebt = Math.max(0, (selectedParty.total_debt || 0) - paymentAmount);
        await base44.entities.Customer.update(selectedParty.id, { total_debt: newCustomerDebt });

        const currentDebt = Math.max(0, Number(sale?.debt_amount || 0) || 0);
        const newInvoiceDebt = Math.max(0, currentDebt - paymentAmount);
        try {
          const updatePayload = { debt_amount: newInvoiceDebt };
          if (sale && sale.status !== 'returned') {
            const paidNow = Math.max(0, Number(sale?.paid_amount || 0) || 0) + paymentAmount;
            updatePayload.paid_amount = paidNow;
            if (newInvoiceDebt === 0) {
              updatePayload.status = 'completed';
              updatePayload.due_date = null;
            }
          } else if (newInvoiceDebt === 0) {
            updatePayload.status = 'completed';
            updatePayload.due_date = null;
          }
          await base44.entities.Sale.update(selectedReference.id, updatePayload);
        } catch {}
      } else {
        if (!selectedReference?.id) {
          throw new Error('Invoice utang belum dipilih');
        }
        let purchase = null;
        try {
          if (base44.entities.Purchase.get) {
            purchase = await base44.entities.Purchase.get(selectedReference.id);
          } else {
            purchase = (purchases || []).find(p => String(p?.id) === String(selectedReference.id)) || null;
          }
        } catch {}
        if (!purchase) {
          throw new Error('Invoice tidak ditemukan');
        }
        await base44.entities.Payment.create({
          type: 'debt_payment',
          reference_type: 'purchase',
          reference_id: selectedReference.id,
          party_id: selectedParty.id,
          party_name: selectedParty.name,
          amount: paymentAmount,
          payment_method: paymentMethod,
          payment_date: new Date().toISOString(),
          notes: paymentNotes || null
        });

        const newDebt = Math.max(0, (selectedParty.total_debt || 0) - paymentAmount);
        await base44.entities.Supplier.update(selectedParty.id, { total_debt: newDebt });

        const currentDebt = Math.max(0, Number(purchase?.debt_amount || 0) || 0);
        const newInvoiceDebt = Math.max(0, currentDebt - paymentAmount);
        try {
          const updatePayload = { debt_amount: newInvoiceDebt };
          const paidNow = Math.max(0, Number(purchase?.paid_amount || 0) || 0) + paymentAmount;
          updatePayload.paid_amount = paidNow;
          if (newInvoiceDebt === 0) {
            updatePayload.due_date = null;
          }
          await base44.entities.Purchase.update(selectedReference.id, updatePayload);
        } catch {}
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      setShowPayment(false);
      setPaymentError('');
      toast.success('Pembayaran berhasil dicatat!');
    },
    onError: (err) => {
      setPaymentError(typeof err?.message === 'string' ? err.message : 'Gagal menyimpan pembayaran');
      toast.error(typeof err?.message === 'string' ? err.message : 'Gagal menyimpan pembayaran')
    },
    onSettled: () => {
      setIsSubmittingLocal(false);
    }
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Utang & Piutang</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <ArrowUpRight className="w-4 h-4" /> Total Piutang
                </p>
                <p className="text-3xl font-bold text-green-900 mt-1">
                  Rp {totalReceivable.toLocaleString('id-ID')}
                </p>
                <p className="text-sm text-green-600 mt-1">{customersWithDebt.length} pelanggan</p>
              </div>
              <Wallet className="w-12 h-12 text-green-300" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-red-600 font-medium flex items-center gap-1">
                  <ArrowDownRight className="w-4 h-4" /> Total Utang
                </p>
                <p className="text-3xl font-bold text-red-900 mt-1">
                  Rp {totalPayable.toLocaleString('id-ID')}
                </p>
                <p className="text-sm text-red-600 mt-1">{suppliersWithDebt.length} supplier</p>
              </div>
              <CreditCard className="w-12 h-12 text-red-300" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="receivable">
        <TabsList className="h-12">
          <TabsTrigger
            value="receivable"
            className="text-base md:text-lg px-4 py-2 font-semibold border-b-4 border-transparent transition-colors duration-200 data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary"
          >
            Piutang Pelanggan
          </TabsTrigger>
          <TabsTrigger
            value="payable"
            className="text-base md:text-lg px-4 py-2 font-semibold border-b-4 border-transparent transition-colors duration-200 data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary"
          >
            Utang Supplier
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="text-base md:text-lg px-4 py-2 font-semibold border-b-4 border-transparent transition-colors duration-200 data-[state=active]:text-primary data-[state=active]:bg-primary/10 data-[state=active]:border-primary"
          >
            Riwayat Pembayaran
          </TabsTrigger>
        </TabsList>

        <TabsContent value="receivable">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Piutang Pelanggan (Per Invoice)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Sisa Piutang</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivableInvoiceRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        Tidak ada piutang invoice
                      </TableCell>
                    </TableRow>
                  ) : (
                    receivableInvoiceRows.map((row) => (
                      <TableRow key={row.sale.id}>
                        <TableCell className="font-medium">{row.sale?.invoice_number || row.sale?.id}</TableCell>
                        <TableCell>{row.sale?.sale_date ? format(new Date(row.sale.sale_date), 'dd MMM yyyy', { locale: id }) : '-'}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            <span>{row.customer?.name || row.sale?.customer_name || 'Tanpa Nama'}</span>
                            {row.customer?.phone && waLink(row.customer.phone) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(waLink(row.customer.phone), '_blank', 'noopener')}
                                className="text-green-600"
                                aria-label="WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{row.sale?.due_date ? format(new Date(row.sale.due_date), 'dd MMM yyyy', { locale: id }) : '-'}</TableCell>
                        <TableCell className="text-green-600 font-semibold">
                          Rp {Number(row.outstanding || 0).toLocaleString('id-ID')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {customersWithDebt.length > 0 && (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-slate-700 mb-2">Ringkasan per pelanggan</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pelanggan</TableHead>
                        <TableHead>Kontak</TableHead>
                        <TableHead>Total Piutang</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customersWithDebt.map((customer) => (
                        <TableRow key={customer.id}>
                          <TableCell className="font-medium">{customer.name || 'Tanpa Nama'}</TableCell>
                          <TableCell>
                            {customer.phone ? (
                              <div className="flex items-center gap-1">
                                <span>{customer.phone}</span>
                                {waLink(customer.phone) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(waLink(customer.phone), '_blank', 'noopener')}
                                    className="text-green-600"
                                    aria-label="WhatsApp"
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-green-600 font-semibold">
                            Rp {Number(receivableByCustomer[String(customer.id)] || 0).toLocaleString('id-ID')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" onClick={() => openReceivablePartyPaymentDialog(customer)}>
                              Terima Pembayaran
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payable">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Utang Supplier (Per Invoice)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Jatuh Tempo</TableHead>
                    <TableHead>Sisa Utang</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payableInvoiceRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                        Tidak ada utang invoice
                      </TableCell>
                    </TableRow>
                  ) : (
                    payableInvoiceRows.map((row) => (
                      <TableRow key={row.purchase.id}>
                        <TableCell className="font-medium">{row.purchase?.invoice_number || row.purchase?.id}</TableCell>
                        <TableCell>{row.purchase?.purchase_date ? format(new Date(row.purchase.purchase_date), 'dd MMM yyyy', { locale: id }) : '-'}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1">
                            <span>{row.supplier?.name || row.purchase?.supplier_name || 'Tanpa Nama'}</span>
                            {row.supplier?.phone && waLink(row.supplier.phone) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(waLink(row.supplier.phone), '_blank', 'noopener')}
                                className="text-green-600"
                                aria-label="WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{row.purchase?.due_date ? format(new Date(row.purchase.due_date), 'dd MMM yyyy', { locale: id }) : '-'}</TableCell>
                        <TableCell className="text-red-600 font-semibold">
                          Rp {Number(row.outstanding || 0).toLocaleString('id-ID')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {suppliersWithDebt.length > 0 && (
                <div className="mt-6">
                  <div className="text-sm font-semibold text-slate-700 mb-2">Ringkasan per supplier</div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Kontak</TableHead>
                        <TableHead>Total Utang</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliersWithDebt.map((supplier) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.name || 'Tanpa Nama'}</TableCell>
                          <TableCell>
                            {supplier.phone ? (
                              <div className="flex items-center gap-1">
                                <span>{supplier.phone}</span>
                                {waLink(supplier.phone) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(waLink(supplier.phone), '_blank', 'noopener')}
                                    className="text-green-600"
                                    aria-label="WhatsApp"
                                  >
                                    <MessageCircle className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-red-600 font-semibold">
                            Rp {Number(payableBySupplier[String(supplier.id)] || 0).toLocaleString('id-ID')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="destructive" onClick={() => openPayablePartyPaymentDialog(supplier)}>
                              Bayar Utang
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Riwayat Pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Jumlah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{format(new Date(payment.payment_date || payment.created_date), 'dd MMM yyyy HH:mm', { locale: id })}</TableCell>
                      <TableCell>
                        <Badge variant={payment.type === 'receivable_payment' ? 'default' : 'destructive'}>
                          {payment.type === 'receivable_payment' ? 'Piutang' : 'Utang'}
                        </Badge>
                      </TableCell>
                      <TableCell>{payment.party_name}</TableCell>
                      <TableCell className="capitalize">{payment.payment_method}</TableCell>
                      <TableCell className="font-semibold">Rp {payment.amount?.toLocaleString('id-ID')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paymentType === 'receivable' ? 'Terima Pembayaran Piutang' : 'Bayar Utang'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">
                {paymentType === 'receivable' ? 'Pelanggan' : 'Supplier'}
              </p>
              <p className="font-semibold text-lg">{selectedParty?.name}</p>
              {selectedReference?.label && (
                <p className="text-sm text-slate-500 mt-1">Invoice: {selectedReference.label}</p>
              )}
              {(paymentType === 'receivable' || paymentType === 'payable') && !selectedReference?.id && (
                <div className="mt-3">
                  <Label>Pilih Invoice</Label>
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (!selectedParty) return;
                      if (!value) return;
                      if (paymentType === 'receivable') {
                        const row = receivableInvoiceRows.find(r => String(r?.sale?.id) === String(value) && String(r?.customer?.id || '') === String(selectedParty.id));
                        if (!row) return;
                        setSelectedReference({ type: 'sale', id: row.sale.id, label: row.sale?.invoice_number || row.sale.id });
                        setSelectedMaxAmount(Number(receivableOutstandingBySaleId[String(row.sale.id)] || row.outstanding || 0));
                        setPaymentAmount(Number(receivableOutstandingBySaleId[String(row.sale.id)] || row.outstanding || 0));
                      } else {
                        const row = payableInvoiceRows.find(r => String(r?.purchase?.id) === String(value) && String(r?.supplier?.id || '') === String(selectedParty.id));
                        if (!row) return;
                        setSelectedReference({ type: 'purchase', id: row.purchase.id, label: row.purchase?.invoice_number || row.purchase.id });
                        setSelectedMaxAmount(Number(payableOutstandingByPurchaseId[String(row.purchase.id)] || row.outstanding || 0));
                        setPaymentAmount(Number(payableOutstandingByPurchaseId[String(row.purchase.id)] || row.outstanding || 0));
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Pilih invoice..." />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentType === 'receivable' ? (
                        receivableInvoiceRows
                          .filter(r => String(r?.customer?.id || '') === String(selectedParty?.id || ''))
                          .map((r) => (
                            <SelectItem key={r.sale.id} value={String(r.sale.id)}>
                              {r.sale?.invoice_number || r.sale.id} - Rp {Number(r.outstanding || 0).toLocaleString('id-ID')}
                            </SelectItem>
                          ))
                      ) : (
                        payableInvoiceRows
                          .filter(r => String(r?.supplier?.id || '') === String(selectedParty?.id || ''))
                          .map((r) => (
                            <SelectItem key={r.purchase.id} value={String(r.purchase.id)}>
                              {r.purchase?.invoice_number || r.purchase.id} - Rp {Number(r.outstanding || 0).toLocaleString('id-ID')}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <p className="text-sm text-slate-500 mt-2">Sisa {paymentType === 'receivable' ? 'Piutang' : 'Utang'}</p>
              <p className={`font-bold text-xl ${paymentType === 'receivable' ? 'text-green-600' : 'text-red-600'}`}>
                Rp {(selectedReference?.id ? selectedMaxAmount : selectedParty?.total_debt)?.toLocaleString('id-ID')}
              </p>
            </div>

            <div>
              <Label>Jumlah Bayar</Label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => {
                  const max = selectedReference?.id ? (selectedMaxAmount || 0) : (selectedParty?.total_debt || 0);
                  const val = Number(e.target.value);
                  const clamped = Math.min(Math.max(0, val), max);
                  setPaymentAmount(clamped);
                }}
                max={selectedReference?.id ? selectedMaxAmount : selectedParty?.total_debt}
              />
              {paymentAmount > (selectedReference?.id ? (selectedMaxAmount || 0) : (selectedParty?.total_debt || 0)) && (
                <p className="text-xs text-red-600 mt-1">Jumlah bayar melebihi sisa {paymentType === 'receivable' ? 'piutang' : 'utang'}.</p>
              )}
            </div>

            <div>
              <Label>Metode Pembayaran</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Tunai</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Catatan</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Opsional: catatan pembayaran"
              />
            </div>

            {paymentError && (
              <p className="text-sm text-red-600">{paymentError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowPayment(false)}>Batal</Button>
              <Button type="button" onClick={handleSubmit} disabled={paymentMutation.isPending}>
                {(paymentMutation.isPending || isSubmittingLocal) ? 'Memproses...' : 'Simpan Pembayaran'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
