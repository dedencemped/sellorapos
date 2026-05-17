import React, { useEffect, useState, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Trash2, Percent, Calculator, ArrowLeft, Barcode, Image as ImageIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import ProductSearch from "@/components/pos/ProductSearch";
import CartItem from "@/components/pos/CartItem";
import PaymentModal from "@/components/pos/PaymentModal";
import ReceiptModal from "@/components/pos/ReceiptModal";
import StockDisplay from "@/components/pos/StockDisplay";
import { getSettings } from '@/lib/settings';
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BarcodeScanner from "@/components/BarcodeScanner.jsx";

export default function Kasir() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState([]);
  const [discountType, setDiscountType] = useState('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [receiptKey, setReceiptKey] = useState(0);
  const [showMobileScan, setShowMobileScan] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const [scannerSettings, setScannerSettings] = useState({ global: true, autoFocus: true });

  useEffect(() => {
    const s = getSettings();
    setDiscountType(String(s.default_discount_type || 'nominal'));
    setDiscountValue(Number(s.default_discount_value || 0));
    setTaxPercent(Number(s.default_tax_percent || 0));
    setMobileMode(!!s.mobile_mode);
    setScannerSettings({
      global: !!s.scanner_global_listener,
      autoFocus: !!s.scanner_auto_focus
    });
  }, []);

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.filter({ is_active: true }),
  });
  const products = Array.isArray(productsData) ? productsData : [];

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => base44.entities.Category.list(),
  });
  const categories = Array.isArray(categoriesData) ? categoriesData : [];

  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: customersData } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list(),
  });
  const customers = Array.isArray(customersData) ? customersData : [];

  const addToCart = (product) => {
    const prodUnit = String(product.default_unit || '').trim().toUpperCase();
    const isNonPCS = !!prodUnit && prodUnit !== 'PCS';
    const defaultUnit = isNonPCS ? prodUnit : 'PCS';
    const existingIndex = cart.findIndex(item => item.product_id === product.id && item.unit === defaultUnit);
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].qty += 1;
      setCart(newCart);
    } else {
      setCart([...cart, {
        product_id: product.id,
        product_name: product.name,
        image_url: product.image_url || '',
        barcode: product.barcode,
        qty: 1,
        unit: defaultUnit,
        unit_label: isNonPCS ? prodUnit : 'PCS',
        price: isNonPCS ? (Number(product.sell_price_dus) || 0) : (Number(product.sell_price_pcs) || 0),
        sell_price_pcs: Number(product.sell_price_pcs) || 0,
        sell_price_dus: Number(product.sell_price_dus) || 0,
        pcs_per_dus: product.pcs_per_dus || 1,
        stock_pcs: product.stock_pcs
      }]);
    }
  };

  const addToCartRef = useRef();
  addToCartRef.current = addToCart;

  // Global Scanner Listener
  useEffect(() => {
    if (!scannerSettings.global) return;

    let buffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
      // Ignore if focus is in an input or textarea
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        return;
      }

      const currentTime = Date.now();
      
      // If delay between keys is too long, reset buffer (likely human typing)
      if (currentTime - lastKeyTime > 100) {
        buffer = "";
      }

      if (e.key === "Enter") {
        if (buffer.length >= 3) {
          const exact = products.find(p => String(p.barcode || "").trim() === buffer);
          if (exact) {
            if (addToCartRef.current) addToCartRef.current(exact);
            toast.success(`Ditambahkan: ${exact.name}`);
            if (scannerSettings.autoFocus && window.focusProductSearch) {
              window.focusProductSearch();
            }
          } else {
            toast.error(`Barcode tidak ditemukan: ${buffer}`);
          }
          buffer = "";
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [products, scannerSettings.global, scannerSettings.autoFocus]);

  const updateCartItem = (index, updatedItem) => {
    const newCart = [...cart];
    newCart[index] = updatedItem;
    setCart(newCart);
  };

  const removeCartItem = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
    const s = getSettings();
    setDiscountType(String(s.default_discount_type || 'nominal'));
    setDiscountValue(Number(s.default_discount_value || 0));
    setTaxPercent(Number(s.default_tax_percent || 0));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.qty * item.price), 0);
  const discountAmount = discountType === 'percent' 
    ? Math.round(subtotal * discountValue / 100) 
    : discountValue;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = Math.round(afterDiscount * taxPercent / 100);
  const total = afterDiscount + taxAmount;

  const generateInvoiceNumber = () => {
    const now = new Date();
    const datePart = format(now, 'yyyyMMdd');
    const timePart = format(now, 'HHmmss');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${datePart}${timePart}-${random}`;
  };

  const saleMutation = useMutation({
    mutationFn: async (paymentData) => {
      let cashierName = 'Kasir';
      try {
        const me = await base44.auth.me();
        cashierName = me?.full_name || cashierName;
      } catch {}

      let selectedCustomer = paymentData.customer_id
        ? customers.find(c => String(c.id) === String(paymentData.customer_id))
        : null;
      if (!selectedCustomer && paymentData.customer_id) {
        try {
          if (base44.entities.Customer.get) {
            selectedCustomer = await base44.entities.Customer.get(paymentData.customer_id);
          } else {
            const allCustomers = await base44.entities.Customer.list();
            selectedCustomer = (allCustomers || []).find(c => String(c.id) === String(paymentData.customer_id)) || null;
          }
        } catch {}
      }

      const saleData = {
        sale_date: paymentData.sale_date || new Date().toISOString(),
        customer_id: paymentData.customer_id,
        customer_name: paymentData.customer_name,
        customer_address: selectedCustomer?.address || '',
        customer_phone: selectedCustomer?.phone || '',
        items: cart,
        subtotal: subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        discount_amount: discountAmount,
        tax_percent: taxPercent,
        tax_amount: taxAmount,
        total: total,
        payment_method: paymentData.payment_method,
        paid_amount: paymentData.paid_amount,
        change_amount: paymentData.change_amount,
        debt_amount: paymentData.debt_amount,
        due_date: paymentData.due_date,
        notes: paymentData.notes,
        cashier_name: cashierName,
        status: paymentData.payment_method === 'tempo' ? 'unpaid' : 'completed'
      };

      const sale = await base44.entities.Sale.create(saleData);

      // Update customer debt if tempo (Backend doesn't do this automatically yet for generic entities)
      if (paymentData.payment_method === 'tempo' && paymentData.customer_id && paymentData.debt_amount > 0) {
        const customer = customers.find(c => c.id === paymentData.customer_id);
        if (customer) {
          await base44.entities.Customer.update(paymentData.customer_id, {
            total_debt: (customer.total_debt || 0) + paymentData.debt_amount
          });
        }
      }

      return { sale, clientSale: { ...saleData, id: sale.id, invoice_number: sale.invoice_number, sale_date: sale.sale_date } };
    },
    onSuccess: (result) => {
      const clientSale = result?.clientSale || null;
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setShowPayment(false);
      setShowReceipt(false);
      setCompletedSale(null);
      const newKey = Date.now();
      setReceiptKey(newKey);
      setTimeout(() => {
        setCompletedSale(clientSale);
        setShowReceipt(true);
      }, 0);
      clearCart();
      toast.success('Transaksi berhasil!');
    },
    onError: (error) => {
      toast.error('Gagal menyimpan transaksi: ' + error.message);
    }
  });

  const filteredProducts = useMemo(() => {
    return products.filter(p => selectedCategory === 'all' ? true : (p.category || '') === selectedCategory);
  }, [products, selectedCategory]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/10 to-accent/10 dark:from-slate-900 dark:to-slate-950">
      <div className="flex flex-col lg:flex-row h-screen">
        {/* Left - Products */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="flex-1">
              <ProductSearch 
                products={filteredProducts} 
                onSelect={addToCart} 
                autoFocus={scannerSettings.autoFocus}
              />
            </div>
            <div className="shrink-0 self-start md:self-auto">
              <Button variant="outline" size="sm" onClick={() => navigate('/Dashboard')} className="shadow">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali ke Dashboard
              </Button>
            </div>
          </div>
          
          <div className="mt-4 mb-4">
            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="min-h-10 h-auto flex-wrap justify-start gap-1 bg-white/50 dark:bg-slate-800/50 p-1 border shadow-sm">
                <TabsTrigger
                  value="all"
                  className="text-sm md:text-base px-4 py-1.5 font-medium transition-all data-[state=active]:text-primary data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  Semua Produk
                </TabsTrigger>
                {categories
                  .slice()
                  .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                  .map(cat => (
                    <TabsTrigger
                      key={cat.id}
                      value={cat.name}
                      className="text-sm md:text-base px-4 py-1.5 font-medium transition-all data-[state=active]:text-primary data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                      {(cat.name || '').toLowerCase()}
                    </TabsTrigger>
                  ))}
              </TabsList>
            </Tabs>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
            {filteredProducts.map((product) => (
              <Card 
                key={product.id} 
                className="cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all rounded-xl border-slate-200/70 dark:border-slate-800/60"
                onClick={() => addToCart(product)}
              >
                <CardContent className="p-3">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-28 object-cover rounded-md border mb-2"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-28 rounded-md border mb-2 flex items-center justify-center text-slate-400 bg-slate-50">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  <p className="font-medium truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.barcode}</p>
                  {product.category && (
                    <div className="mt-1">
                      <Badge variant="secondary" className="text-[10px] py-0.5 px-2">
                        {product.category}
                      </Badge>
                    </div>
                  )}
                  {(() => {
                    const raw = String(product.default_unit || '').trim();
                    const unit = (raw || 'PCS').toUpperCase();
                    const nonPCS = raw !== '' && unit !== 'PCS';
                    const showUnit = nonPCS ? unit : 'PCS';
                    const price = nonPCS ? product.sell_price_dus : product.sell_price_pcs;
                    return (
                    <>
                      <p className="text-primary dark:text-primary font-semibold mt-1">
                        Rp {price?.toLocaleString('id-ID')} <span className="text-xs text-slate-500">/ {showUnit}</span>
                      </p>
                      {nonPCS && (
                        <p className="text-xs text-slate-500">
                          PCS: Rp {Number(product.sell_price_pcs || 0).toLocaleString('id-ID')}
                        </p>
                      )}
                    </>
                    );
                  })()}
                  <div className="text-xs text-slate-500">
                    <span>Stok: </span>
                    <StockDisplay stockPcs={product.stock_pcs} pcsPerDus={product.pcs_per_dus} unitName={product.default_unit || 'PCS'} showWarning={false} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Right - Cart */}
        <div className="w-full lg:w-[440px] bg-white/90 dark:bg-slate-900/80 backdrop-blur border-l flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Keranjang
              </h2>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-500">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Hapus
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-2 max-h-[40vh] lg:max-h-none">
            {cart.length === 0 ? (
              <div className="text-center text-slate-400 py-8">
                <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Keranjang kosong</p>
                <p className="text-sm">Cari atau klik produk untuk menambah</p>
              </div>
            ) : (
              cart.map((item, index) => (
                <CartItem
                  key={`${item.product_id}-${item.unit}`}
                  item={item}
                  onUpdate={(updated) => updateCartItem(index, updated)}
                  onRemove={() => removeCartItem(index)}
                />
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="sticky bottom-0 backdrop-blur bg-white/85 dark:bg-slate-900/70 border-t p-4 space-y-3">
              {/* Discount */}
              <div className="flex gap-2">
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">%</SelectItem>
                    <SelectItem value="nominal">Rp</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    placeholder="Diskon"
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Tax */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500 w-20">Pajak %</span>
                <Input
                  type="number"
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="flex-1"
                />
              </div>

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>Rp {subtotal.toLocaleString('id-ID')}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Diskon</span>
                    <span>- Rp {discountAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span>Pajak ({taxPercent}%)</span>
                    <span>Rp {taxAmount.toLocaleString('id-ID')}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between text-xl font-bold pt-2 border-t">
                <span>TOTAL</span>
                <span className="text-blue-600 dark:text-blue-400">Rp {total.toLocaleString('id-ID')}</span>
              </div>

              <Button 
                className="w-full h-12 text-lg" 
                onClick={() => setShowPayment(true)}
                disabled={cart.length === 0}
              >
                <Calculator className="w-5 h-5 mr-2" />
                Bayar
              </Button>
            </div>
          )}
        </div>
      </div>

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        total={total}
        customers={customers}
        onSubmit={(data) => saleMutation.mutate(data)}
        isSubmitting={saleMutation.isPending}
      />

      <ReceiptModal
        key={receiptKey}
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        sale={completedSale}
        storeName={getSettings().store_name}
      />

      {mobileMode && (
        <>
          <button
            type="button"
            className="lg:hidden fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center"
            onClick={() => setShowMobileScan(true)}
            aria-label="Scan barcode"
          >
            <Barcode className="w-6 h-6" />
          </button>
          <Dialog open={showMobileScan} onOpenChange={setShowMobileScan}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Scan Barcode</DialogTitle>
              </DialogHeader>
              <BarcodeScanner
                onDetected={(code) => {
                  const text = String(code || '').trim();
                  if (!text) return;
                  const product = products.find(p => String(p.barcode || '').trim() === text);
                  if (product) {
                    addToCart(product);
                    toast.success('Produk ditambahkan');
                    setShowMobileScan(false);
                  } else {
                    toast.error('Barcode tidak ditemukan');
                  }
                }}
                onClose={() => setShowMobileScan(false)}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
