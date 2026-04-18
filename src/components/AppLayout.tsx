import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  GraduationCap, LayoutDashboard, BookOpen, Users, Settings,
  LogOut, ChevronLeft, ChevronRight, PlayCircle, FileText,
  BarChart3, School, Upload, ClipboardList, Search, Menu, Calendar, Megaphone,
  CheckSquare, UserCheck, Award, MessageSquare, DollarSign, Star, Shield, BookMarked, User, NotebookPen, AlertTriangle, Brain, Printer, FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import NotificationDropdown from '@/components/NotificationDropdown';

const ROLE_MENUS: Record<string, { label: string; icon: React.ElementType; path: string }[]> = {
  developer: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Schools', icon: School, path: '/schools' },
    { label: 'All Users', icon: Users, path: '/users' },
    { label: 'Bulk Import', icon: FileSpreadsheet, path: '/bulk-import' },
    { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { label: 'Complaints', icon: AlertTriangle, path: '/complaints' },
    { label: 'Messages', icon: MessageSquare, path: '/messages' },
    { label: 'Announcements', icon: Megaphone, path: '/announcements' },
    { label: 'Analytics', icon: BarChart3, path: '/analytics' },
    { label: 'Audit Logs', icon: Shield, path: '/audit-logs' },
    { label: 'Lesson Planner', icon: NotebookPen, path: '/lesson-planner' },
    { label: 'Print Material', icon: Printer, path: '/study-material-print' },
    { label: 'Settings', icon: Settings, path: '/settings' },
    { label: 'My Profile', icon: User, path: '/profile' },
  ],
  super_admin: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Classes', icon: BookOpen, path: '/classes' },
    { label: 'Content', icon: FileText, path: '/content' },
    { label: 'Live Class', icon: PlayCircle, path: '/live-class' },
    { label: 'Exams', icon: ClipboardList, path: '/exams' },
    { label: 'Schools', icon: School, path: '/schools' },
    { label: 'All Users', icon: Users, path: '/users' },
    { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { label: 'Complaints', icon: AlertTriangle, path: '/complaints' },
    { label: 'Attendance', icon: UserCheck, path: '/attendance' },
    { label: 'Grade Book', icon: Award, path: '/gradebook' },
    { label: 'Fees', icon: DollarSign, path: '/fees' },
    { label: 'Messages', icon: MessageSquare, path: '/messages' },
    { label: 'Certificates', icon: Award, path: '/certificates' },
    { label: 'Calendar', icon: Calendar, path: '/calendar' },
    { label: 'Announcements', icon: Megaphone, path: '/announcements' },
    { label: 'Analytics', icon: BarChart3, path: '/analytics' },
    { label: 'Feedback', icon: Star, path: '/feedback' },
    { label: 'Audit Logs', icon: Shield, path: '/audit-logs' },
    { label: 'Lesson Planner', icon: NotebookPen, path: '/lesson-planner' },
    { label: 'Print Material', icon: Printer, path: '/study-material-print' },
    { label: 'Settings', icon: Settings, path: '/settings' },
    { label: 'My Profile', icon: User, path: '/profile' },
  ],
  admin: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Classes', icon: BookOpen, path: '/classes' },
    { label: 'Content', icon: FileText, path: '/content' },
    { label: 'Live Class', icon: PlayCircle, path: '/live-class' },
    { label: 'Exams', icon: ClipboardList, path: '/exams' },
    { label: 'Users', icon: Users, path: '/users' },
    { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { label: 'Complaints', icon: AlertTriangle, path: '/complaints' },
    { label: 'Attendance', icon: UserCheck, path: '/attendance' },
    { label: 'Grade Book', icon: Award, path: '/gradebook' },
    { label: 'Fees', icon: DollarSign, path: '/fees' },
    { label: 'Messages', icon: MessageSquare, path: '/messages' },
    { label: 'Certificates', icon: Award, path: '/certificates' },
    { label: 'Calendar', icon: Calendar, path: '/calendar' },
    { label: 'Announcements', icon: Megaphone, path: '/announcements' },
    { label: 'Analytics', icon: BarChart3, path: '/analytics' },
    { label: 'Feedback', icon: Star, path: '/feedback' },
    { label: 'Lesson Planner', icon: NotebookPen, path: '/lesson-planner' },
    { label: 'Print Material', icon: Printer, path: '/study-material-print' },
    { label: 'Settings', icon: Settings, path: '/settings' },
    { label: 'My Profile', icon: User, path: '/profile' },
  ],
  teacher: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'My Classes', icon: BookOpen, path: '/classes' },
    { label: 'Content Manager', icon: Upload, path: '/content' },
    { label: 'Live Class', icon: PlayCircle, path: '/live-class' },
    { label: 'Exams', icon: ClipboardList, path: '/exams' },
    { label: 'Approvals', icon: CheckSquare, path: '/approvals' },
    { label: 'Complaints', icon: AlertTriangle, path: '/complaints' },
    { label: 'Attendance', icon: UserCheck, path: '/attendance' },
    { label: 'Grade Book', icon: Award, path: '/gradebook' },
    { label: 'Messages', icon: MessageSquare, path: '/messages' },
    { label: 'Certificates', icon: Award, path: '/certificates' },
    { label: 'Calendar', icon: Calendar, path: '/calendar' },
    { label: 'My Students', icon: Users, path: '/students' },
    { label: 'Announcements', icon: Megaphone, path: '/announcements' },
    { label: 'Feedback', icon: Star, path: '/feedback' },
    { label: 'Lesson Planner', icon: NotebookPen, path: '/lesson-planner' },
    { label: 'Settings', icon: Settings, path: '/settings' },
    { label: 'My Profile', icon: User, path: '/profile' },
  ],
  student: [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'My Classes', icon: BookOpen, path: '/classes' },
    { label: 'Live Class', icon: PlayCircle, path: '/live-class' },
    { label: 'Exams', icon: ClipboardList, path: '/exams' },
    { label: 'Practice Tests', icon: Brain, path: '/practice' },
    { label: 'Complaints', icon: AlertTriangle, path: '/complaints' },
    { label: 'Attendance', icon: UserCheck, path: '/attendance' },
    { label: 'Grade Book', icon: Award, path: '/gradebook' },
    { label: 'My Fees', icon: DollarSign, path: '/fees' },
    { label: 'Messages', icon: MessageSquare, path: '/messages' },
    { label: 'Certificates', icon: Award, path: '/certificates' },
    { label: 'Study Planner', icon: BookMarked, path: '/study-planner' },
    { label: 'Feedback', icon: Star, path: '/feedback' },
    { label: 'Lesson Planner', icon: NotebookPen, path: '/lesson-planner' },
    { label: 'Calendar', icon: Calendar, path: '/calendar' },
    { label: 'Settings', icon: Settings, path: '/settings' },
    { label: 'My Profile', icon: User, path: '/profile' },
  ],
};

