// Employee group management via localStorage (no DB schema change)

export const EMPLOYEE_GROUPS = [
  'Dg Komputer',
  'Dg Net',
  'Komindo',
  'Dg Smart School',
] as const;

export type EmployeeGroup = typeof EMPLOYEE_GROUPS[number];

export const UNASSIGNED_GROUP = 'Lainnya';

// Distinct color per group (hex without leading FF for xlsx-js-style use FF prefix)
export const GROUP_COLORS: Record<string, { bg: string; text: string; hex: string }> = {
  'Dg Komputer':     { bg: 'bg-blue-50',    text: 'text-blue-700',    hex: '2E75B6' },
  'Dg Net':          { bg: 'bg-emerald-50', text: 'text-emerald-700', hex: '2E9E6B' },
  'Komindo':         { bg: 'bg-amber-50',   text: 'text-amber-700',   hex: 'D89000' },
  'Dg Smart School': { bg: 'bg-violet-50',  text: 'text-violet-700',  hex: '8B5CF6' },
  [UNASSIGNED_GROUP]:{ bg: 'bg-slate-100',  text: 'text-slate-500',   hex: '94A3B8' },
};

const STORAGE_KEY = 'employee_groups_v1';

function readMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getGroup(employeeId: string): string {
  return readMap()[employeeId] || UNASSIGNED_GROUP;
}

export function setGroup(employeeId: string, group: string) {
  const map = readMap();
  if (!group || group === UNASSIGNED_GROUP) {
    delete map[employeeId];
  } else {
    map[employeeId] = group;
  }
  writeMap(map);
}

export function getAllGroups(): Record<string, string> {
  return readMap();
}
