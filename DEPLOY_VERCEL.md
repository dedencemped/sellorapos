# Panduan Deploy ke Vercel dengan Supabase

## Prasyarat

1. Akun Vercel (https://vercel.com)
2. Akun Supabase (sudah dibuat dan data sudah dimigrasikan)
3. Repository Git (GitHub, GitLab, atau Bitbucket)

## Langkah 1: Push Kode ke Git

1. Inisialisasi repository Git (jika belum):
```bash
git init
git add .
git commit -m "Initial commit"
```

2. Push ke GitHub/GitLab/Bitbucket

## Langkah 2: Setup Environment Variables di Vercel

1. Buka [Vercel Dashboard](https://vercel.com/dashboard)
2. Klik **Add New Project**
3. Pilih repository Anda
4. Di bagian **Environment Variables**, tambahkan:
   - `VITE_SUPABASE_URL` → nilai dari file `.env` Anda
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → nilai dari file `.env` Anda

## Langkah 3: Deploy Frontend ke Vercel

1. Klik **Deploy**
2. Tunggu proses deploy selesai
3. Setelah selesai, Anda akan mendapatkan URL seperti `https://your-app.vercel.app`

## Catatan Tentang Backend

Aplikasi ini memiliki backend Node.js (`server/index.js`) yang saat ini menggunakan MySQL. Untuk Vercel, Anda punya beberapa opsi:

### Opsi 1: Deploy Backend ke Layanan Lain (Rekomendasi untuk Sekarang)

- Deploy backend ke **Render**, **Railway**, atau **Supabase Edge Functions**
- Update variabel `VITE_LOCAL_API_URL` di Vercel untuk menunjuk ke URL backend Anda

### Opsi 2: Konversi ke Vercel Serverless Functions

Butuh pekerjaan tambahan untuk mengkonversi backend menjadi Serverless Functions.

## Langkah 4: Test Aplikasi

1. Buka URL Vercel Anda
2. Login dan test fitur-fitur utama
3. Pastikan koneksi ke Supabase berjalan dengan baik

## Troubleshooting

**Masalah: Environment Variables tidak terbaca**
- Pastikan variabel dimulai dengan `VITE_` (untuk Vite)
- Redeploy setelah mengubah environment variables

**Masalah: Routing tidak berfungsi**
- File `vercel.json` sudah mengatur rewrite untuk SPA
- Pastikan file `vercel.json` ada di root project
