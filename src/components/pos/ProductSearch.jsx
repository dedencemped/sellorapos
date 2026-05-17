import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Search, Barcode, Image as ImageIcon } from "lucide-react";
import StockDisplay from "@/components/pos/StockDisplay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import BarcodeScanner from "@/components/BarcodeScanner.jsx";

export default function ProductSearch({ products, onSelect, placeholder = "Cari produk / scan barcode...", autoFocus = false }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Expose focus method to parent
  useEffect(() => {
    window.focusProductSearch = () => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    };
  }, []);
  const dropdownRef = useRef(null);
  const [showScan, setShowScan] = useState(false);
  const lastAutoRef = useRef('');

  useEffect(() => {
    const text = String(query || '').trim();
    if (text.length > 0) {
      const exact = products.find(p => String(p.barcode || '').trim() === text);
      if (exact && lastAutoRef.current !== text) {
        lastAutoRef.current = text;
        // Auto-select exact barcode match
        onSelect(exact);
        setQuery('');
        setIsOpen(false);
        inputRef.current?.focus();
        return;
      }
      const filtered = products.filter(p => 
        p.name?.toLowerCase().includes(text.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(text.toLowerCase())
      ).slice(0, 10);
      setFilteredProducts(filtered);
      setIsOpen(filtered.length > 0);
    } else {
      lastAutoRef.current = '';
      setFilteredProducts([]);
      setIsOpen(false);
    }
  }, [query, products]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (p) => {
    onSelect(p);
    setQuery('');
    setIsOpen(false);
    if (autoFocus && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length === 1) {
        handleSelect(filteredProducts[0]);
      } else if (filteredProducts.length > 0) {
        // Find exact barcode match
        const exact = filteredProducts.find(p => String(p.barcode || '').trim() === query.trim());
        if (exact) {
          handleSelect(exact);
        }
      }
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className="pl-10 h-12 text-lg"
        />
        <Dialog open={showScan} onOpenChange={setShowScan}>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Scan barcode"
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onClick={() => setShowScan(true)}
            >
              <Barcode className="w-5 h-5 text-slate-400 hover:text-slate-600" />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Scan Barcode</DialogTitle>
            </DialogHeader>
            <BarcodeScanner
              onDetected={(code) => {
                const text = String(code || '').trim();
                if (!text) return;
                const exact = products.find(p => String(p.barcode || '').trim() === text);
                if (exact) {
                  onSelect(exact);
                  setQuery('');
                  setIsOpen(false);
                  setShowScan(false);
                } else {
                  setQuery(text);
                }
              }}
              onClose={() => setShowScan(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
      
      {isOpen && (
        <div 
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-80 overflow-auto"
        >
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              type="button"
              className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded object-cover border" />
                ) : (
                  <div className="w-10 h-10 rounded border flex items-center justify-center text-slate-400">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{product.name}</p>
                  <p className="text-sm text-slate-500 truncate">{product.barcode}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                {(() => {
                  const raw = String(product.default_unit || '').trim();
                  const unit = (raw || 'PCS').toUpperCase();
                  const nonPCS = raw !== '' && unit !== 'PCS';
                  const showUnit = nonPCS ? unit : 'PCS';
                  const price = nonPCS ? product.sell_price_dus : product.sell_price_pcs;
                  return (
                    <p className="font-semibold text-blue-600 dark:text-blue-400">
                      Rp {price?.toLocaleString('id-ID')} <span className="text-xs text-slate-500">/ {showUnit}</span>
                    </p>
                  );
                })()}
                <p className="text-xs text-slate-500">
                  Stok: <StockDisplay stockPcs={product.stock_pcs} pcsPerDus={product.pcs_per_dus} unitName={product.default_unit || 'PCS'} showWarning={false} />
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
