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

  const wrap = (Page: React.ComponentType) => (
    <ProtectedRoute>
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
      <Route path="/users" element={wrap(UsersPage)} />
      <Route path="/teachers" element={wrap(UsersPage)} />
      <Route path="/students" element={wrap(UsersPage)} />
      <Route path="/schools" element={wrap(SchoolsPage)} />
      <Route path="/analytics" element={wrap(AnalyticsPage)} />
      <Route path="/settings" element={wrap(SettingsPage)} />
      <Route path="/calendar" element={wrap(CalendarPage)} />
      <Route path="/announcements" element={wrap(AnnouncementsPage)} />

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
