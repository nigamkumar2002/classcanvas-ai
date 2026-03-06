import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, GraduationCap, Shield, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const DEMO_CREDS = [
  { label: 'Developer', email: 'developer@gnail.com', password: 'Developer@265', color: 'from-cyan-500 to-blue-600', icon: '💻', role: 'Platform Owner & Reseller' },
  { label: 'Super Admin', email: 'superadmin@schoollms.com', password: 'SuperAdmin@123', color: 'from-violet-500 to-purple-600', icon: '👑', role: 'Full System Control' },
  { label: 'School Admin', email: 'admin@schoollms.com', password: 'Admin@123', color: 'from-blue-500 to-indigo-600', icon: '🏫', role: 'Manage Content & Classes' },
  { label: 'Teacher', email: 'teacher@schoollms.com', password: 'Teacher@123', color: 'from-emerald-500 to-teal-600', icon: '👨‍🏫', role: 'Teach & Upload Content' },
  { label: 'Student', email: 'student@schoollms.com', password: 'Student@123', color: 'from-amber-500 to-orange-600', icon: '🎓', role: 'Learn & Attend Classes' },
];

const LoginPage = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreds, setShowCreds] = useState(true);
  const [demosVisible, setDemosVisible] = useState(true);

  // Check platform setting for demo credentials visibility
  useEffect(() => {
    const checkSetting = async () => {
      try {
        const { data } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', 'show_demo_credentials')
          .single();
        if (data) {
          setDemosVisible(data.value === true || data.value === 'true');
        }
      } catch {
        // Default to visible if setting doesn't exist
      }
    };
    checkSetting();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) {
      setError(error.message || 'Invalid credentials. Please try again.');
    }
    setLoading(false);
  };

  const fillCreds = (cred: typeof DEMO_CREDS[0]) => {
    setEmail(cred.email);
    setPassword(cred.password);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className={cn("relative w-full mx-auto grid items-center", demosVisible ? "max-w-5xl lg:grid-cols-2 gap-8" : "max-w-md")}>
        {demosVisible && (
          <div className="hidden lg:flex flex-col gap-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-hero flex items-center justify-center shadow-glow-blue">
                <GraduationCap className="w-9 h-9 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white" style={{fontFamily: 'Poppins, sans-serif'}}>EduCloud LMS</h1>
                <p className="text-blue-300 text-sm">Professional School Learning Platform</p>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { icon: '📚', title: 'Structured Learning', desc: 'Class → Subject → Chapter hierarchy' },
                { icon: '🎯', title: 'Smart Board Mode', desc: 'Real-time PDF teaching & annotation' },
                { icon: '⚡', title: 'Live Classes', desc: 'Sync content to all students instantly' },
                { icon: '🏫', title: 'Multi-School Support', desc: 'Isolated data per school with developer management' },
                { icon: '🔔', title: 'Real-time Notifications', desc: 'Instant alerts for classes, exams & announcements' },
              ].map((f) => (
                <div key={f.title} className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-2xl">{f.icon}</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{f.title}</p>
                    <p className="text-blue-300 text-xs mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <span>✅</span> Demo accounts ready
            </div>
          </div>
        )}

        <div className="w-full">
          <div className={cn("flex items-center gap-3 mb-6", demosVisible ? "lg:hidden justify-center" : "justify-center")}>
            <div className="w-12 h-12 rounded-xl bg-gradient-hero flex items-center justify-center">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">EduCloud LMS</h1>
              <p className="text-blue-300 text-xs">Professional School Platform</p>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-xl">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white" style={{fontFamily: 'Poppins, sans-serif'}}>Welcome Back</h2>
              <p className="text-blue-300 text-sm mt-1">Sign in to your account</p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-blue-200 text-sm font-medium mb-1.5 block">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your email" required
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
              </div>
              <div>
                <label className="text-blue-200 text-sm font-medium mb-1.5 block">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required
                    className="w-full px-4 py-3 pr-12 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-hero hover:opacity-90 transition-all duration-200 disabled:opacity-50 shadow-glow-blue mt-2 flex items-center justify-center gap-2">
                {loading ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in...</>) : (<><Lock className="w-4 h-4" />Sign In</>)}
              </button>
            </form>

            {demosVisible && (
              <div className="mt-6">
                <button onClick={() => setShowCreds(!showCreds)}
                  className="w-full flex items-center justify-between text-blue-300 text-sm font-medium py-2 px-3 rounded-xl hover:bg-white/5 transition-colors">
                  <span className="flex items-center gap-2"><Shield className="w-4 h-4" />Demo Credentials</span>
                  {showCreds ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {showCreds && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {DEMO_CREDS.map((cred) => (
                      <button key={cred.label} onClick={() => fillCreds(cred)}
                        className={cn("relative p-3 rounded-xl text-left transition-all hover:scale-105 group", `bg-gradient-to-br ${cred.color} opacity-80 hover:opacity-100`)}>
                        <div className="text-lg mb-1">{cred.icon}</div>
                        <p className="text-white text-xs font-bold">{cred.label}</p>
                        <p className="text-white/70 text-[10px]">{cred.role}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-center text-white/30 text-xs mt-6">🔒 Secure enterprise authentication · No public signup</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
