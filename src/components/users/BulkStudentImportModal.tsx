import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, School, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { buildSchoolHandle, formatDatePassword, generateStudentEmail, normalizeAdmissionNo, normalizeCompare } from '@/lib/studentCredentials';

interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface BulkStudentImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
  schools?: SchoolOption[];
}

interface PreviewRow {
  rowNumber: number;
  admission_no: string;
  full_name: string;
  class_name: string;
  class_id: string;
  date_of_birth: string;
  roll_no: string;
  section: string;
  email: string;
  password: string;
  errors: string[];
}

const HEADER_MAP: Record<string, keyof Omit<PreviewRow, 'rowNumber' | 'class_id' | 'email' | 'password' | 'errors'>> = {
  admno: 'admission_no',
  admissionno: 'admission_no',
  admissionnumber: 'admission_no',
  admissionid: 'admission_no',
  studentname: 'full_name',
  studentsname: 'full_name',
  name: 'full_name',
  class: 'class_name',
  classname: 'class_name',
  dateofbirth: 'date_of_birth',
  dob: 'date_of_birth',
  rollno: 'roll_no',
  rollnumber: 'roll_no',
  section: 'section',
};

const REQUIRED_HEADERS = ['Adm No', 'Students Name', 'Class', 'Date of Birth'];

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizeClassKey = (value: string) => normalizeCompare(value).replace(/\s+/g, '');

const cellToText = (value: unknown) => {
  if (value == null) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, '');
  }
  return String(value).trim();
};

const pad2 = (n: number) => String(n).padStart(2, '0');

// xlsx with cellDates:true creates Dates at UTC midnight. Use UTC getters so
// timezones east of UTC (e.g. IST +5:30) don't shift the calendar day back.
const dateToIsoUTC = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

