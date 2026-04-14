import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import ClassesPage from "@/pages/ClassesPage";
import LiveClassPage from "@/pages/LiveClassPage";
import ExamPage from "@/pages/ExamPage";
import UsersPage from "@/pages/UsersPage";
import SchoolsPage from "@/pages/SchoolsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import SettingsPage from "@/pages/SettingsPage";
import CalendarPage from "@/pages/CalendarPage";
import AnnouncementsPage from "@/pages/AnnouncementsPage";
import ContentApprovalPage from "@/pages/ContentApprovalPage";
import AttendancePage from "@/pages/AttendancePage";
import GradeBookPage from "@/pages/GradeBookPage";
import MessagesPage from "@/pages/MessagesPage";
import FeeManagementPage from "@/pages/FeeManagementPage";
import CertificatesPage from "@/pages/CertificatesPage";
import StudyPlannerPage from "@/pages/StudyPlannerPage";
import FeedbackPage from "@/pages/FeedbackPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import ProfilePage from "@/pages/ProfilePage";
import NotFound from "./pages/NotFound";

const AppRoutes = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">Loading EduCloud LMS...</p>
        </div>
      </div>
    );
  }

  const wrap = (Page: React.ComponentType, allowedRoles?: string[]) => (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <AppLayout><Page /></AppLayout>
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} replace />} />

      <Route path="/dashboard" element={wrap(Dashboard)} />
      <Route path="/classes" element={wrap(ClassesPage)} />
      <Route path="/content" element={wrap(ClassesPage)} />
      <Route path="/live-class" element={wrap(LiveClassPage)} />
      <Route path="/exams" element={wrap(ExamPage)} />
      <Route path="/results" element={wrap(ExamPage)} />

      <Route path="/users" element={wrap(UsersPage, ['developer', 'super_admin', 'admin', 'teacher'])} />
      <Route path="/teachers" element={wrap(UsersPage, ['developer', 'super_admin', 'admin'])} />
      <Route path="/students" element={wrap(UsersPage, ['developer', 'super_admin', 'admin', 'teacher'])} />
      <Route path="/schools" element={wrap(SchoolsPage, ['developer', 'super_admin'])} />
      <Route path="/analytics" element={wrap(AnalyticsPage, ['developer', 'super_admin', 'admin'])} />
      <Route path="/settings" element={wrap(SettingsPage)} />
      <Route path="/profile" element={wrap(ProfilePage)} />
      <Route path="/calendar" element={wrap(CalendarPage)} />
      <Route path="/announcements" element={wrap(AnnouncementsPage)} />

      {/* New feature routes */}
      <Route path="/approvals" element={wrap(ContentApprovalPage, ['developer', 'super_admin', 'admin', 'teacher'])} />
      <Route path="/attendance" element={wrap(AttendancePage)} />
      <Route path="/gradebook" element={wrap(GradeBookPage)} />
      <Route path="/messages" element={wrap(MessagesPage)} />
      <Route path="/fees" element={wrap(FeeManagementPage, ['developer', 'super_admin', 'admin', 'student'])} />
      <Route path="/certificates" element={wrap(CertificatesPage)} />
      <Route path="/study-planner" element={wrap(StudyPlannerPage, ['student'])} />
      <Route path="/feedback" element={wrap(FeedbackPage)} />
      <Route path="/audit-logs" element={wrap(AuditLogsPage, ['developer', 'super_admin'])} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;
