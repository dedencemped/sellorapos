import React from 'react';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function StockDisplay({ stockPcs, pcsPerDus = 1, minStock = 0, showWarning = true, unitName = 'DUS' }) {
  const pcsPerUnit = Number(pcsPerDus || 1) || 1;
  const stock = Math.max(0, Number(stockPcs || 0) || 0);
  const unitQty = pcsPerUnit > 0 ? Math.floor(stock / pcsPerUnit) : 0;
  const pcs = pcsPerUnit > 0 ? (stock % pcsPerUnit) : stock;
  const unitUpper = String(unitName || '').trim().toUpperCase();
  const packLabel = unitUpper && unitUpper !== 'PCS' ? unitUpper : 'DUS';
  const isLowStock = stock <= (Number(minStock || 0) || 0) && showWarning;
  
  return (
    <div className="flex items-center gap-2">
      <span className={cn("font-medium", isLowStock && "text-red-600")}>
        {pcsPerUnit > 1 ? (
          `${unitQty} ${packLabel} + ${pcs} PCS`
        ) : (
          `${stock} PCS`
        )}
      </span>
      {isLowStock && (
        <Badge variant="destructive" className="text-xs">Stok Menipis</Badge>
      )}
    </div>
  );
}
