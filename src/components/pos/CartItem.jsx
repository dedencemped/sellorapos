import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Minus, Image as ImageIcon } from "lucide-react";

export default function CartItem({ item, onUpdate, onRemove }) {

  const handleQtyChange = (newQty) => {
    if (newQty < 1) return;
    onUpdate({ ...item, qty: newQty });
  };

  const handleUnitChange = (unit) => {
    const price = unit === (item.unit_label || 'DUS') ? item.sell_price_dus : item.sell_price_pcs;
    onUpdate({ ...item, unit, price });
  };

  return (
    <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
      {item.image_url ? (
        <img src={item.image_url} alt={item.product_name} className="w-12 h-12 rounded object-cover border" />
      ) : (
        <div className="w-12 h-12 rounded border flex items-center justify-center text-slate-400 bg-white">
          <ImageIcon className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 leading-snug whitespace-normal break-words">
          {item.product_name}
        </p>
        <p className="text-base font-bold text-blue-600 mt-0.5">
          Rp {item.price?.toLocaleString('id-ID')} <span className="text-xs text-slate-500">/ {item.unit}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.pcs_per_dus > 1 && (item.unit_label || 'DUS') !== 'PCS' && (
            <Select value={item.unit} onValueChange={handleUnitChange}>
              <SelectTrigger className="w-24 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PCS">PCS</SelectItem>
                <SelectItem value={(item.unit_label || 'DUS')}>{(item.unit_label || 'DUS')}</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => handleQtyChange(item.qty - 1)}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Input
              type="number"
              value={item.qty}
              onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
              className="w-20 h-9 text-center"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => handleQtyChange(item.qty + 1)}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      
      <div className="text-right min-w-[110px]">
        <p className="font-semibold text-slate-900">Rp {(item.qty * item.price).toLocaleString('id-ID')}</p>
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
        onClick={onRemove}
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
