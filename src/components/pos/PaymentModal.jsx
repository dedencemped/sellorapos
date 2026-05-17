import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Banknote, CreditCard, QrCode, Clock, CalendarIcon, Check } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getSettings } from "@/lib/settings";

const paymentMethods = [
  { value: 'cash', label: 'Tunai', icon: Banknote },
  { value: 'transfer', label: 'Transfer', icon: CreditCard },
  { value: 'qris', label: 'QRIS', icon: QrCode },
  { value: 'tempo', label: 'Tempo', icon: Clock },
];

export default function PaymentModal({ 
  open, 
  onClose, 
  total, 
  customers, 
  onSubmit,
  isSubmitting 
}) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState(total);
  const [customerId, setCustomerId] = useState('');
  const [saleDateTime, setSaleDateTime] = useState('');
  const [dueDate, setDueDate] = useState(null);
  const [notes, setNotes] = useState('');

  const toLocalDateTimeInputValue = (d) => {
    try {
      const date = d instanceof Date ? d : new Date(d);
      if (isNaN(date.getTime())) return '';
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const hh = String(date.getHours()).padStart(2, '0');
      const mi = String(date.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    } catch {
      return '';
    }
  };

  const toIsoOrNull = (val) => {
    try {
      if (!val) return null;
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (open) {
      const s = getSettings();
      const defaultMethod = s.default_payment_method || 'cash';
      setPaymentMethod(defaultMethod);
      setPaidAmount(0);
      setCustomerId('');
      setSaleDateTime(toLocalDateTimeInputValue(new Date()));
      setDueDate(null);
      setNotes('');
    }
  }, [open, total]);

  const change = paymentMethod !== 'tempo' ? Math.max(0, paidAmount - total) : 0;
  const debt = paymentMethod === 'tempo' ? total - paidAmount : 0;

  const handlePaymentMethodChange = (nextMethod) => {
    setPaymentMethod(nextMethod);
    if (nextMethod === 'tempo') {
      setPaidAmount(0);
      return;
    }
  };

  const handleSubmit = () => {
    const selectedCustomer = customers.find(c => String(c.id) === String(customerId));
    onSubmit({
      sale_date: toIsoOrNull(saleDateTime),
      payment_method: paymentMethod,
      paid_amount: paidAmount,
      change_amount: change,
      debt_amount: debt,
      customer_id: customerId,
      customer_name: selectedCustomer?.name || '',
      due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
      notes
    });
  };

  const quickAmounts = [total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Pembayaran</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-center py-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-slate-600">Total Bayar</p>
            <p className="text-3xl font-bold text-blue-600">Rp {total.toLocaleString('id-ID')}</p>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Tanggal Transaksi</Label>
            <Input
              type="datetime-local"
              value={saleDateTime}
              onChange={(e) => setSaleDateTime(e.target.value)}
              className="h-12"
            />
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">
              {paymentMethod === 'tempo' ? 'Pelanggan *' : 'Pelanggan (opsional)'}
            </Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih pelanggan" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium mb-2 block">Metode Pembayaran</Label>
            <RadioGroup value={paymentMethod} onValueChange={handlePaymentMethodChange} className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => (
                <div key={method.value}>
                  <RadioGroupItem value={method.value} id={method.value} className="peer sr-only" />
                  <Label
                    htmlFor={method.value}
                    className={cn(
                      "flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-all",
                      "peer-data-[state=checked]:border-blue-500 peer-data-[state=checked]:bg-blue-50"
                    )}
                  >
                    <method.icon className="w-5 h-5" />
                    {method.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {paymentMethod === 'tempo' && (
            <div>
              <Label>Jatuh Tempo</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP', { locale: id }) : 'Pilih tanggal'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div>
            <Label>Jumlah Bayar</Label>
            <Input
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              className="text-2xl md:text-2xl h-14 py-3 font-bold"
            />
            {paymentMethod === 'cash' && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {[...new Set(quickAmounts)].slice(0, 4).map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    size="sm"
                    onClick={() => setPaidAmount(amount)}
                  >
                    Rp {amount.toLocaleString('id-ID')}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {paymentMethod === 'cash' && change > 0 && (
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600">Kembalian</p>
              <p className="text-2xl font-bold text-green-700">Rp {change.toLocaleString('id-ID')}</p>
            </div>
          )}

          {paymentMethod === 'tempo' && debt > 0 && (
            <div className="p-3 bg-amber-50 rounded-lg">
              <p className="text-sm text-amber-600">Sisa Piutang</p>
              <p className="text-2xl font-bold text-amber-700">Rp {debt.toLocaleString('id-ID')}</p>
            </div>
          )}

          <div>
            <Label>Catatan</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan (opsional)" />
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full h-12 text-lg"
            disabled={isSubmitting || (paymentMethod === 'tempo' && !customerId)}
          >
            <Check className="w-5 h-5 mr-2" />
            {isSubmitting ? 'Memproses...' : 'Selesaikan Transaksi'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
