import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigate } from 'react-router-dom';

const SHEETS = ['schools', 'users', 'classes', 'subjects', 'chapters', 'materials'] as const;
type SheetName = typeof SHEETS[number];

const TEMPLATES: Record<SheetName, { headers: string[]; sample: Record<string, any> }> = {
  schools: {
    headers: ['name', 'code', 'description', 'address', 'city', 'state', 'country', 'email', 'phone'],
    sample: { name: 'Bright Future Academy', code: 'BFA', description: 'CBSE School', address: '123 Main St', city: 'Mumbai', state: 'MH', country: 'India', email: 'admin@bfa.com', phone: '+91-9999999999' },
  },
  users: {
    headers: ['school_code', 'school_name', 'role', 'full_name', 'email', 'password', 'admission_no', 'class_name', 'date_of_birth', 'roll_no', 'section'],
    sample: { school_code: 'BFA', school_name: '', role: 'teacher', full_name: 'Anita Sharma', email: '', password: '', admission_no: '', class_name: '', date_of_birth: '', roll_no: '', section: '' },
  },
  classes: {
    headers: ['school_code', 'school_name', 'name', 'grade_level', 'description'],
    sample: { school_code: 'BFA', school_name: '', name: 'Grade 8', grade_level: 8, description: 'Section A' },
  },
  subjects: {
    headers: ['school_code', 'school_name', 'class_name', 'name', 'description', 'color', 'icon'],
    sample: { school_code: 'BFA', school_name: '', class_name: 'Grade 8', name: 'Mathematics', description: '', color: '#3b82f6', icon: 'calculator' },
  },
  chapters: {
    headers: ['school_code', 'school_name', 'class_name', 'subject_name', 'name', 'order_index', 'description'],
    sample: { school_code: 'BFA', school_name: '', class_name: 'Grade 8', subject_name: 'Mathematics', name: 'Algebra Basics', order_index: 1, description: '' },
  },
  materials: {
    headers: ['school_code', 'school_name', 'class_name', 'subject_name', 'chapter_name', 'title', 'type', 'topic', 'description', 'file_url', 'file_name', 'file_type'],
    sample: { school_code: 'BFA', school_name: '', class_name: 'Grade 8', subject_name: 'Mathematics', chapter_name: 'Algebra Basics', title: 'Intro Notes', type: 'pdf', topic: 'Variables', description: '', file_url: 'https://example.com/file.pdf', file_name: 'intro.pdf', file_type: 'application/pdf' },
  },
};

