import {createClient} from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Supabase client initialization - guarded to prevent crash if keys are missing
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any;

export type Attendance = {
  id: string;
  employee_id: string;
  employee_name: string;
  photo_url: string;
  status: 'Hadir' | 'Izin' | 'Sakit';
  latitude?: number;
  longitude?: number;
  created_at: string;
};

export type Employee = {
  id: string; // This is the ID typed by user (e.g. 103939)
  name: string;
  address: string;
  home_latitude?: number;
  home_longitude?: number;
  phone: string;
  position: string;
  created_at: string;
};
