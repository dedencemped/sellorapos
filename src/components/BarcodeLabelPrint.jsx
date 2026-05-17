import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JsBarcode from "jsbarcode";
import { toast } from "sonner";

const mmToPx = (mm) => Math.round(mm * 3.78);

export default function BarcodeLabelPrint({ open, onOpenChange, product }) {
  const [copies, setCopies] = useState(1);
  const [format, setFormat] = useState("CODE128");
  const [widthMm, setWidthMm] = useState(50);
  const [heightMm, setHeightMm] = useState(30);
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(false);
  const [images, setImages] = useState([]);
  const canvasRef = useRef(null);

  const code = useMemo(() => String(product?.barcode || "").trim(), [product]);
  const name = useMemo(() => String(product?.name || ""), [product]);
  const price = useMemo(() => {
    const raw = Number(product?.sell_price_pcs || product?.sell_price_dus || 0) || 0;
    return raw > 0 ? `Rp ${raw.toLocaleString("id-ID")}` : "";
  }, [product]);

  const isEAN13Valid = useMemo(() => /^[0-9]{12,13}$/.test(code), [code]);

  useEffect(() => {
    if (!open) return;
    if (!code) {
      setImages([]);
      return;
    }

    const labelW = mmToPx(widthMm);
    const labelH = mmToPx(heightMm);
    const barHeight = Math.max(20, Math.round(labelH * 0.55));
    const nameArea = showName ? Math.min(28, Math.round(labelH * 0.22)) : 0;
    const priceArea = showPrice ? Math.min(20, Math.round(labelH * 0.18)) : 0;

    const makeOne = () => {
      const canvas = document.createElement("canvas");
      canvas.width = labelW;
      canvas.height = labelH;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, labelW, labelH);

      try {
        const barCanvas = document.createElement("canvas");
        JsBarcode(barCanvas, code, {
          format: format === "EAN13" ? "EAN13" : "CODE128",
          lineColor: "#000",
          background: "#fff",
          width: Math.max(1, Math.floor(labelW / 150)),
          height: barHeight,
          displayValue: true,
          fontSize: 12,
          margin: 0,
          textMargin: 2,
          valid: (val) => {
            if (format === "EAN13" && !isEAN13Valid) {
              return false;
            }
            return !!val;
          },
        });

        let y = 0;
        if (showName) {
          ctx.fillStyle = "#000";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const text = name.length > 28 ? name.slice(0, 27) + "…" : name;
          ctx.fillText(text, Math.round(labelW / 2), Math.round(nameArea / 2));
          y += nameArea;
        }

        ctx.drawImage(barCanvas, 0, y, labelW, barHeight);
        y += barHeight;

        if (showPrice && price) {
          ctx.fillStyle = "#000";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(price, Math.round(labelW / 2), Math.min(labelH - 8, y + Math.round(priceArea / 2)));
        }
      } catch (e) {
        console.error(e);
      }
      return canvas.toDataURL("image/png");
    };

    try {
      const imgs = Array.from({ length: Math.max(1, Math.min(200, Number(copies) || 1)) }, () => makeOne());
      setImages(imgs);
    } catch (e) {
      toast.error("Gagal menghasilkan label barcode");
      setImages([]);
    }
  }, [open, code, copies, format, widthMm, heightMm, showName, showPrice, name, price, isEAN13Valid]);

  const handlePrint = () => {
    if (!images.length) {
      toast.error("Tidak ada label untuk dicetak");
      return;
    }
    const w = window.open("", "_blank");
    if (!w) return;
    const colWidth = `${widthMm}mm`;
    const rowHeight = `${heightMm}mm`;
    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Cetak Label</title>
    <style>
      @page { size: auto; margin: 8mm; }
      body { font-family: sans-serif; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(${colWidth}, 1fr)); gap: 3mm; }
      .label { width: ${colWidth}; height: ${rowHeight}; display: flex; align-items: center; justify-content: center; border: 1px dashed #ccc; }
      .label img { width: 100%; height: 100%; object-fit: contain; }
      @media print {
        .label { border: none; }
      }
    </style>
  </head>
  <body>
    <div class="grid">
      ${images.map((src) => `<div class="label"><img src="${src}" /></div>`).join("")}
    </div>
    <script>window.onload = () => setTimeout(() => window.print(), 100);</script>
  </body>
</html>`;
    w.document.write(html);
    w.document.close();
  };

  const eanBlocked = format === "EAN13" && !isEAN13Valid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cetak Label Barcode</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-3">
            <div>
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger><SelectValue placeholder="Pilih format" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CODE128">CODE128</SelectItem>
                  <SelectItem value="EAN13" disabled={!isEAN13Valid}>EAN-13</SelectItem>
                </SelectContent>
              </Select>
              {eanBlocked && <p className="text-xs text-red-600 mt-1">EAN-13 membutuhkan 12/13 digit angka</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Lebar (mm)</Label>
                <Input type="number" value={widthMm} min={30} max={100} onChange={(e) => setWidthMm(Number(e.target.value))} />
              </div>
              <div>
                <Label>Tinggi (mm)</Label>
                <Input type="number" value={heightMm} min={20} max={70} onChange={(e) => setHeightMm(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <Label>Jumlah Label</Label>
              <Input type="number" value={copies} min={1} max={200} onChange={(e) => setCopies(Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} />
                Tampilkan Nama
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
                Tampilkan Harga
              </label>
            </div>
            <Button onClick={handlePrint} disabled={eanBlocked}>Cetak</Button>
          </div>
          <div className="lg:col-span-2">
            <Label>Preview</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
              {images.slice(0, 6).map((src, idx) => (
                <div key={idx} className="border rounded p-2 flex items-center justify-center" style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }}>
                  <img src={src} alt={`label-${idx}`} className="max-w-full max-h-full object-contain" />
                </div>
              ))}
              {images.length === 0 && (
                <div className="text-sm text-slate-500">Tidak ada preview</div>
              )}
            </div>
          </div>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
