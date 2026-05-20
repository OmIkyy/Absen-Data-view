/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {useState, useEffect} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Camera, History, LogIn, CheckCircle2, User, Lock, ArrowLeft} from 'lucide-react';
import {AttendanceForm} from './components/AttendanceForm';
import {AdminDashboard} from './components/AdminDashboard';
import {AdminLogin} from './components/AdminLogin';
import {cn} from './lib/utils';
import {APP_CONFIG} from './config';

type View = 'clock-in' | 'admin-login' | 'admin-dashboard' | 'success';

export default function App() {
  const [view, setView] = useState<View>('clock-in');
  const [lastEntry, setLastEntry] = useState<{name: string; time: string} | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const isConfigured = !!import.meta.env.VITE_SUPABASE_URL && (!!import.meta.env.VITE_SUPABASE_ANON_KEY || !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleSuccess = (name: string) => {
    setLastEntry({
      name,
      time: new Date().toLocaleTimeString('id-ID'),
    });
    setView('success');
    setTimeout(() => setView('clock-in'), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 border-[8px] md:border-[16px] border-slate-200">
      {/* Top Header Section */}
      <header className="h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex justify-between items-center shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setView('clock-in')}
            className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all shadow-lg shadow-blue-200 overflow-hidden"
          >
            {APP_CONFIG.logoUrl ? (
              <img src={APP_CONFIG.logoUrl} alt="Logo" className="w-full h-full object-cover" onError={(e) => {
                // Fallback if image not found
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>';
              }} />
            ) : (
              <LogIn className="text-white" size={24} />
            )}
          </div>
          <span className="font-bold text-lg md:text-xl tracking-tight uppercase hidden sm:inline">
            {APP_CONFIG.name} <span className="text-blue-600 font-extrabold">{APP_CONFIG.nameAccent}</span>
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right border-r border-slate-200 pr-4 mr-2 hidden xs:block">
            <p className="text-xl md:text-2xl font-mono font-bold leading-none">
              {currentTime.toLocaleTimeString('id-ID')}
            </p>
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">
              {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button 
            onClick={() => setView(view === 'admin-dashboard' ? 'clock-in' : 'admin-login')}
            className={cn(
              "p-2 rounded-xl transition-all duration-300",
              view === 'admin-login' || view === 'admin-dashboard' ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 hover:text-slate-600"
            )}
            title="Admin Login"
          >
            <Lock size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 flex flex-col items-center min-h-[calc(100vh-120px)]">
        {!isConfigured && (
          <div className="bg-orange-50 border-2 border-orange-200 p-8 rounded-3xl text-center max-w-sm mb-10 shadow-xl">
            <span className="text-4xl mb-4 block">⚠️</span>
            <h3 className="font-bold text-orange-800 text-lg mb-2">Konfigurasi Dibutuhkan</h3>
            <p className="text-orange-700/70 text-sm leading-relaxed mb-4">
              Aplikasi ini memerlukan API Key Supabase untuk menyimpan data. 
            </p>
            <div className="bg-orange-100 p-3 rounded-xl text-[10px] font-mono text-left text-orange-900 border border-orange-200">
              Buka menu <b>Settings &gt; Secrets</b><br/>
              Tambahkan:<br/>
              1. VITE_SUPABASE_URL<br/>
              2. VITE_SUPABASE_ANON_KEY
            </div>
          </div>
        )}
        <AnimatePresence mode="wait">
          {view === 'clock-in' && (
            <motion.div
              key="clock-in"
              initial={{opacity: 0, y: 10}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -10}}
              className="w-full max-w-2xl"
            >
              <div className="mb-8 text-center sm:text-left">
                <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 tracking-tight mb-2">Presensi Kehadiran</h1>
                <p className="text-slate-500 text-sm md:text-base">Silahkan masukkan nama dan ambil foto kehadiran Anda secara real-time.</p>
              </div>
              <AttendanceForm onSuccess={handleSuccess} />
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div
              key="success"
              initial={{opacity: 0, scale: 0.95}}
              animate={{opacity: 1, scale: 1}}
              className="text-center bg-white p-8 md:p-12 rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full mt-10"
            >
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-100">
                <CheckCircle2 size={40} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Berhasil Terabsen!</h2>
              <p className="text-slate-500 mb-4">
                Terima kasih, <span className="font-bold text-slate-900">{lastEntry?.name}</span>.
              </p>
              <div className="bg-slate-50 p-4 rounded-2xl inline-block border border-slate-100">
                <p className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Waktu Masuk</p>
                <p className="text-2xl font-mono font-bold text-blue-600">{lastEntry?.time}</p>
              </div>
            </motion.div>
          )}

          {view === 'admin-login' && (
            <motion.div
              key="admin-login"
              initial={{opacity: 0, scale: 0.95}}
              animate={{opacity: 1, scale: 1}}
              className="w-full max-w-md"
            >
              <button 
                onClick={() => setView('clock-in')}
                className="flex items-center gap-2 mb-6 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft size={14} /> Kembali
              </button>
              <AdminLogin onSuccess={() => setView('admin-dashboard')} />
            </motion.div>
          )}

          {view === 'admin-dashboard' && (
            <motion.div
              key="admin-dashboard"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              className="w-full"
            >
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                <h2 className="text-3xl font-extrabold text-slate-800">Rekap Arus Absensi</h2>
                <button 
                  onClick={() => setView('clock-in')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs uppercase tracking-widest font-bold hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                >
                  Keluar Dashboard
                </button>
              </div>
              <AdminDashboard />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="h-12 bg-white border-t border-slate-200 px-4 md:px-8 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-auto">
        <div className="flex gap-4 md:gap-6 overflow-hidden">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="hidden xs:inline">DG SYSTEM</span> STABLE
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            V 2.5.0 <span className="hidden xs:inline">SYNC</span>
          </div>
        </div>
        <div className="text-right truncate ml-4">&copy; 2026 Dg-Komputer</div>
      </footer>
    </div>
  );
}