const BulkImportPage = () => {
  const { user } = useAuth();
  const [parsedData, setParsedData] = useState<Partial<Record<SheetName, any[]>>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (user && user.role !== 'developer') {
    return <Navigate to="/dashboard" replace />;
  }

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    SHEETS.forEach((sheet) => {
      const tpl = TEMPLATES[sheet];
      const data = [tpl.sample];
      const ws = XLSX.utils.json_to_sheet(data, { header: tpl.headers });
      XLSX.utils.book_append_sheet(wb, ws, sheet);
    });
    XLSX.writeFile(wb, 'lms-bulk-import-template.xlsx');
    toast.success('Template downloaded — fill rows in each sheet then upload');
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const data: Partial<Record<SheetName, any[]>> = {};
      SHEETS.forEach((sheet) => {
        if (wb.SheetNames.includes(sheet)) {
          const ws = wb.Sheets[sheet];
          const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null, raw: false });
          // Filter empty rows
          const filtered = rows.filter((r) => Object.values(r).some((v) => v !== null && String(v).trim() !== ''));
          if (filtered.length) data[sheet] = filtered;
        }
      });
      setParsedData(data);
      setResult(null);
      const total = Object.values(data).reduce((s, arr) => s + (arr?.length || 0), 0);
      toast.success(`Parsed ${total} rows across ${Object.keys(data).length} sheets`);
    } catch (err: any) {
      toast.error(`Failed to parse file: ${err.message}`);
    }
  };

  const submit = async () => {
    if (!Object.keys(parsedData).length) {
      toast.error('No data to import — upload a file first');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('bulk-import-data', {
        body: parsedData,
      });
      if (error) throw error;
      setResult(data);
      if (data?.errors?.length) {
        toast.warning(`Imported with ${data.errors.length} errors`);
      } else {
        toast.success('Bulk import completed successfully');
      }
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalRows = Object.values(parsedData).reduce((s, arr) => s + (arr?.length || 0), 0);

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="w-8 h-8 text-primary" />
          Bulk Data Import
        </h1>
        <p className="text-muted-foreground mt-1">Developer-only: import schools, users, classes, subjects, chapters, and materials in one Excel file.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step 1 — Download Template</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Download the multi-sheet Excel template. Each tab represents one entity (schools, users, classes, subjects, chapters, materials).
            Use the <strong>school_code</strong> column to link entities across sheets. You can fill only the sheets you need.
          </p>
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="font-semibold text-foreground">🔐 Auto-generated credentials (leave email & password blank in the users sheet):</div>
            <div><strong>Super Admin / Admin / Teacher</strong> → email: <code>firstname.lastname@&lt;schoolhandle&gt;.com</code> · password: <code>&lt;Schoolhandle&gt;@{new Date().getFullYear()}</code> (e.g. <code>Bfa@{new Date().getFullYear()}</code>)</div>
            <div><strong>Student</strong> → email: <code>&lt;admission_no&gt;@&lt;schoolhandle&gt;.com</code> · password: <code>DDMMYYYY</code> (date of birth, e.g. <code>12012010</code>)</div>
            <div className="text-muted-foreground italic">You can override either by filling the email/password column for any row.</div>
          </div>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="w-4 h-4 mr-2" /> Download Excel Template
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Step 2 — Upload Filled File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
          />
          {totalRows > 0 && (
            <div className="text-sm">
              <strong>{totalRows}</strong> rows ready across:{' '}
              {Object.entries(parsedData).map(([k, v]) => (
                <span key={k} className="inline-block mr-3">
                  <span className="font-medium">{k}</span>: {v?.length}
                </span>
              ))}
            </div>
          )}
          <Button onClick={submit} disabled={loading || totalRows === 0} className="w-full sm:w-auto">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {loading ? 'Importing...' : `Import ${totalRows} rows`}
          </Button>
        </CardContent>
      </Card>

      {totalRows > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={Object.keys(parsedData)[0]}>
              <TabsList className="flex-wrap h-auto">
                {Object.entries(parsedData).map(([k, v]) => (
                  <TabsTrigger key={k} value={k}>{k} ({v?.length})</TabsTrigger>
                ))}
              </TabsList>
              {Object.entries(parsedData).map(([k, v]) => (
                <TabsContent key={k} value={k}>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>{v && v[0] && Object.keys(v[0]).map((h) => <th key={h} className="text-left p-2">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {v?.slice(0, 10).map((row, i) => (
                          <tr key={i} className="border-t">
                            {Object.values(row).map((cell, j) => <td key={j} className="p-2">{String(cell ?? '')}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {v && v.length > 10 && <div className="p-2 text-center text-muted-foreground text-xs">+ {v.length - 10} more rows</div>}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.errors?.length ? <AlertTriangle className="w-5 h-5 text-warning" /> : <CheckCircle2 className="w-5 h-5 text-success" />}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {Object.entries(result.created || {}).map(([k, v]: any) => (
                <div key={k} className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{v as number}</div>
                  <div className="text-xs text-muted-foreground capitalize">{k}</div>
                </div>
              ))}
            </div>
            {result.errors?.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 text-destructive">Errors ({result.errors.length})</h4>
                <div className="max-h-64 overflow-y-auto border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Sheet</th><th className="p-2 text-left">Row</th>
                        <th className="p-2 text-left">Identifier</th><th className="p-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errors.map((e: any, i: number) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{e.sheet}</td><td className="p-2">{e.row}</td>
                          <td className="p-2">{e.identifier}</td><td className="p-2 text-destructive">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BulkImportPage;
