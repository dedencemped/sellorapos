import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext.jsx';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, User2, Eye, EyeOff } from "lucide-react";
import { getSettings } from '@/lib/settings';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();
  const params = new URLSearchParams(location.search);
  const returnUrl = params.get('return') || '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState('Aplikasi');
  const [logoUrl, setLogoUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  

  useEffect(() => {
    const s = getSettings();
    setStoreName(s.store_name || 'Aplikasi');
    setLogoUrl(s.logo_url || '');
    const onSettings = (e) => {
      const next = e?.detail || getSettings();
      setStoreName(next.store_name || 'Aplikasi');
      setLogoUrl(next.logo_url || '');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('settings:updated', onSettings);
      return () => window.removeEventListener('settings:updated', onSettings);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      const isEdge = typeof navigator !== 'undefined' && /Edg\//.test(navigator.userAgent || '');
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('login_success', '1');
      }
      if (isEdge && typeof window !== 'undefined') {
        window.location.replace(returnUrl);
      } else {
        toast.success('Login berhasil');
        navigate(returnUrl, { replace: true });
      }
    } catch (e1) {
      toast.error(e1?.message || 'Login gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-primary/10 to-accent/10 dark:from-slate-950 dark:to-slate-900 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 bg-primary/20 blur-3xl rounded-full" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-72 h-72 bg-blue-500/20 blur-3xl rounded-full" />
      <div className="relative w-full max-w-4xl">
        <Card className="overflow-hidden shadow-xl border-slate-200/70 dark:border-slate-800/60">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="hidden md:flex flex-col justify-center bg-gradient-to-br from-primary/90 to-primary rounded-r-none p-12 text-primary-foreground">
              <div className="flex flex-col gap-4">
                <div className="inline-flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" className="h-20 w-20 object-contain rounded-2xl bg-white/10 p-3" />
                  ) : (
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/10">
                      <Lock className="w-10 h-10" />
                    </div>
                  )}
                  <span className="font-semibold text-4xl leading-tight">{storeName}</span>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold tracking-tight">Selamat Datang</h2>
                  <p className="text-white/80 text-sm">Kelola kasir, stok, dan laporan dengan mudah.</p>
                </div>
              </div>
            </div>
            <div className="p-6 md:p-8">
              <div className="mb-6 md:hidden">
                <div className="flex items-center gap-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" className="h-14 w-14 object-contain rounded-xl bg-primary/10 p-2" />
                  ) : (
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary text-primary-foreground">
                      <Lock className="w-7 h-7" />
                    </div>
                  )}
                  <div>
                    <h1 className="text-3xl font-bold leading-tight">{storeName}</h1>
                    <p className="text-xs text-slate-500">Masuk ke Aplikasi</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <div className="relative">
                    <User2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      className="pl-9 h-11"
                      autoComplete="username"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pl-9 pr-10 h-11"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                      aria-label="Toggle password"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 text-[15px]" disabled={loading}>
                  {loading ? 'Memproses...' : 'Masuk'}
                </Button>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => setShowForgot(true)}
                  >
                    Lupa password?
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Card>
        <Dialog open={showForgot} onOpenChange={setShowForgot}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Silakan hubungi admin untuk reset password akun Anda. Admin dapat mengganti password melalui menu User.
              </p>
              <div className="text-xs text-slate-500">
                Tips: gunakan username yang terdaftar dan minta admin mengubah password sementara.
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
