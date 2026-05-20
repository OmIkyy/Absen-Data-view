import React, {useState, useEffect, useRef} from 'react';
import {supabase, type Attendance, type Employee} from '../lib/supabase';
import {formatDate, cn} from '../lib/utils';
import {Search, RefreshCw, AlertCircle, FileText, MapPin, Users, ClipboardCheck, Plus, Trash2, Map as MapIcon, X, Download} from 'lucide-react';
import {motion, AnimatePresence} from 'motion/react';
import { APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import * as XLSX from 'xlsx-js-style';
import {APP_CONFIG} from '../config';
import {EMPLOYEE_GROUPS, GROUP_COLORS, UNASSIGNED_GROUP, getGroup, setGroup, getAllGroups} from '../lib/groups';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

// Location Picker Component
function LocationPicker({ onSelect, initialLocation, onConfirm }: { 
  onSelect: (lat: number, lng: number, address?: string) => void,
  onConfirm: () => void,
  initialLocation?: {lat: number, lng: number}
}) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const [markerPos, setMarkerPos] = useState(initialLocation || { lat: -6.2088, lng: 106.8456 }); // Jakarta default
  const [searchInput, setSearchInput] = useState('');
  const [isSearched, setIsSearched] = useState(false);
  const autoCompleteRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reverseGeocode = (lat: number, lng: number) => {
    const geocoder = new (window as any).google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
      if (status === 'OK' && results?.[0]) {
        const components = results[0].address_components;
        let kelurahan = '';
        let kecamatan = '';
        let kota = '';
        let provinsi = '';

        components.forEach((component: any) => {
          if (component.types.includes('administrative_area_level_4') || component.types.includes('village')) {
            kelurahan = component.long_name;
          }
          if (component.types.includes('administrative_area_level_3') || component.types.includes('locality')) {
            kecamatan = component.long_name;
          }
          if (component.types.includes('administrative_area_level_2')) {
            kota = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            provinsi = component.long_name;
          }
        });

        // Construct simplified detailed address
        const detailedAddress = [kelurahan, kecamatan, kota, provinsi]
          .filter(Boolean)
          .join(', ');
          
        onSelect(lat, lng, results[0].formatted_address);
      }
    });
  };

  useEffect(() => {
    if (!placesLib || !inputRef.current) return;
    
    autoCompleteRef.current = new placesLib.Autocomplete(inputRef.current, {
      fields: ['geometry', 'formatted_address', 'address_components']
    });

    autoCompleteRef.current.addListener('place_changed', () => {
      const place = autoCompleteRef.current?.getPlace();
      if (place?.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const pos = { lat, lng };
        setMarkerPos(pos);
        map?.setCenter(pos);
        map?.setZoom(17);
        setIsSearched(true);
        onSelect(lat, lng, place.formatted_address);
      }
    });
  }, [placesLib, map]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Cari Kelurahan, Kecamatan, atau Kota..."
          className="w-full pl-11 pr-4 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-blue-600 font-bold text-sm shadow-sm transition-all"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
      
      <div className="h-80 rounded-3xl overflow-hidden border-2 border-slate-100 shadow-inner relative group">
        <Map
          defaultCenter={markerPos}
          defaultZoom={15}
          mapId="EMPLOYEE_LOCATION_PICKER"
          onClick={(e) => {
            if (e.detail.latLng) {
              setMarkerPos(e.detail.latLng);
              reverseGeocode(e.detail.latLng.lat, e.detail.latLng.lng);
            }
          }}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
          style={{ width: '100%', height: '100%' }}
        >
          <AdvancedMarker position={markerPos}>
            <div className="p-2 bg-blue-600 text-white rounded-full shadow-xl border-4 border-white animate-bounce-short">
              <MapPin size={24} fill="currentColor" fillOpacity={0.2} />
            </div>
          </AdvancedMarker>
        </Map>

        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-xl pointer-events-none group-hover:opacity-100 transition-opacity">
          Klik Peta Untuk Memindahkan Titik
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] md:w-auto">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full md:px-8 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/40 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <ClipboardCheck size={16} />
            Terapkan Lokasi Ini
          </button>
        </div>
      </div>
    </div>
  );
}