const ROLE_COLORS: Record<string, string> = {
  developer: 'from-cyan-500 to-blue-600',
  super_admin: 'from-violet-500 to-purple-600',
  admin: 'from-blue-500 to-indigo-600',
  teacher: 'from-emerald-500 to-teal-600',
  student: 'from-amber-500 to-orange-600',
};

const ROLE_LABELS: Record<string, string> = {
  developer: 'Developer',
  super_admin: 'Super Admin',
  admin: 'School Admin',
  teacher: 'Teacher',
  student: 'Student',
};

const ROLE_EMOJIS: Record<string, string> = {
  developer: '💻',
  super_admin: '👑',
  admin: '🏫',
  teacher: '👨‍🏫',
  student: '🎓',
};

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role ?? 'student';
  const menuItems = ROLE_MENUS[role] || ROLE_MENUS.student;
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.student;
  const roleLabel = ROLE_LABELS[role] || 'Student';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-gradient-sidebar">
      <div className={cn(
        "flex items-center gap-3 p-4 border-b border-white/10",
        collapsed && "justify-center p-4"
      )}>
        <div className="w-10 h-10 rounded-xl bg-gradient-hero flex items-center justify-center flex-shrink-0 shadow-glow-blue">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight" style={{fontFamily:'Poppins,sans-serif'}}>EduCloud</p>
            <p className="text-blue-400 text-xs">LMS Platform</p>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-4 border-b border-white/10">
          <div className={cn("flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r", roleColor, "bg-opacity-20")}>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">{ROLE_EMOJIS[role]}</span>
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{user?.full_name}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
                {roleLabel}
              </span>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scroll">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => cn(
              "sidebar-item",
              isActive && "active",
              collapsed && "justify-center px-2"
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-1">
        <button
          onClick={handleSignOut}
          className={cn(
            "sidebar-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex sidebar-item w-full"
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <><ChevronLeft className="w-5 h-5" /><span>Collapse</span></>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className={cn(
        "hidden lg:flex flex-col flex-shrink-0 transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[260px]">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                placeholder="Search classes, subjects..."
                className="pl-9 pr-4 py-2 bg-muted rounded-xl text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationDropdown />
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-hero flex items-center justify-center">
                <span className="text-white text-sm font-bold">
                  {user?.full_name?.[0] || 'U'}
                </span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold leading-none">{user?.full_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{roleLabel}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scroll p-6 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
