import React, {useState, useRef} from 'react';
import {Lock} from 'lucide-react';
import {cn} from '../lib/utils';

interface AdminLoginProps {
  onSuccess: () => void;
}

export function AdminLogin({onSuccess}: AdminLoginProps) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const ADMIN_PIN = '2026';

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Auto focus next
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check PIN if complete
    const fullPin = newPin.join('');
    if (fullPin.length === 4) {
      if (fullPin === ADMIN_PIN) {
        onSuccess();
      } else {
        setError(true);
        setTimeout(() => {
          setPin(['', '', '', '']);
          setError(false);
          inputRefs.current[0]?.focus();
        }, 1000);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="bg-white rounded-3xl p-10 shadow-2xl border border-black/5">
      <div className="flex flex-col items-center gap-8">
        <div className={cn(
          "w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-300",
          error ? "bg-red-500 text-white animate-shake" : "bg-[#141414] text-[#F5F5F0]"
        )}>
          <Lock size={32} />
        </div>
        
        <div className="text-center">
          <p className="text-sm font-medium opacity-40 uppercase tracking-widest mb-1">Verifikasi</p>
          <p className="text-lg font-serif">Masukkan PIN Admin</p>
        </div>

        <div className="flex gap-4">
          {pin.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className={cn(
                "w-14 h-16 bg-[#F5F5F0] border-2 border-transparent rounded-2xl text-center text-2xl font-bold focus:outline-none focus:border-black transition-all",
                error && "border-red-500 text-red-500"
              )}
            />
          ))}
        </div>

        <p className="text-[10px] uppercase tracking-widest opacity-30 font-bold">
          Akses
        </p>
      </div>
    </div>
  );
}
