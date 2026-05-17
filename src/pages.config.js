/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Dashboard from './pages/Dashboard';
import Kasir from './pages/Kasir';
import Kategori from './pages/Kategori';
import Laporan from './pages/Laporan';
import MutasiStok from './pages/MutasiStok';
import Pelanggan from './pages/Pelanggan';
import Pembelian from './pages/Pembelian';
import Produk from './pages/Produk';
import RiwayatPenjualan from './pages/RiwayatPenjualan';
import Satuan from './pages/Satuan';
import Supplier from './pages/Supplier';
import UtangPiutang from './pages/UtangPiutang';
import User from './pages/User';
import Login from './pages/Login';
import Pengaturan from './pages/Pengaturan';
import Lisensi from './pages/Lisensi';
import GenerateLisensi from './pages/GenerateLisensi';
import __Layout from './Layout.jsx';
import Cabang from './pages/Cabang';
import TransferBarang from './pages/TransferBarang';
import SuratJalan from './pages/SuratJalan';


export const PAGES = {
    "Dashboard": Dashboard,
    "Kasir": Kasir,
    "Kategori": Kategori,
    "Laporan": Laporan,
    "MutasiStok": MutasiStok,
    "Pelanggan": Pelanggan,
    "Pembelian": Pembelian,
    "Produk": Produk,
    "Satuan": Satuan,
    "RiwayatPenjualan": RiwayatPenjualan,
    "Supplier": Supplier,
    "UtangPiutang": UtangPiutang,
    "User": User,
    "Login": Login,
    "Pengaturan": Pengaturan,
    "Lisensi": Lisensi,
    "GenerateLisensi": GenerateLisensi,
    "Cabang": Cabang,
    "TransferBarang": TransferBarang,
    "SuratJalan": SuratJalan,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};
