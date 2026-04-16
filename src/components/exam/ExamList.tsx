import React from 'react';
import { ClipboardList, Timer, BookOpen, Plus, Loader2, Trash2, Clock, CheckCircle, CalendarClock, Lock } from 'lucide-react';
import type { ExamData } from '@/pages/ExamPage';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  exams: ExamData[];
  loading: boolean;
  canManage: boolean;
  onStartExam: (exam: ExamData) => void;
  onCreateExam: () => void;
  onRefresh?: () => void;
  isExamAccessible?: (exam: ExamData) => { accessible: boolean; reason: string };
}

const ExamList: React.FC<Props> = ({ exams, loading, canManage, onStartExam, onCreateExam, onRefresh, isExamAccessible }) => {
  const { user } = useAuth();
  const isStudent = user?.role === 'student';

  const canDeleteExam = () => {
    return user?.role === 'developer' || user?.role === 'super_admin' || user?.role === 'admin';
  };

  const handleDelete = async (examId: string) => {
    const confirmText = prompt('Type "DELETE" to permanently remove this exam and all its results:');
    if (confirmText !== 'DELETE') { toast.error('Deletion cancelled'); return; }
    try {
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw error;
      toast.success('Exam permanently deleted');
      onRefresh?.();
    } catch {
      toast.error('Failed to delete exam');
    }
  };

  const getStatusBadge = (exam: ExamData) => {
    if (!exam.is_active) return { label: 'Pending Approval', color: 'bg-amber-100 text-amber-700', icon: Clock };

    const ps = (exam as any).publish_status;
    if (ps === 'scheduled' && exam.scheduled_date) {
      const date = new Date(exam.scheduled_date);
      return {
        label: `Scheduled: ${date.toLocaleDateString()}${exam.scheduled_start_time ? ` ${exam.scheduled_start_time}` : ''}`,
        color: 'bg-blue-100 text-blue-700', icon: CalendarClock,
      };
    }
    return { label: 'Published', color: 'bg-green-100 text-green-700', icon: CheckCircle };
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exams & Tests</h1>
          <p className="text-muted-foreground text-sm mt-1">Chapter-wise MCQ exams with auto-evaluation</p>
        </div>
        {canManage && (
          <button onClick={onCreateExam} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:opacity-90 transition-all">
            <Plus className="w-4 h-4" /> Create Exam
          </button>
        )}
      </div>

      {exams.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <ClipboardList className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No Exams Yet</h3>
          <p className="text-muted-foreground text-sm">
            {canManage ? 'Create your first exam to get started.' : 'No exams are available yet.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exams.map(exam => {
            const status = getStatusBadge(exam);
            const access = isExamAccessible ? isExamAccessible(exam) : { accessible: true, reason: '' };
            const locked = isStudent && !access.accessible;

            return (
              <div key={exam.id} className={`bg-card rounded-2xl border border-border p-5 flex flex-col ${locked ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    {locked ? <Lock className="w-6 h-6 text-muted-foreground" /> : <ClipboardList className="w-6 h-6 text-primary" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      <status.icon className="w-3 h-3" /> {status.label}
                    </span>
                    {canManage && canDeleteExam() && (
                      <button onClick={() => handleDelete(exam.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-lg transition-colors" title="Delete exam permanently">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="font-bold text-sm mb-1 line-clamp-2">{exam.title}</h3>
                {exam.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{exam.description}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4 mt-auto">
                  <span className="flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{exam.duration_minutes} min</span>
                  <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{exam.total_marks} marks</span>
                  <span>Pass: {exam.pass_marks}</span>
                </div>
                {locked ? (
                  <div className="w-full py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium text-center">
                    <Lock className="w-3.5 h-3.5 inline mr-1" /> {access.reason}
                  </div>
                ) : (exam.is_active || canManage) ? (
                  <button onClick={() => onStartExam(exam)}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
                    {isStudent ? 'Start Exam' : 'Preview Exam'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExamList;