type Tab = 'attendance' | 'employees' | 'recap';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('attendance');
  const [attendanceData, setAttendanceData] = useState<Attendance[]>([]);
  const [allAttendanceForRecap, setAllAttendanceForRecap] = useState<Attendance[]>([]);
  const [employeeData, setEmployeeData] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form for new employee
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [newEmployee, setNewEmployee] = useState<{
    id: string;
    name: string;
    position: string;
    phone: string;
    address: string;
    group: string;
    home_latitude?: number;
    home_longitude?: number;
  }>({
    id: '', name: '', position: '', phone: '', address: '', group: EMPLOYEE_GROUPS[0]
  });
  const [groupsVersion, setGroupsVersion] = useState(0); // re-render when group assignments change
  const [lightboxEntry, setLightboxEntry] = useState<Attendance | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'attendance') {
        const {data: entries, error: fetchError} = await supabase
          .from('attendance')
          .select('*')
          .order('created_at', {ascending: false});
        if (fetchError) throw fetchError;
        setAttendanceData(entries || []);
      } else if (activeTab === 'employees') {
        const {data: entries, error: fetchError} = await supabase
          .from('employees')
          .select('*')
          .order('name', {ascending: true});
        if (fetchError) throw fetchError;
        setEmployeeData(entries || []);
      } else if (activeTab === 'recap') {
        // Fetch employees and current month attendance
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0,0,0,0);

        const {data: emps, error: empError} = await supabase.from('employees').select('*').order('name', {ascending: true});
        const {data: atts, error: attError} = await supabase.from('attendance').select('*').gte('created_at', startOfMonth.toISOString());
        
        if (empError) throw empError;
        if (attError) throw attError;

        setEmployeeData(emps || []);
        setAllAttendanceForRecap(atts || []);
      }
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError(err.message || "Gagal mengambil data.");
    } finally {
      setLoading(false);
    }
  };

  const calculateRecap = (employeeId: string) => {
    const atts = allAttendanceForRecap.filter(a => a.employee_id === employeeId);
    // Unique days attended
    const attendedDays = new Set(atts.map(a => new Date(a.created_at).toDateString())).size;
    
    // Calculate workdays in month so far (excluding Sundays)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let workDaysCount = 0;
    for (let d = new Date(startOfMonth); d <= now; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) workDaysCount++; // 0 is Sunday
    }

    const missed = Math.max(0, workDaysCount - attendedDays);
    return { attended: attendedDays, missed };
  };

  const handleDownloadExcel = () => {
    try {
      const monthLabel = new Date().toLocaleString('id-ID', { month: 'long', year: 'numeric' });
      const title = `DATA ABSENSI KARYAWAN ${monthLabel.toUpperCase()}`;
      const headers = [
        'NO', 'ID Karyawan', 'Nama Lengkap', 'Jabatan', 'WhatsApp',
        'Hadir (Hari)', 'Tidak Masuk (Hari)', 'Persentase Kehadiran', 'Bulan', 'Gaji', 'Kelompok',
      ];

      // Group employees
      const groupsOrder = [...EMPLOYEE_GROUPS, UNASSIGNED_GROUP];
      const grouped: Record<string, Employee[]> = {};
      groupsOrder.forEach(g => grouped[g] = []);
      employeeData.forEach(emp => {
        const g = getGroup(emp.id);
        (grouped[g] || (grouped[g] = [])).push(emp);
      });

      const aoa: any[][] = [];
      aoa.push([title, '', '', '', '', '', '', '', '', '', '']);
      aoa.push(headers);

      type RowMeta = { type: 'group' | 'data'; group?: string };
      const rowMeta: RowMeta[] = [{ type: 'data' }, { type: 'data' }]; // title + header
      let counter = 0;

      groupsOrder.forEach(g => {
        const list = grouped[g];
        if (!list || list.length === 0) return;
        // Group section header row
        aoa.push([`KELOMPOK: ${g.toUpperCase()}`, '', '', '', '', '', '', '', '', '', '']);
        rowMeta.push({ type: 'group', group: g });
        list.forEach(emp => {
          counter++;
          const { attended, missed } = calculateRecap(emp.id);
          const total = attended + missed;
          const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;
          aoa.push([
            counter, emp.id, emp.name, emp.position, emp.phone,
            attended, missed, `${percentage}%`, monthLabel, '', g,
          ]);
          rowMeta.push({ type: 'data' });
        });
      });

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);

      // Merges: title across all columns + each group section across all columns
      const merges: any[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
      rowMeta.forEach((m, idx) => {
        if (m.type === 'group') {
          merges.push({ s: { r: idx, c: 0 }, e: { r: idx, c: headers.length - 1 } });
        }
      });
      worksheet['!merges'] = merges;

      worksheet['!cols'] = [
        { wch: 5 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 16 },
        { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 18 },
      ];

      const border = {
        top: { style: 'thin', color: { rgb: 'FFB0B7C3' } },
        bottom: { style: 'thin', color: { rgb: 'FFB0B7C3' } },
        left: { style: 'thin', color: { rgb: 'FFB0B7C3' } },
        right: { style: 'thin', color: { rgb: 'FFB0B7C3' } },
      };

      // Title styling
      const titleCell = worksheet['A1'];
      if (titleCell) {
        titleCell.s = {
          font: { bold: true, sz: 16, color: { rgb: 'FFFFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: 'FF1F4E79' } },
          alignment: { horizontal: 'center', vertical: 'center' },
        };
      }
      // Set title row height
      worksheet['!rows'] = [{ hpt: 28 }];

      // Header row styling
      for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 1, c });
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: headers[c] };
        worksheet[addr].s = {
          font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
          fill: { patternType: 'solid', fgColor: { rgb: 'FF2E75B6' } },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border,
        };
      }

      // Group + data row styling
      rowMeta.forEach((m, idx) => {
        if (m.type === 'group' && m.group) {
          const color = GROUP_COLORS[m.group]?.hex || '94A3B8';
          for (let c = 0; c < headers.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: idx, c });
            if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
            worksheet[addr].s = {
              font: { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 11 },
              fill: { patternType: 'solid', fgColor: { rgb: 'FF' + color } },
              alignment: { horizontal: 'left', vertical: 'center', indent: 1 },
              border,
            };
          }
        } else if (idx > 1) {
          // data rows
          for (let c = 0; c < headers.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: idx, c });
            if (!worksheet[addr]) continue;
            worksheet[addr].s = {
              font: { sz: 11 },
              alignment: { horizontal: c === 2 || c === 3 ? 'left' : 'center', vertical: 'center' },
              border,
            };
          }
        }
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Absensi');

      const fileName = `Rekap_Absensi_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error("Export error:", err);
      alert("Gagal mengunduh Excel");
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      alert("Koneksi database belum siap. Pastikan Lovable Cloud / Supabase sudah aktif (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY).");
      return;
    }
    try {
      const {group, ...payload} = newEmployee;
      const {error: addError} = await supabase
        .from('employees')
        .insert([payload]);
      if (addError) throw addError;

      // Save group locally (no DB schema change required)
      setGroup(payload.id, group);
      setGroupsVersion(v => v + 1);

      setShowAddEmployee(false);
      setNewEmployee({id: '', name: '', position: '', phone: '', address: '', group: EMPLOYEE_GROUPS[0]});
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleChangeGroup = (employeeId: string, group: string) => {
    setGroup(employeeId, group);
    setGroupsVersion(v => v + 1);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (!confirm('Hapus karyawan ini? Semua riwayat absennya akan tetap ada.')) return;
    if (!supabase) {
      alert("Koneksi database belum siap.");
      return;
    }
    try {
      const {error: delError} = await supabase
        .from('employees')
        .delete()
        .eq('id', id);
      if (delError) throw delError;
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredAttendance = attendanceData.filter(entry => 
    entry.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.employee_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredEmployees = employeeData.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex p-1 bg-slate-100 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('attendance')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
            activeTab === 'attendance' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <ClipboardCheck size={14} />
          Riwayat Absen
        </button>
        <button 
          onClick={() => setActiveTab('employees')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
            activeTab === 'employees' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <Users size={14} />
          Data Karyawan
        </button>
        <button 
          onClick={() => setActiveTab('recap')}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
            activeTab === 'recap' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <FileText size={14} />
          Rekap Bulanan
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            type="text"
            placeholder={activeTab === 'attendance' ? "Cari nama atau ID..." : activeTab === 'employees' ? "Cari nama atau ID karyawan..." : "Filter rekap karyawan..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:border-blue-600 transition-all text-sm font-medium"
          />
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          {activeTab === 'employees' && (
            <button 
              onClick={() => setShowAddEmployee(true)}
              className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 text-white rounded-2xl text-[10px] uppercase tracking-widest font-black hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
            >
              <Plus size={14} />
              Tambah Karyawan
            </button>
          )}
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-[10px] uppercase tracking-widest font-black hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="bg-white h-72 rounded-3xl animate-pulse border border-slate-200" />
          ))}
        </div>
      ) : activeTab === 'attendance' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
          {filteredAttendance.map((entry, idx) => (
            <motion.div
              layout
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              key={entry.id}
              className="group bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-500"
            >
              <div className="aspect-[4/5] bg-slate-100 relative overflow-hidden">
                <img 
                  src={entry.photo_url} 
                  alt={entry.employee_name} 
                  onClick={() => setLightboxEntry(entry)}
                  className="w-full h-full object-cover cursor-zoom-in transition-transform group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className={cn(
                  "absolute top-4 left-4 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-md",
                  entry.status === 'Hadir' ? "bg-green-500/80" : entry.status === 'Izin' ? "bg-orange-500/80" : "bg-red-500/80"
                )}>
                  {entry.status}
                </div>
                {entry.latitude && (
                  <a 
                    href={`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-4 right-4 p-2 bg-white/90 backdrop-blur rounded-xl text-blue-600 border border-slate-200 hover:bg-blue-600 hover:text-white transition-all shadow-lg"
                    title="Lihat Lokasi di Maps"
                  >
                    <MapPin size={16} />
                  </a>
                )}
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <p className="text-[10px] uppercase font-black text-slate-400 mb-1">ID: {entry.employee_id}</p>
                  <p className="text-lg font-extrabold text-slate-800 truncate">{entry.employee_name}</p>
                </div>
                <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-bold text-slate-300 uppercase">Waktu Masuk</p>
                    <p className="font-mono text-[11px] font-bold text-slate-500">{formatDate(entry.created_at)}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : activeTab === 'employees' ? (
        /* Employee Management Tab - grouped by Kelompok */
        (() => {
          void groupsVersion;
          const groupsOrder = [...EMPLOYEE_GROUPS, UNASSIGNED_GROUP];
          const grouped: Record<string, typeof filteredEmployees> = {};
          groupsOrder.forEach(g => grouped[g] = []);
          filteredEmployees.forEach(emp => {
            const g = getGroup(emp.id);
            (grouped[g] || (grouped[g] = [])).push(emp);
          });

          if (filteredEmployees.length === 0) {
            return (
              <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">
                Tidak ada data karyawan
              </div>
            );
          }

          return (
            <div className="space-y-6 pb-20">
              {/* Group summary chips */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[...EMPLOYEE_GROUPS].map(g => {
                  const c = GROUP_COLORS[g];
                  const count = grouped[g]?.length || 0;
                  return (
                    <div key={g} className={cn("rounded-2xl p-4 border border-slate-200/60 shadow-sm", c.bg)}>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: '#' + c.hex}} />
                        <p className={cn("text-[10px] font-black uppercase tracking-widest", c.text)}>{g}</p>
                      </div>
                      <p className={cn("text-3xl font-black mt-2", c.text)}>{count}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Karyawan</p>
                    </div>
                  );
                })}
              </div>

              {/* Grouped tables */}
              {groupsOrder.map(g => {
                const list = grouped[g];
                if (!list || list.length === 0) return null;
                const c = GROUP_COLORS[g] || GROUP_COLORS[UNASSIGNED_GROUP];
                return (
                  <div key={g} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className={cn("px-6 py-4 flex items-center justify-between border-b border-slate-100", c.bg)}>
                      <div className="flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full" style={{backgroundColor: '#' + c.hex}} />
                        <h4 className={cn("text-sm font-black uppercase tracking-[0.2em]", c.text)}>
                          Kelompok: {g}
                        </h4>
                      </div>
                      <span className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-white/70", c.text)}>
                        {list.length} Karyawan
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">ID / NISN</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Nama</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Jabatan</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Kelompok</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Lokasi Rumah</th>
                            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map(emp => {
                            const eg = getGroup(emp.id);
                            const egColor = GROUP_COLORS[eg] || GROUP_COLORS[UNASSIGNED_GROUP];
                            return (
                              <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="p-5"><span className="font-mono font-bold text-blue-600">{emp.id}</span></td>
                                <td className="p-5 font-bold text-slate-800">{emp.name}</td>
                                <td className="p-5 text-sm text-slate-500">{emp.position}</td>
                                <td className="p-5">
                                  <select
                                    value={eg}
                                    onChange={(e) => handleChangeGroup(emp.id, e.target.value)}
                                    className={cn(
                                      "px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer",
                                      egColor.bg, egColor.text
                                    )}
                                  >
                                    {[...EMPLOYEE_GROUPS, UNASSIGNED_GROUP].map(grp => (
                                      <option key={grp} value={grp}>{grp}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-5">
                                  {emp.home_latitude ? (
                                    <a 
                                      href={`https://www.google.com/maps?q=${emp.home_latitude},${emp.home_longitude}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase transition-colors hover:bg-blue-600 hover:text-white"
                                    >
                                      <MapPin size={12} />
                                      Lihat Peta
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-slate-300 font-bold uppercase italic">Belum diset</span>
                                  )}
                                </td>
                                <td className="p-5">
                                  <button 
                                    onClick={() => handleDeleteEmployee(emp.id)}
                                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      ) : (
        /* Recap Tab */
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Rekapitulasi Kehadiran</h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Bulan: {new Date().toLocaleString('id-ID', {month: 'long', year: 'numeric'})}</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleDownloadExcel}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all shadow-lg shadow-green-100"
              >
                <Download size={14} />
                Download Excel
              </button>
              <div className="bg-blue-50 px-4 py-2 rounded-xl text-blue-600 text-[10px] font-black uppercase tracking-widest border border-blue-100/50">
                Update Real-time
              </div>
            </div>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Karyawan</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Hadir (Hari)</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Tidak Masuk (Est.)</th>
                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Persentase</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                void groupsVersion;
                const groupsOrder = [...EMPLOYEE_GROUPS, UNASSIGNED_GROUP];
                const grouped: Record<string, typeof filteredEmployees> = {};
                groupsOrder.forEach(g => grouped[g] = []);
                filteredEmployees.forEach(emp => {
                  const g = getGroup(emp.id);
                  (grouped[g] || (grouped[g] = [])).push(emp);
                });
                const out: React.ReactNode[] = [];
                groupsOrder.forEach(g => {
                  const list = grouped[g];
                  if (!list || list.length === 0) return;
                  const c = GROUP_COLORS[g] || GROUP_COLORS[UNASSIGNED_GROUP];
                  out.push(
                    <tr key={`group-${g}`} className={cn("border-b border-slate-100", c.bg)}>
                      <td colSpan={4} className={cn("px-6 py-3 text-[11px] font-black uppercase tracking-[0.2em]", c.text)}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{backgroundColor: '#' + c.hex}} />
                          Kelompok: {g} <span className="opacity-60">({list.length})</span>
                        </span>
                      </td>
                    </tr>
                  );
                  list.forEach(emp => {
                    const { attended, missed } = calculateRecap(emp.id);
                    const totalDaysSoFar = attended + missed;
                    const percentage = totalDaysSoFar > 0 ? Math.round((attended / totalDaysSoFar) * 100) : 0;
                    out.push(
                      <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="p-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {emp.id}</span>
                          </div>
                        </td>
                        <td className="p-6 text-center">
                          <span className="px-3 py-1 bg-green-50 text-green-600 rounded-lg font-black text-xs">{attended}</span>
                        </td>
                        <td className="p-6 text-center">
                          <span className={cn(
                            "px-3 py-1 rounded-lg font-black text-xs",
                            missed > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"
                          )}>{missed}</span>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-black text-slate-800 text-sm">{percentage}%</span>
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-1000",
                                  percentage > 80 ? "bg-green-500" : percentage > 50 ? "bg-orange-500" : "bg-red-500"
                                )}
                                style={{width: `${percentage}%`}}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                });
                return out;
              })()}
            </tbody>
          </table>
          {filteredEmployees.length === 0 && (
            <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">
              Tidak ada data karyawan untuk direkap
            </div>
          )}
        </div>
      )}

      {/* Add Employee Modal */}
      <AnimatePresence>
        {showAddEmployee && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{opacity: 0}} 
              animate={{opacity: 1}} 
              exit={{opacity: 0}}
              onClick={() => setShowAddEmployee(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{scale: 0.9, opacity: 0}}
              animate={{scale: 1, opacity: 1}}
              className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl p-8"
            >
              <h3 className="text-2xl font-extrabold text-slate-800 mb-6">Tambah Karyawan Baru</h3>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">ID / NISN</label>
                    <input 
                      required
                      type="text"
                      inputMode="numeric"
                      value={newEmployee.id}
                      onChange={e => setNewEmployee({...newEmployee, id: e.target.value.replace(/\D/g, '')})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 font-bold"
                      placeholder="Hanya angka..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Nama Lengkap</label>
                    <input 
                      required
                      value={newEmployee.name}
                      onChange={e => setNewEmployee({...newEmployee, name: e.target.value.toUpperCase()})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 font-bold"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Jabatan</label>
                    <input 
                      required
                      value={newEmployee.position}
                      onChange={e => setNewEmployee({...newEmployee, position: e.target.value.toUpperCase()})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">No. WhatsApp</label>
                    <input 
                      required
                      value={newEmployee.phone}
                      onChange={e => setNewEmployee({...newEmployee, phone: e.target.value})}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-blue-600 font-bold"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest pl-1">Kelompok</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {EMPLOYEE_GROUPS.map(g => {
                      const c = GROUP_COLORS[g];
                      const selected = newEmployee.group === g;
                      return (
                        <button
                          type="button"
                          key={g}
                          onClick={() => setNewEmployee({...newEmployee, group: g})}
                          className={cn(
                            "px-3 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider border-2 transition-all text-center",
                            selected
                              ? cn(c.bg, c.text, "border-current shadow-sm scale-[1.02]")
                              : "bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100"
                          )}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest pl-1">Lokasi Rumah (Maps)</label>
                  {!isPickingLocation ? (
                    <button
                      type="button"
                      onClick={() => setIsPickingLocation(true)}
                      className={cn(
                        "w-full flex items-center justify-between px-5 py-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all group",
                        newEmployee.home_latitude && "border-green-200 bg-green-50/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-xl",
                          newEmployee.home_latitude ? "bg-green-500 text-white" : "bg-white text-slate-400 group-hover:text-blue-600 shadow-sm"
                        )}>
                          <MapIcon size={18} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-700">
                            {newEmployee.home_latitude ? "Lokasi Terpilih" : "Cari & Pilih di Peta"}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {newEmployee.home_latitude 
                              ? `${newEmployee.home_latitude.toFixed(4)}, ${newEmployee.home_longitude?.toFixed(4)}` 
                              : "Tentukan titik rumah karyawan"}
                          </p>
                        </div>
                      </div>
                      <Plus size={20} className={cn("text-slate-300", newEmployee.home_latitude && "text-green-500")} />
                    </button>
                  ) : (
                    <div className="animate-in fade-in zoom-in-95 duration-200">
                      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                        <LocationPicker 
                          initialLocation={newEmployee.home_latitude ? {lat: newEmployee.home_latitude, lng: newEmployee.home_longitude!} : undefined}
                          onSelect={(lat, lng, addr) => {
                            setNewEmployee(prev => ({
                              ...prev,
                              home_latitude: lat,
                              home_longitude: lng,
                              address: addr || prev.address
                            }));
                          }}
                          onConfirm={() => setIsPickingLocation(false)}
                        />
                      </APIProvider>
                      <button
                        type="button"
                        onClick={() => setIsPickingLocation(false)}
                        className="mt-2 w-full py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Batal Pilih Lokasi
                      </button>
                    </div>
                  )}
                </div>

                {!isPickingLocation && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest pl-1">Alamat Lengkap (Otomatis/Manual)</label>
                    <textarea 
                      required
                      placeholder="Detail alamat spesifik..."
                      value={newEmployee.address}
                      onChange={e => setNewEmployee({...newEmployee, address: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-blue-600 font-bold min-h-[100px] text-sm shadow-inner"
                    />
                  </div>
                )}
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setShowAddEmployee(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-200"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-700 shadow-lg shadow-blue-100"
                  >
                    Simpan Data
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Lightbox */}
      <AnimatePresence>
        {lightboxEntry && (
          <motion.div
            initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}}
            onClick={() => setLightboxEntry(null)}
            className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          >
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxEntry(null); }}
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
              aria-label="Tutup"
            >
              <X size={20} />
            </button>
            <motion.div
              initial={{scale: 0.9}} animate={{scale: 1}} exit={{scale: 0.9}}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center gap-4"
            >
              <img
                src={lightboxEntry.photo_url}
                alt={lightboxEntry.employee_name}
                className="max-h-[75vh] w-auto rounded-2xl shadow-2xl object-contain"
              />
              <div className="bg-white/10 backdrop-blur-md text-white rounded-2xl px-5 py-3 w-full max-w-xl flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-bold opacity-60">{lightboxEntry.employee_id} · {lightboxEntry.status}</p>
                  <p className="text-base font-extrabold">{lightboxEntry.employee_name}</p>
                  <p className="text-[11px] font-mono opacity-80">{formatDate(lightboxEntry.created_at)}</p>
                </div>
                {lightboxEntry.latitude && (
                  <a
                    href={`https://www.google.com/maps?q=${lightboxEntry.latitude},${lightboxEntry.longitude}`}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    <MapPin size={14} /> Lihat di Maps
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
