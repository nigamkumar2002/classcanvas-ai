import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, BookOpen, Users, FileText, PlayCircle, ClipboardList, ChevronRight, School, Clock, Megaphone } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import AnnouncementBanner from '@/components/AnnouncementBanner';

interface Stats {
  classes: number; subjects: number; chapters: number; materials: number;
  teachers: number; students: number; exams: number; schools: number;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ classes: 0, subjects: 0, chapters: 0, materials: 0, teachers: 0, students: 0, exams: 0, schools: 0 });
  const [loading, setLoading] = useState(true);
  const [subjectData, setSubjectData] = useState<any[]>([]);
  const [recentMaterials, setRecentMaterials] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);

  const isDeveloper = user?.role === 'developer';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const isStudent = user?.role === 'student';

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [clsR, subR, chpR, matR, exmR, matListR, schedR] = await Promise.all([
          supabase.from('classes').select('*', { count: 'exact', head: true }),
          supabase.from('subjects').select('*', { count: 'exact', head: true }),
          supabase.from('chapters').select('*', { count: 'exact', head: true }),
          supabase.from('materials').select('*', { count: 'exact', head: true }),
          supabase.from('exams').select('*', { count: 'exact', head: true }),
          supabase.from('materials').select('*').order('created_at', { ascending: false }).limit(5),
          supabase.from('schedules').select('*').gte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(5),
        ]);

        let teachCount = 0, studCount = 0, schoolCount = 0;
        if (isDeveloper) {
          const { count: sc } = await supabase.from('schools').select('*', { count: 'exact', head: true });
          schoolCount = sc || 0;
        } else if (user?.school_id) {
          const [teachR, studR] = await Promise.all([
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', user.school_id).eq('role', 'teacher'),
            supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('school_id', user.school_id).eq('role', 'student'),
          ]);
          teachCount = teachR.count || 0;
          studCount = studR.count || 0;
        }

        let activeSessionData = null;
        if (isStudent) {
          const { data } = await supabase.from('live_sessions').select('*').eq('status', 'active').limit(1);
          activeSessionData = data?.[0] || null;
        }

        setStats({
          classes: clsR.count || 0, subjects: subR.count || 0, chapters: chpR.count || 0,
          materials: matR.count || 0, exams: exmR.count || 0,
          teachers: teachCount, students: studCount, schools: schoolCount,
        });

        setRecentMaterials(matListR.data || []);
        setUpcomingEvents(schedR.data || []);
        setActiveSession(activeSessionData);

        if (subR.count && subR.count > 0) {
          const { data: subs } = await supabase.from('subjects').select('id, name');
          if (subs) {
            const chapCounts = await Promise.all(subs.map(async s => {
              const { count } = await supabase.from('chapters').select('*', { count: 'exact', head: true }).eq('subject_id', s.id);
              return { name: s.name, value: count || 0 };
            }));
            setSubjectData(chapCounts.filter(c => c.value > 0));
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Clickable stat cards with navigation targets
  const statCards = isDeveloper ? [
    { label: 'Total Schools', value: stats.schools, icon: School, gradient: 'bg-gradient-blue', link: '/schools' },
    { label: 'Total Classes', value: stats.classes, icon: BookOpen, gradient: 'bg-gradient-green', link: '/classes' },
    { label: 'Total Subjects', value: stats.subjects, icon: FileText, gradient: 'bg-gradient-purple', link: '/classes' },
    { label: 'Total Materials', value: stats.materials, icon: BarChart3, gradient: 'bg-gradient-amber', link: '/classes' },
  ] : isStudent ? [
    { label: 'My Subjects', value: stats.subjects, icon: BookOpen, gradient: 'bg-gradient-blue', link: '/classes' },
    { label: 'Chapters', value: stats.chapters, icon: FileText, gradient: 'bg-gradient-green', link: '/classes' },
    { label: 'Materials', value: stats.materials, icon: BarChart3, gradient: 'bg-gradient-amber', link: '/classes' },
    { label: 'Exams Available', value: stats.exams, icon: ClipboardList, gradient: 'bg-gradient-purple', link: '/exams' },
  ] : isTeacher ? [
    { label: 'My Subjects', value: stats.subjects, icon: BookOpen, gradient: 'bg-gradient-blue', link: '/classes' },
    { label: 'Chapters', value: stats.chapters, icon: FileText, gradient: 'bg-gradient-green', link: '/classes' },
    { label: 'Materials', value: stats.materials, icon: BarChart3, gradient: 'bg-gradient-amber', link: '/classes' },
    { label: 'Exams Created', value: stats.exams, icon: ClipboardList, gradient: 'bg-gradient-purple', link: '/exams' },
  ] : [
    { label: 'Total Classes', value: stats.classes, icon: BookOpen, gradient: 'bg-gradient-blue', link: '/classes' },
    { label: 'Subjects', value: stats.subjects, icon: FileText, gradient: 'bg-gradient-green', link: '/classes' },
    { label: 'Teachers', value: stats.teachers, icon: Users, gradient: 'bg-gradient-purple', link: '/users?role=teacher' },
    { label: 'Students', value: stats.students, icon: Users, gradient: 'bg-gradient-amber', link: '/users?role=student' },
  ];

  return (
    <div className="space-y-6">
      <AnnouncementBanner />

      <div className="bg-gradient-hero rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-full opacity-10">
          <div className="w-64 h-64 rounded-full border-4 border-white absolute -top-8 -right-8" />
        </div>
        <div className="relative z-10">
          <p className="text-blue-200 text-sm font-medium mb-1">{greeting()},</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Poppins,sans-serif' }}>{user?.full_name} 👋</h1>
          <p className="text-blue-200 mt-1 text-sm">
            {isDeveloper ? 'Manage schools and platform analytics.' :
             isStudent ? 'Continue learning today!' : 'Manage your classroom efficiently.'}
          </p>
        </div>
      </div>

      {/* Clickable stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => (
          <button key={s.label} onClick={() => navigate(s.link)}
            className="stat-card text-left cursor-pointer hover:shadow-md transition-all">
            <div className={`w-12 h-12 rounded-xl ${s.gradient} flex items-center justify-center mb-4`}>
              <s.icon className="w-6 h-6 text-white" />
            </div>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {upcomingEvents.length > 0 && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Upcoming Events</h3>
            <Link to="/calendar" className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">View Calendar <ChevronRight className="w-4 h-4" /></Link>
          </div>
          <div className="space-y-2">
            {upcomingEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="w-2 h-8 rounded-full" style={{ backgroundColor: ev.color || '#3B82F6' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{ev.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ev.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(ev.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{ev.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isTeacher && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Link to="/live-class" className="stat-card bg-gradient-hero text-white cursor-pointer hover:opacity-90 lg:col-span-1 flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <PlayCircle className="w-8 h-8" />
            </div>
            <p className="text-xl font-bold">Start Live Class</p>
            <p className="text-white/70 text-sm text-center">Open smart board & teach students live</p>
          </Link>
          <div className="stat-card lg:col-span-2">
            <h3 className="font-semibold mb-4">Quick Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-muted/30">
                <p className="text-2xl font-bold">{stats.students}</p>
                <p className="text-xs text-muted-foreground">Total Students</p>
              </div>
              <div className="p-4 rounded-xl bg-muted/30">
                <p className="text-2xl font-bold">{stats.materials}</p>
                <p className="text-xs text-muted-foreground">Materials Uploaded</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isStudent && (
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Live Class Status</h3>
            <Link to="/live-class" className="text-primary text-sm font-medium flex items-center gap-1 hover:underline">
              Go to Class <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {activeSession ? (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-200">
              <div className="pulse-dot" />
              <div>
                <p className="font-semibold text-green-800">{activeSession.title}</p>
                <p className="text-green-600 text-sm">Live class in progress — join now!</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border">
              <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No live class active right now</p>
            </div>
          )}
        </div>
      )}

      {(isAdmin || isDeveloper) && subjectData.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="stat-card">
            <h3 className="font-semibold text-foreground mb-4">Content by Subject</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={subjectData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {subjectData.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-2">
              {subjectData.map((s, idx) => (
                <div key={s.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                  <span className="text-xs text-muted-foreground">{s.name}: {s.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="stat-card">
            <h3 className="font-semibold text-foreground mb-4">Recent Uploads</h3>
            {recentMaterials.length > 0 ? (
              <div className="space-y-3">
                {recentMaterials.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-gradient-blue flex items-center justify-center">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.type?.replace('_', ' ')}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-muted-foreground text-sm text-center py-8">No materials uploaded yet</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;