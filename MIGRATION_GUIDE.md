# Panduan Migrasi Database ke Supabase

## Langkah 1: Siapkan Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard)
2. Pilih proyek Anda
3. Buka **SQL Editor**
4. Jalankan file `supabase_schema.sql` untuk membuat semua tabel

## Langkah 2: Dapatkan Service Role Key

1. Di Supabase Dashboard, buka **Project Settings** → **API**
2. Salin `service_role` key (bukan `anon public`!)
3. Paste ke file `.env` pada baris:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

## Langkah 3: Konfigurasi Database MySQL

Pastikan konfigurasi MySQL di file `.env` sudah benar:
```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=basee_app
```

## Langkah 4: Jalankan Migrasi

Jalankan script migrasi:
```bash
node migrate_to_supabase.js
```

Script ini akan:
- Membaca semua data dari MySQL
- Memindahkan ke Supabase
- Menangani conflict berdasarkan `id`

## Catatan Penting

1. **Backup Data**: Selalu backup database MySQL sebelum migrasi!
2. **Service Role Key**: Jangan pernah commit `service_role` key ke git!
3. **Test**: Jalankan migrasi di environment staging terlebih dahulu

## Tabel yang Dimigrasikan

- `branches` - Data cabang
- `units` - Satuan produk
- `categories` - Kategori produk
- `customers` - Data pelanggan
- `suppliers` - Data supplier
- `products` - Data produk
- `product_batches` - Batch produk (FIFO)
- `stock_mutations` - Mutasi stok
- `stock_transfers` - Transfer stok antar cabang
- `purchases` - Data pembelian
- `sales` - Data penjualan
- `payments` - Data pembayaran
- `users` - Data pengguna
- `user_branches` - Mapping pengguna ke cabang
- `app_subscriptions` - Langganan aplikasi
- `app_licenses` - Lisensi aplikasi
