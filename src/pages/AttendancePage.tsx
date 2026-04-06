import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Clock, AlertCircle, Calendar, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface StudentProfile { user_id: string; full_name: string; class_id: string | null; }
interface ClassItem { id: string; name: string; }
interface AttendanceRecord { id: string; student_id: string; class_id: string; date: string; status: string; notes: string | null; }

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present', icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  { value: 'absent', label: 'Absent', icon: XCircle, color: 'text-red-600 bg-red-100' },
  { value: 'late', label: 'Late', icon: Clock, color: 'text-amber-600 bg-amber-100' },
  { value: 'excused', label: 'Excused', icon: AlertCircle, color: 'text-blue-600 bg-blue-100' },
];

const AttendancePage = () => {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});
  const [existingRecords, setExistingRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canMark = user?.role !== 'student';
  const isStudent = user?.role === 'student';

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('classes').select('id, name').order('name');
      setClasses(data || []);
      if (isStudent && user?.class_id) setSelectedClass(user.class_id);
      else if (data?.length) setSelectedClass(data[0].id);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    const loadStudents = async () => {
      if (isStudent) {
        const { data } = await supabase.from('attendance').select('*').eq('student_id', user!.id).eq('class_id', selectedClass).order('date', { ascending: false }).limit(30);
        setExistingRecords((data || []) as AttendanceRecord[]);
      } else {
        const { data: studs } = await supabase.from('profiles').select('user_id, full_name, class_id').eq('role', 'student').eq('class_id', selectedClass);
        setStudents(studs || []);
        const { data: records } = await supabase.from('attendance').select('*').eq('class_id', selectedClass).eq('date', selectedDate);
        const map: Record<string, string> = {};
        (records || []).forEach((r: any) => { map[r.student_id] = r.status; });
        setAttendance(map);
      }
    };
    loadStudents();
  }, [selectedClass, selectedDate]);

  const handleSave = async () => {
    if (!canMark) return;
    setSaving(true);
    const entries = Object.entries(attendance);
    for (const [studentId, status] of entries) {
      const { data: existing } = await supabase.from('attendance').select('id').eq('student_id', studentId).eq('class_id', selectedClass).eq('date', selectedDate).maybeSingle();
      if (existing) {
        await supabase.from('attendance').update({ status, marked_by: user!.id }).eq('id', existing.id);
      } else {
        await supabase.from('attendance').insert({ student_id: studentId, class_id: selectedClass, date: selectedDate, status, marked_by: user!.id, school_id: user!.school_id });
      }
    }
    setSaving(false);
    toast({ title: 'Attendance saved successfully' });
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Attendance</h1>
        <p className="text-muted-foreground text-sm mt-1">{isStudent ? 'View your attendance history' : 'Mark and manage student attendance'}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!isStudent && (
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        )}
      </div>

      {isStudent ? (
        <div className="bg-card rounded-2xl border border-border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> My Attendance History</h3>
          {existingRecords.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">No attendance records found</p>
          ) : (
            <div className="space-y-2">
              {existingRecords.map(r => {
                const opt = STATUS_OPTIONS.find(o => o.value === r.status) || STATUS_OPTIONS[0];
                return (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
                    <span className="text-sm font-medium">{new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${opt.color}`}>{opt.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {students.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-2xl border border-border">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No students assigned to this class</p>
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr,auto] gap-2 p-4 border-b border-border bg-muted/30">
                <span className="text-sm font-semibold">Student</span>
                <span className="text-sm font-semibold text-right">Status</span>
              </div>
              <div className="divide-y divide-border">
                {students.map(s => (
                  <div key={s.user_id} className="grid grid-cols-[1fr,auto] gap-2 items-center p-4">
                    <span className="text-sm font-medium truncate">{s.full_name}</span>
                    <div className="flex gap-1">
                      {STATUS_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setAttendance(prev => ({ ...prev, [s.user_id]: opt.value }))}
                          className={`p-1.5 rounded-lg transition-colors ${attendance[s.user_id] === opt.value ? opt.color : 'text-muted-foreground hover:bg-muted'}`}
                          title={opt.label}>
                          <opt.icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-border">
                <button onClick={handleSave} disabled={saving}
                  className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Attendance'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendancePage;
