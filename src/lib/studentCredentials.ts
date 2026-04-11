const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

const pad = (value: number) => String(value).padStart(2, '0');

const toSchoolHandle = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';

  const firstToken = normalized.split(/[^a-z0-9]+/).filter(Boolean)[0] || '';
  return firstToken.replace(NON_ALPHANUMERIC, '');
};

export const normalizeAdmissionNo = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\.0$/, '')
    .replace(/\s+/g, '')
    .toUpperCase();

export const normalizeCompare = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildSchoolHandle = (schoolCode?: string | null, schoolName?: string | null) =>
  toSchoolHandle(schoolCode) || toSchoolHandle(schoolName) || 'school';

export const generateStudentEmail = (admissionNo: unknown, schoolCode?: string | null, schoolName?: string | null) =>
  `${normalizeAdmissionNo(admissionNo).toLowerCase()}@${buildSchoolHandle(schoolCode, schoolName)}.com`;

export const formatDatePassword = (value?: string | Date | null) => {
  if (!value) return '';

  if (value instanceof Date) {
    return `${pad(value.getUTCDate())}${pad(value.getUTCMonth() + 1)}${value.getUTCFullYear()}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}${month}${year}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return `${pad(parsed.getUTCDate())}${pad(parsed.getUTCMonth() + 1)}${parsed.getUTCFullYear()}`;
};