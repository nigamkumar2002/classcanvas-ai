import { describe, expect, it } from 'vitest';

import { buildSchoolHandle, formatDatePassword, generateStudentEmail, normalizeAdmissionNo } from '@/lib/studentCredentials';

describe('student credentials helpers', () => {
  it('normalizes admission numbers for uniqueness', () => {
    expect(normalizeAdmissionNo(' 1250 ')).toBe('1250');
    expect(normalizeAdmissionNo('ab 12')).toBe('AB12');
  });

  it('builds a stable school handle from school code first', () => {
    expect(buildSchoolHandle('VPS-KHD', 'Veena Public School')).toBe('vpskhd');
    expect(buildSchoolHandle('', 'ABC School')).toBe('abcschool');
  });

  it('generates login email and password from student data', () => {
    expect(generateStudentEmail('1250', 'VPS', 'Veena Public School')).toBe('1250@vps.com');
    expect(formatDatePassword('2000-01-12')).toBe('12012000');
  });
});