import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
} 


export const isIframe = typeof window !== 'undefined' && window.self !== window.top;

export function getErrorText(error) {
  try {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (typeof error?.message === 'string') return error.message;
    return String(error);
  } catch {
    return '';
  }
}

export function formatCrudError(error, options = {}) {
  const entityLabel = String(options.entityLabel || 'Data');
  const raw = getErrorText(error).trim();
  if (!raw) return `Gagal menyimpan ${entityLabel}`;

  const parsedMessage = (() => {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim();
        if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim();
        if (typeof obj.detail === 'string' && obj.detail.trim()) return obj.detail.trim();
      }
      return raw;
    } catch {
      return raw;
    }
  })();

  const msg = String(parsedMessage || raw).trim();
  const lower = msg.toLowerCase();

  const isDuplicate = lower.includes('er_dup_entry')
    || lower.includes('duplicate entry')
    || lower.includes('duplicate key')
    || lower.includes('unique constraint')
    || lower.includes('already exists')
    || lower.includes('sudah ada')
    || lower.includes('sudah terdaftar')
    || lower.includes('duplikat');

  if (isDuplicate) {
    if (lower.includes('barcode')) return 'Barcode sudah ada. Gunakan barcode lain atau edit produk yang sudah ada.';
    if (lower.includes('nama') || lower.includes('name')) return 'Nama produk sudah ada. Gunakan nama lain atau edit produk yang sudah ada.';
    return `Data sudah ada (duplikat). Periksa kembali input ${entityLabel}.`;
  }

  const isRequired = lower.includes('required')
    || lower.includes('wajib')
    || lower.includes('tidak boleh kosong')
    || lower.includes('cannot be null')
    || lower.includes('must not be empty');
  if (isRequired) return msg;

  const isForbidden = lower.includes('forbidden') || lower.includes('tidak diizinkan') || lower.includes('unauthorized');
  if (isForbidden) return 'Tidak diizinkan. Silakan login ulang atau minta akses admin.';

  return msg;
}
