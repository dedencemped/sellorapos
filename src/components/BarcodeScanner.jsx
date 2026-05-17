import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, StopCircle } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const cams = await BrowserMultiFormatReader.listVideoInputDevices();
        setDevices(cams);
        if (cams.length > 0) {
          setSelectedDeviceId(cams[0].deviceId);
        }
      } catch {
        toast.error("Kamera tidak tersedia atau izin ditolak");
      }
    };
    init();
    return () => {
      stop();
    };
  }, []);

  const start = async () => {
    try {
      if (!selectedDeviceId) {
        toast.error("Tidak ada kamera yang tersedia");
        return;
      }
      stop();
      const reader = new BrowserMultiFormatReader();
      codeReaderRef.current = reader;
      setRunning(true);
      await reader.decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result, err) => {
        if (result) {
          const text = result.getText();
          if (onDetected) onDetected(text);
        }
      });
    } catch (e) {
      setRunning(false);
      toast.error("Gagal memulai scanner");
    }
  };

  const stop = () => {
    if (codeReaderRef.current) {
      try {
        codeReaderRef.current.reset();
      } catch {}
      codeReaderRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pilih kamera" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.deviceId} value={d.deviceId}>
                {d.label || "Kamera"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {running ? (
          <Button variant="outline" onClick={stop}>
            <StopCircle className="w-4 h-4 mr-2" />
            Stop
          </Button>
        ) : (
          <Button onClick={start}>
            <Camera className="w-4 h-4 mr-2" />
            Mulai
          </Button>
        )}
      </div>
      <div className="rounded-lg overflow-hidden border">
        <video ref={videoRef} className="w-full aspect-video bg-black" />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => { stop(); onClose && onClose(); }}>
          Tutup
        </Button>
      </div>
    </div>
  );
}