const dateToLocalIso = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const excelValueToIsoDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // If the Date is exactly UTC midnight (xlsx cellDates output), read as UTC.
    // Otherwise (e.g. user-typed local date) read as local.
    const isUtcMidnight =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return isUtcMidnight ? dateToIsoUTC(value) : dateToLocalIso(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return '';

    return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  }

  const text = cellToText(value);
  if (!text) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // DDMMYYYY (8 digits, no separator) — common in admission sheets
  const compact = text.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) {
    const [, day, month, year] = compact;
    return `${year}-${month}-${day}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    let [, day, month, year] = slashMatch;
    if (year.length === 2) year = (Number(year) < 50 ? '20' : '19') + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  const ymd = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Last-resort parse (still avoid toISOString to dodge timezone shift)
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';

  return dateToLocalIso(parsed);
};

const BulkStudentImportModal: React.FC<BulkStudentImportModalProps> = ({ onClose, onSuccess, schools = [] }) => {
  const { user } = useAuth();
  const isDeveloper = user?.role === 'developer';

  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>(schools);
  const [selectedSchoolId, setSelectedSchoolId] = useState(isDeveloper ? schools[0]?.id || '' : user?.school_id || '');
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let ignore = false;

    const loadSchools = async () => {
      if (schools.length > 0) {
        setSchoolOptions(schools);
        if (!selectedSchoolId && schools[0]?.id) setSelectedSchoolId(schools[0].id);
        return;
      }

      if (!user?.school_id) return;

      const { data, error } = await supabase
        .from('schools')
        .select('id, name, code')
        .eq('id', user.school_id)
        .single();

      if (ignore) return;
      if (error) {
        setLoadError(error.message || 'Unable to load school details');
        return;
      }

      if (data) {
        setSchoolOptions([data as SchoolOption]);
        setSelectedSchoolId(data.id);
      }
    };

    loadSchools();

    return () => {
      ignore = true;
    };
  }, [schools, user?.school_id, selectedSchoolId]);

  useEffect(() => {
    if (!selectedSchoolId) {
      setAvailableClasses([]);
      return;
    }

    let ignore = false;

    const loadClasses = async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', selectedSchoolId)
        .order('name');

      if (ignore) return;
      if (error) {
        setLoadError(error.message || 'Unable to load classes');
        return;
      }

      setAvailableClasses((data as ClassOption[]) || []);
    };

    loadClasses();

    return () => {
      ignore = true;
    };
  }, [selectedSchoolId]);

  const selectedSchool = useMemo(
    () => schoolOptions.find((school) => school.id === selectedSchoolId),
    [schoolOptions, selectedSchoolId],
  );

  const validRows = previewRows.filter((row) => row.errors.length === 0);
  const invalidRows = previewRows.length - validRows.length;

  const parseFile = async (file: File) => {
    if (!selectedSchoolId || !selectedSchool) {
      toast.error('Select a school before uploading the spreadsheet');
      return;
    }

    if (availableClasses.length === 0) {
      toast.error('Create classes for this school before importing students');
      return;
    }

    setParsing(true);
    setLoadError('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
      });

      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      if (!firstSheet) throw new Error('The spreadsheet is empty');

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
        raw: false,
      });

      if (rawRows.length === 0) throw new Error('No rows found in the uploaded spreadsheet');

      // Build multiple lookup keys for flexible matching: "class1", "1", "grade1", original name
      const classMap = new Map<string, ClassOption>();
      for (const item of availableClasses) {
        classMap.set(normalizeClassKey(item.name), item);
        // Also map just the number if class name contains one (e.g. "Class 4" -> "4")
        const numMatch = item.name.match(/\d+/);
        if (numMatch) {
          classMap.set(numMatch[0], item);
          classMap.set('class' + numMatch[0], item);
          classMap.set('grade' + numMatch[0], item);
        }
        // Map exact lowercase
        classMap.set(item.name.trim().toLowerCase(), item);
      }
      const admissions = new Set<string>();

      const normalizedAdmissions = rawRows
        .map((row) => normalizeAdmissionNo(Object.entries(row).find(([key]) => HEADER_MAP[normalizeHeader(key)] === 'admission_no')?.[1]))
        .filter(Boolean);

      const admissionsQuery = supabase
        .from('profiles')
        .select('admission_no')
        .eq('school_id', selectedSchoolId)
        .eq('role', 'student');

      const { data: existingAdmissionsData, error: admissionsError } = normalizedAdmissions.length
        ? await (admissionsQuery as any).in('admission_no', normalizedAdmissions)
        : { data: [], error: null };

      if (admissionsError) throw admissionsError;

      const existingAdmissions = new Set(
        ((existingAdmissionsData as Array<{ admission_no?: string }> | null) || [])
          .map((item) => normalizeAdmissionNo(item.admission_no))
          .filter(Boolean),
      );

      const nextPreviewRows = rawRows.map((rawRow, index) => {
        const mapped: Record<string, unknown> = {};

        Object.entries(rawRow).forEach(([key, value]) => {
          const targetKey = HEADER_MAP[normalizeHeader(key)];
          if (targetKey) mapped[targetKey] = value;
        });

        const admissionNo = normalizeAdmissionNo(mapped.admission_no);
        const fullName = cellToText(mapped.full_name);
        const className = cellToText(mapped.class_name);
        const classRecord = classMap.get(normalizeClassKey(className)) || classMap.get(className.trim().toLowerCase()) || classMap.get(className.trim());
        const dateOfBirth = excelValueToIsoDate(mapped.date_of_birth);
        const rollNo = cellToText(mapped.roll_no);
        const section = cellToText(mapped.section).toUpperCase();
        const email = generateStudentEmail(admissionNo, selectedSchool.code, selectedSchool.name);
        const password = formatDatePassword(dateOfBirth);
        const errors: string[] = [];

        if (!admissionNo) errors.push('Admission number is required');
        if (!fullName) errors.push('Student name is required');
        if (!classRecord) errors.push(`Class "${className || 'Unknown'}" was not found in this school`);
        if (!dateOfBirth) errors.push('Valid date of birth is required');
        if (admissionNo && admissions.has(admissionNo)) errors.push('Duplicate admission number inside this file');
        if (admissionNo && existingAdmissions.has(admissionNo)) errors.push('Admission number already exists in this school');
        if (dateOfBirth && !password) errors.push('Unable to generate password from date of birth');

        if (admissionNo) admissions.add(admissionNo);

        return {
          rowNumber: index + 2,
          admission_no: admissionNo,
          full_name: fullName,
          class_name: className,
          class_id: classRecord?.id || '',
          date_of_birth: dateOfBirth,
          roll_no: rollNo,
          section,
          email,
          password,
          errors,
        } satisfies PreviewRow;
      });

      setFileName(file.name);
      setPreviewRows(nextPreviewRows);
    } catch (error: any) {
      setPreviewRows([]);
      setFileName('');
      setLoadError(error.message || 'Unable to parse spreadsheet');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error('There are no valid student rows to import');
      return;
    }

    setImporting(true);
    setLoadError('');

    try {
      const body = {
        school_id: isDeveloper ? selectedSchoolId : undefined,
        rows: validRows.map((row) => ({
          admission_no: row.admission_no,
          full_name: row.full_name,
          class_id: row.class_id,
          date_of_birth: row.date_of_birth,
          roll_no: row.roll_no || null,
          section: row.section || null,
        })),
      };

      const { data, error } = await supabase.functions.invoke('bulk-import-students', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const createdCount = Number(data?.created_count || 0);
      const skippedCount = Number(data?.skipped_count || 0);

      toast.success(`${createdCount} students imported successfully`);
      if (skippedCount > 0) {
        toast.warning(`${skippedCount} rows were skipped because they were duplicates or invalid`);
      }

      onSuccess();
    } catch (error: any) {
      setLoadError(error.message || 'Bulk import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div>
            <h2 className="text-lg font-bold">Bulk Import Students</h2>
            <p className="mt-1 text-sm text-muted-foreground">Upload an Excel or CSV file, preview the generated credentials, then import only valid rows.</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 transition-colors hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet className="h-4 w-4 text-primary" /> Spreadsheet source
              </div>

              {isDeveloper && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-semibold">School *</label>
                  <select
                    value={selectedSchoolId}
                    onChange={(event) => {
                      setSelectedSchoolId(event.target.value);
                      setPreviewRows([]);
                      setFileName('');
                    }}
                    className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Select school...</option>
                    {schoolOptions.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name} ({school.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-muted/30">
                <Upload className="mb-3 h-8 w-8 text-primary" />
                <p className="text-sm font-semibold">Choose .xlsx, .xls, or .csv file</p>
                <p className="mt-1 text-xs text-muted-foreground">Required columns: {REQUIRED_HEADERS.join(', ')}</p>
                {selectedSchool && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Generated login format: <span className="font-mono text-foreground">ADMISSION@{buildSchoolHandle(selectedSchool.code, selectedSchool.name)}.com</span>
                  </p>
                )}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) parseFile(file);
                  }}
                />
              </label>

              {fileName && <p className="mt-3 text-sm text-muted-foreground">Loaded file: <span className="font-medium text-foreground">{fileName}</span></p>}
            </div>

            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <School className="h-4 w-4 text-primary" /> Import rules
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Student email is auto-generated from admission number + school code.</li>
                <li>• Student password is auto-generated from date of birth as DDMMYYYY.</li>
                <li>• Class names in the spreadsheet must already exist in this school.</li>
                <li>• Duplicate admission numbers are blocked before import.</li>
                <li>• Only valid preview rows are sent to the database.</li>
              </ul>
            </div>
          </div>

          {loadError && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {previewRows.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total rows</p>
                  <p className="mt-2 text-2xl font-bold">{previewRows.length}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ready to import</p>
                  <p className="mt-2 text-2xl font-bold text-primary">{validRows.length}</p>
                </div>
                <div className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs fixing</p>
                  <p className="mt-2 text-2xl font-bold text-destructive">{invalidRows}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border bg-background">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3">Row</th>
                        <th className="px-4 py-3">Adm No</th>
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">Class</th>
                        <th className="px-4 py-3">DOB</th>
                        <th className="px-4 py-3">Generated Email</th>
                        <th className="px-4 py-3">Password</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => {
                        const hasError = row.errors.length > 0;

                        return (
                          <tr key={`${row.rowNumber}-${row.admission_no || row.full_name}`} className="border-b border-border/70 align-top text-sm last:border-b-0">
                            <td className="px-4 py-3 font-medium">{row.rowNumber}</td>
                            <td className="px-4 py-3 font-medium">{row.admission_no || '—'}</td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{row.full_name || '—'}</div>
                              {(row.roll_no || row.section) && (
                                <div className="text-xs text-muted-foreground">
                                  {row.roll_no ? `Roll: ${row.roll_no}` : 'Roll: —'}
                                  {row.section ? ` · Section: ${row.section}` : ''}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">{row.class_name || '—'}</td>
                            <td className="px-4 py-3">{row.date_of_birth || '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs">{row.email || '—'}</td>
                            <td className="px-4 py-3 font-mono text-xs">{row.password || '—'}</td>
                            <td className="px-4 py-3">
                              {hasError ? (
                                <div className="space-y-1 text-xs text-destructive">
                                  {row.errors.map((error) => (
                                    <p key={error}>{error}</p>
                                  ))}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {parsing ? 'Reading spreadsheet and validating rows...' : previewRows.length > 0 ? `${validRows.length} valid row(s) ready for import.` : 'Upload a file to generate the student preview.'}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={parsing || importing || validRows.length === 0}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${validRows.length || ''} Students`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkStudentImportModal;