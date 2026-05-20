import React, {useState, useRef, useEffect} from 'react';
import {Camera, User, Search, MapPin, Briefcase, Phone, Home, Clock} from 'lucide-react';
import {supabase, type Employee} from '../lib/supabase';
import {cn} from '../lib/utils';
import {motion, AnimatePresence} from 'motion/react';
import {APP_CONFIG} from '../config';

interface AttendanceFormProps {
  onSuccess: (name: string) => void;
}

type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit';

const playBeep = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(APP_CONFIG.beepFrequency, audioCtx.currentTime); 
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.15);
  } catch (e) {
    console.warn("Audio failure:", e);
  }
};

export function AttendanceForm({onSuccess}: AttendanceFormProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>('Hadir');
  const [isSearching, setIsSearching] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [location, setLocation] = useState<{lat: number; lng: number} | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    startCamera();
    captureLocation();
    return () => {
      stopCamera();
    };
  }, []);

  const captureLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (err) => {
          console.error("Location error:", err);
          // Don't block UI but record error
        }
      );
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user'},
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Gagal mengakses kamera. Pastikan izin kamera diberikan.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleSearchID = async () => {
    if (!employeeId.trim()) return;
    if (!supabase) {
      setError("Konfigurasi Supabase tidak ditemukan.");
      return;
    }
    
    setIsSearching(true);
    setError(null);
    setEmployee(null);

    try {
      const {data, error: fetchError} = await supabase
        .from('employees')
        .select('*')
        .eq('id', employeeId)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          throw new Error("ID Karyawan tidak ditemukan.");
        }
        throw fetchError;
      }

      setEmployee(data);
    } catch (err: any) {
      setError(err.message || "Gagal mencari data karyawan.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) {
      setError("Silakan cari ID karyawan terlebih dahulu.");
      return;
    }

    if (!videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);
    setError(null);

    try {
      if (!supabase) {
        throw new Error("Supabase belum dikonfigurasi. Silakan masukkan VITE_SUPABASE_URL & KEY di menu Settings > Secrets.");
      }

      // 1. Check if already attended today (Limit 1x per day)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: existing, error: checkError } = await supabase
        .from('attendance')
        .select('id')
        .eq('employee_id', employee.id)
        .gte('created_at', today.toISOString())
        .limit(1);

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        throw new Error("ANDA SUDAH ABSEN HARI INI. Batas absensi adalah 1 kali per hari. Silakan kembali besok.");
      }

      // 2. Capture frame
      const context = canvasRef.current.getContext('2d');
      if (context) {
        const maxWidth = 800;
        const aspectRatio = videoRef.current.videoHeight / videoRef.current.videoWidth;
        const targetWidth = Math.min(videoRef.current.videoWidth, maxWidth);
        const targetHeight = targetWidth * aspectRatio;

        canvasRef.current.width = targetWidth;
        canvasRef.current.height = targetHeight;
        
        context.save();
        context.translate(targetWidth, 0);
        context.scale(-1, 1);
        context.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight);
        context.restore();

        // Overlay: timestamp + location stamp (bottom band)
        const now = new Date();
        const timeStr = now.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
        const locStr = location
          ? `Lokasi: ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`
          : 'Lokasi: tidak tersedia';
        const bandHeight = Math.round(targetHeight * 0.13);
        const bandY = targetHeight - bandHeight;
        context.fillStyle = 'rgba(0,0,0,0.55)';
        context.fillRect(0, bandY, targetWidth, bandHeight);
        context.fillStyle = '#ffffff';
        const fontSize = Math.max(12, Math.round(targetWidth * 0.025));
        context.font = `bold ${fontSize}px Arial, sans-serif`;
        context.textBaseline = 'top';
        context.fillText(`${employee.name}  (${status})`, 14, bandY + 8);
        context.font = `${Math.round(fontSize * 0.85)}px Arial, sans-serif`;
        context.fillText(timeStr, 14, bandY + 8 + fontSize + 4);
        context.fillText(locStr, 14, bandY + 8 + fontSize * 2 + 8);
        // Red dot marker
        context.fillStyle = '#ef4444';
        context.beginPath();
        context.arc(targetWidth - 22, bandY + 22, 8, 0, Math.PI * 2);
        context.fill();

        const photoData = canvasRef.current.toDataURL('image/jpeg', 0.7);

        // Upload
        const {error: uploadError} = await supabase
          .from('attendance')
          .insert([
            {
              employee_id: employee.id,
              employee_name: employee.name,
              photo_url: photoData,
              status: status,
              latitude: location?.lat,
              longitude: location?.lng,
            }
          ]);

        if (uploadError) {
          if (uploadError.message?.includes('schema cache')) {
            throw new Error("Tabel 'employees' atau 'attendance' belum siap di Supabase.");
          }
          throw new Error(uploadError.message);
        }

        // Play feedback sound
        playBeep();

        onSuccess(employee.name);
      }
    } catch (err: any) {
      console.error("Submission error:", err);
      setError(err.message || "Terjadi kesalahan saat menyimpan data.");
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: ID Search */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6">
        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest px-1">Langkah 1: Verifikasi ID Karyawan</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input 
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={employeeId}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setEmployeeId(val);
              }}
              placeholder="Masukkan ID (contoh: 103939)"
              className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 transition-all font-bold"
            />
          </div>
          <button 
            type="button"
            onClick={handleSearchID}
            disabled={isSearching || !employeeId.trim()}
            className="px-6 bg-slate-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-slate-800 disabled:opacity-50 transition-all"
          >
            {isSearching ? "Cari..." : "Verifikasi"}
          </button>
        </div>

        {/* Employee Info Result */}
        <AnimatePresence>
          {employee && (
            <motion.div 
              initial={{opacity: 0, height: 0}}
              animate={{opacity: 1, height: 'auto'}}
              className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-slate-400">Nama Lengkap</p>
                  <p className="text-sm font-bold text-slate-800">{employee.name}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                  <Briefcase size={18} />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-slate-400">Jabatan</p>
                  <p className="text-sm font-bold text-slate-800">{employee.position}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                  <Phone size={18} />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-slate-400">No. WhatsApp</p>
                  <p className="text-sm font-bold text-slate-800">{employee.phone}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <Home size={18} />
                </div>
                <div>
                  <p className="text-[9px] uppercase font-bold text-slate-400">Alamat</p>
                  <p className="text-sm font-bold text-slate-800 truncate">{employee.address}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Step 2: Attendance Form */}
      <form onSubmit={handleSubmit} className={cn("space-y-6 transition-all", !employee && "opacity-20 pointer-events-none grayscale")}>
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 space-y-6">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Langkah 2: Ambil Foto & Status</label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Camera Area */}
            <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
              <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
                style={{transform: 'scaleX(-1)'}}
              />
              
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                <div className={cn("w-2 h-2 rounded-full animate-pulse", stream ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "bg-slate-500")}></div>
                <span className="text-[9px] text-white font-bold tracking-widest uppercase">Live Security Feed</span>
              </div>

              {location && (
                <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1 bg-blue-600/80 backdrop-blur-md rounded-full text-[8px] text-white font-mono font-bold">
                  <MapPin size={10} />
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </div>
              )}
            </div>

            {/* Status Area */}
            <div className="flex flex-col justify-center gap-6">
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Pilih Status Kehadiran</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['Hadir', 'Izin', 'Sakit'] as AttendanceStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        "py-3 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all",
                        status === s 
                          ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100" 
                          : "bg-white border-slate-100 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      {s === 'Hadir' && <Clock className="inline-block mr-1 mb-0.5" size={12} />}
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit"
                disabled={isCapturing || !employee || !stream}
                className={cn(
                  "w-full py-5 rounded-xl flex items-center justify-center gap-3 text-sm md:text-base font-extrabold uppercase tracking-[0.2em] transition-all shadow-lg",
                  isCapturing || !employee || !stream
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none" 
                    : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200 active:scale-95"
                )}
              >
                {isCapturing ? (
                  <span className="animate-pulse">Mengirim Data...</span>
                ) : (
                  <>
                    <Camera size={20} />
                    Absen Sekarang
                  </>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <p className="text-red-600 text-[10px] font-bold text-center uppercase tracking-wider leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      </form>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
