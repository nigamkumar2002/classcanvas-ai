import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayCircle, StopCircle, Users, ChevronLeft, ChevronRight, Pen, Eraser, MousePointer, Trash2,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Highlighter, MessageSquare, FileText, Copy, Check, UserCheck, UserX, Clock, Link as LinkIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type Tool = 'pointer' | 'pen' | 'eraser' | 'highlighter';
const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#000000'];

interface Annotation { tool: 'pen' | 'eraser' | 'highlighter'; points: { x: number; y: number }[]; color: string; width: number; }
interface MaterialItem { id: string; title: string; file_url?: string; file_type?: string; type: string; }
interface Participant { id: string; session_id: string; user_id: string; status: string; joined_at: string; approved_at: string | null; }

const LiveClassPage = () => {
  const { user } = useAuth();
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [smartBoardOpen, setSmartBoardOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [tool, setTool] = useState<Tool>('pointer');
  const [color, setColor] = useState('#EF4444');
  const [lineWidth, setLineWidth] = useState(3);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [zoom, setZoom] = useState(100);
  const [chatMessages, setChatMessages] = useState<{text: string; sender: string; time: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null); // pending, approved, rejected
  const [copied, setCopied] = useState(false);
  const [classes, setClasses] = useState<{id: string; name: string}[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'super_admin';
  const isStudent = user?.role === 'student';

  const generateJoinCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  useEffect(() => {
    const init = async () => {
      try {
        const [{ data: sessions }, { data: mats }] = await Promise.all([
          supabase.from('live_sessions').select('*').eq('status', 'active').limit(1),
          supabase.from('materials').select('id, title, file_url, file_type, type'),
        ]);

        if (isTeacher) {
          const { data: cls } = await supabase.from('classes').select('id, name');
          setClasses(cls || []);
        }

        if (sessions?.[0]) {
          setActiveSession(sessions[0]);
          setJoinCode(sessions[0].join_code || '');
          if (isTeacher) setSmartBoardOpen(true);

          // Check student join status
          if (isStudent) {
            const { data: p } = await supabase
              .from('live_session_participants')
              .select('*')
              .eq('session_id', sessions[0].id)
              .eq('user_id', user?.user_id)
              .single();
            if (p) setJoinStatus((p as Participant).status);
          }

          // Load participants
          const { data: parts } = await supabase
            .from('live_session_participants')
            .select('*')
            .eq('session_id', sessions[0].id);
          setParticipants((parts as Participant[]) || []);
        }
        setMaterials((mats as MaterialItem[]) || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    init();
  }, []);

  // Realtime participants
  useEffect(() => {
    if (!activeSession) return;
    const channel = supabase
      .channel('live-participants')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_session_participants',
        filter: `session_id=eq.${activeSession.id}`,
      }, () => {
        supabase.from('live_session_participants').select('*').eq('session_id', activeSession.id)
          .then(({ data }) => setParticipants((data as Participant[]) || []));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeSession?.id]);

  const startClass = async () => {
    if (!sessionTitle.trim()) { toast.error('Please enter a session title'); return; }
    setStarting(true);
    const code = generateJoinCode();
    const { data, error } = await supabase.from('live_sessions').insert({
      title: sessionTitle.trim(),
      teacher_id: user?.user_id,
      status: 'active',
      started_at: new Date().toISOString(),
      join_code: code,
      class_id: selectedClassId || null,
      school_id: user?.school_id || null,
    } as any).select().single();
    if (!error && data) {
      setActiveSession(data);
      setJoinCode(code);
      setSmartBoardOpen(true);
      toast.success(`Live class started! Join code: ${code}`);

      // Notify students
      if (user?.school_id) {
        const { data: students } = await supabase.from('profiles').select('user_id').eq('school_id', user.school_id).eq('role', 'student');
        if (students) {
          const notifs = students.map((s: any) => ({
            user_id: s.user_id,
            title: '🔴 Live Class Started!',
            message: `${user.full_name} started "${sessionTitle.trim()}". Join code: ${code}`,
            type: 'live_class',
            school_id: user.school_id,
            link: '/live-class',
          }));
          await supabase.from('notifications').insert(notifs as any);
        }
      }
    }
    setStarting(false);
  };

  const endClass = async () => {
    if (!activeSession) return;
    await supabase.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() } as any).eq('id', activeSession.id);
    await supabase.from('live_session_participants').delete().eq('session_id', activeSession.id);
    setActiveSession(null); setSmartBoardOpen(false); setPdfDoc(null); setSelectedMaterial(null);
    setParticipants([]); setJoinCode('');
    toast.success('Live class ended');
  };

  const requestToJoin = async () => {
    if (!activeSession) return;
    const { error } = await supabase.from('live_session_participants').insert({
      session_id: activeSession.id,
      user_id: user?.user_id,
      status: 'pending',
    } as any);
    if (error) {
      if (error.message.includes('duplicate')) {
        toast.info('You have already requested to join');
      } else {
        toast.error(error.message);
      }
    } else {
      setJoinStatus('pending');
      toast.success('Join request sent! Waiting for teacher approval.');
    }
  };

  const joinByCode = async () => {
    if (!joinCodeInput.trim()) return;
    const { data: sessions } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('join_code', joinCodeInput.trim().toUpperCase())
      .eq('status', 'active')
      .single();
    if (!sessions) { toast.error('Invalid or expired join code'); return; }
    setActiveSession(sessions);
    setJoinCode(joinCodeInput.trim().toUpperCase());
    await supabase.from('live_session_participants').insert({
      session_id: (sessions as any).id,
      user_id: user?.user_id,
      status: 'pending',
    } as any);
    setJoinStatus('pending');
    toast.success('Join request sent!');
  };

  const approveParticipant = async (participantId: string) => {
    await supabase.from('live_session_participants')
      .update({ status: 'approved', approved_at: new Date().toISOString() } as any)
      .eq('id', participantId);
  };

  const rejectParticipant = async (participantId: string) => {
    await supabase.from('live_session_participants').delete().eq('id', participantId);
  };

  const approveAll = async () => {
    const pending = participants.filter(p => p.status === 'pending');
    for (const p of pending) {
      await supabase.from('live_session_participants')
        .update({ status: 'approved', approved_at: new Date().toISOString() } as any)
        .eq('id', p.id);
    }
    toast.success('All students approved!');
  };

  const copyJoinCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyJoinLink = () => {
    const link = `${window.location.origin}/live-class?code=${joinCode}`;
    navigator.clipboard.writeText(link);
    toast.success('Join link copied!');
  };

  // Check URL for join code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) setJoinCodeInput(code);
  }, []);

  // PDF loading
  useEffect(() => {
    if (!selectedMaterial?.file_url) return;
    const isPDF = selectedMaterial.file_type?.includes('pdf') || selectedMaterial.file_url?.endsWith('.pdf');
    if (!isPDF) return;
    pdfjsLib.getDocument({ url: selectedMaterial.file_url }).promise.then(doc => {
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1);
    }).catch(() => {});
  }, [selectedMaterial]);

  useEffect(() => {
    if (!pdfDoc || !pdfCanvasRef.current) return;
    const render = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const scale = (zoom / 100) * 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = pdfCanvasRef.current!;
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      if (annotCanvasRef.current) {
        annotCanvasRef.current.width = viewport.width; annotCanvasRef.current.height = viewport.height;
        drawAllAnnotations();
      }
    };
    render();
  }, [pdfDoc, currentPage, zoom]);

  const drawAllAnnotations = useCallback(() => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    annotations.forEach(ann => {
      if (ann.points.length < 2) return;
      ctx.beginPath();
      if (ann.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = ann.width * 5; }
      else if (ann.tool === 'highlighter') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.35; ctx.lineWidth = ann.width * 6; }
      else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineWidth = ann.width; }
      ctx.strokeStyle = ann.tool === 'eraser' ? '#000' : ann.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ann.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
  }, [annotations]);

  useEffect(() => { drawAllAnnotations(); }, [drawAllAnnotations]);

  const getPos = (e: React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const startDraw = (e: React.MouseEvent) => {
    if (tool === 'pointer' || !isTeacher || !annotCanvasRef.current) return;
    const pos = getPos(e, annotCanvasRef.current);
    setCurrentAnnotation({ tool: tool as Annotation['tool'], points: [pos], color, width: lineWidth });
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawing || !currentAnnotation || !annotCanvasRef.current) return;
    const pos = getPos(e, annotCanvasRef.current);
    const updated = { ...currentAnnotation, points: [...currentAnnotation.points, pos] };
    setCurrentAnnotation(updated);
    const ctx = annotCanvasRef.current.getContext('2d')!;
    const pts = updated.points;
    if (pts.length >= 2) {
      ctx.beginPath();
      if (updated.tool === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineWidth = updated.width * 6; }
      else if (updated.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = updated.width * 5; }
      else { ctx.globalAlpha = 1; ctx.lineWidth = updated.width; }
      ctx.strokeStyle = updated.tool === 'eraser' ? '#000' : updated.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  };

  const stopDraw = () => {
    if (!isDrawing || !currentAnnotation) return;
    setAnnotations(prev => [...prev, currentAnnotation]);
    setCurrentAnnotation(null); setIsDrawing(false);
  };

  const clearCanvas = () => {
    setAnnotations([]);
    if (annotCanvasRef.current) {
      const ctx = annotCanvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, annotCanvasRef.current.width, annotCanvasRef.current.height);
    }
  };

  const changePage = (p: number) => { setCurrentPage(p); setAnnotations([]); };

  const sendChatMessage = () => {
    if (!chatInput.trim()) return;
    setChatMessages(prev => [...prev, { text: chatInput, sender: user?.full_name || 'User', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
    setChatInput('');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // SMART BOARD VIEW
  if (smartBoardOpen && activeSession && (isTeacher || joinStatus === 'approved')) {
    const hasPDF = !!pdfDoc;
    const pendingCount = participants.filter(p => p.status === 'pending').length;
    const approvedCount = participants.filter(p => p.status === 'approved').length;

    return (
      <div className={cn('fixed z-50 bg-slate-950 flex flex-col', fullscreen ? 'inset-0' : 'inset-2 rounded-2xl overflow-hidden')}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
              <div className="pulse-dot w-1.5 h-1.5" /><span className="text-red-400 text-xs font-bold">LIVE</span>
            </div>
            <span className="text-white font-semibold text-sm hidden sm:block truncate max-w-[200px]">{selectedMaterial?.title || activeSession.title}</span>
            {isTeacher && joinCode && (
              <button onClick={copyJoinCode} className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 text-xs font-mono">
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                {joinCode}
              </button>
            )}
          </div>
          {hasPDF && (
            <div className="flex items-center gap-2">
              <button onClick={() => changePage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-white text-sm font-medium px-2">{currentPage}/{totalPages}</span>
              <button onClick={() => changePage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowParticipants(!showParticipants)} className={cn('relative p-1.5 rounded-lg transition-colors', showParticipants ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20')}>
              <Users className="w-4 h-4" />
              {pendingCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[10px] text-white font-bold flex items-center justify-center">{pendingCount}</span>}
              <span className="hidden sm:inline ml-1 text-xs font-semibold">{approvedCount}</span>
            </button>
            {isTeacher && <button onClick={() => setShowMaterialPicker(true)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20" title="Select Material"><FileText className="w-4 h-4" /></button>}
            <button onClick={() => setShowChat(!showChat)} className={cn('p-1.5 rounded-lg transition-colors', showChat ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20')}><MessageSquare className="w-4 h-4" /></button>
            <button onClick={() => setZoom(z => Math.min(200, z + 20))} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"><ZoomIn className="w-4 h-4" /></button>
            <button onClick={() => setZoom(z => Math.max(50, z - 20))} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"><ZoomOut className="w-4 h-4" /></button>
            <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20">
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {isTeacher && <button onClick={endClass} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-semibold"><StopCircle className="w-3.5 h-3.5" /> End</button>}
            <button onClick={() => setSmartBoardOpen(false)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20">✕</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {isTeacher && (
            <div className="flex flex-col items-center gap-2 p-2 bg-slate-800 border-r border-white/10 w-12 flex-shrink-0">
              {([{ t: 'pointer', icon: MousePointer }, { t: 'pen', icon: Pen }, { t: 'highlighter', icon: Highlighter }, { t: 'eraser', icon: Eraser }] as const).map(({ t, icon: Icon }) => (
                <button key={t} onClick={() => setTool(t)} className={cn('p-2 rounded-lg transition-all', tool === t ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20')}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
              <div className="w-full h-px bg-white/10 my-1" />
              {COLORS.map(c => (
                <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                  className={cn('w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0', color === c && tool !== 'eraser' ? 'border-white' : 'border-transparent')}
                  style={{ background: c }} />
              ))}
              <div className="w-full h-px bg-white/10 my-1" />
              <button onClick={clearCanvas} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 relative">
            {hasPDF ? (
              <div className="relative">
                <canvas ref={pdfCanvasRef} className="max-w-full" />
                <canvas ref={annotCanvasRef} className="absolute inset-0 max-w-full"
                  style={{ cursor: tool === 'pointer' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair' }}
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw} />
              </div>
            ) : (
              <div className="text-center text-white/50 p-8">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">No material selected</p>
                {isTeacher && <button onClick={() => setShowMaterialPicker(true)} className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-medium hover:opacity-90">Select Material</button>}
              </div>
            )}
          </div>

          {/* Participants Panel */}
          {showParticipants && isTeacher && (
            <div className="w-64 bg-slate-900 border-l border-white/10 flex flex-col flex-shrink-0">
              <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm">Participants</h3>
                {participants.filter(p => p.status === 'pending').length > 0 && (
                  <button onClick={approveAll} className="text-xs text-green-400 font-medium hover:underline">Approve All</button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {participants.length === 0 ? (
                  <p className="text-white/30 text-xs text-center py-4">No join requests yet</p>
                ) : participants.map(p => (
                  <div key={p.id} className={cn('flex items-center justify-between p-2 rounded-lg', p.status === 'pending' ? 'bg-amber-500/10' : 'bg-white/5')}>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full', p.status === 'approved' ? 'bg-green-500' : 'bg-amber-500')} />
                      <span className="text-white text-xs truncate max-w-[120px]">{p.user_id.slice(0, 8)}...</span>
                    </div>
                    {p.status === 'pending' ? (
                      <div className="flex gap-1">
                        <button onClick={() => approveParticipant(p.id)} className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30"><UserCheck className="w-3 h-3" /></button>
                        <button onClick={() => rejectParticipant(p.id)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"><UserX className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <span className="text-green-400 text-[10px]">✓</span>
                    )}
                  </div>
                ))}
              </div>
              {joinCode && (
                <div className="p-3 border-t border-white/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <button onClick={copyJoinCode} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-mono hover:bg-white/20">
                      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} {joinCode}
                    </button>
                  </div>
                  <button onClick={copyJoinLink} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30">
                    <LinkIcon className="w-3 h-3" /> Copy Join Link
                  </button>
                </div>
              )}
            </div>
          )}

          {showChat && (
            <div className="w-72 bg-slate-900 border-l border-white/10 flex flex-col flex-shrink-0">
              <div className="p-3 border-b border-white/10"><h3 className="text-white font-semibold text-sm">Live Chat</h3></div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatMessages.map((m, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-2">
                    <p className="text-white/70 text-xs font-medium">{m.sender} <span className="text-white/30">{m.time}</span></p>
                    <p className="text-white text-sm">{m.text}</p>
                  </div>
                ))}
                {chatMessages.length === 0 && <p className="text-white/30 text-xs text-center py-4">No messages yet</p>}
              </div>
              <div className="p-3 border-t border-white/10 flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Type a message..." className="flex-1 px-3 py-2 bg-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none" />
                <button onClick={sendChatMessage} className="px-3 py-2 bg-primary rounded-lg text-white text-xs font-medium">Send</button>
              </div>
            </div>
          )}
        </div>

        {showMaterialPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60">
            <div className="bg-card rounded-2xl shadow-xl border border-border w-full max-w-md max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
                <h3 className="font-bold">Select Material</h3>
                <button onClick={() => setShowMaterialPicker(false)} className="p-1.5 rounded-lg hover:bg-muted">✕</button>
              </div>
              <div className="p-4 space-y-2">
                {materials.filter(m => m.file_url).map(m => (
                  <button key={m.id} onClick={() => { setSelectedMaterial(m); setShowMaterialPicker(false); }}
                    className={cn('w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                      selectedMaterial?.id === m.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50')}>
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.type?.replace('_', ' ')}</p>
                    </div>
                  </button>
                ))}
                {materials.filter(m => m.file_url).length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">No materials with files uploaded yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // STUDENT: waiting for approval
  if (activeSession && isStudent && joinStatus === 'pending') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Live Class</h1>
          <p className="text-muted-foreground text-sm mt-1">Waiting for teacher approval</p>
        </div>
        <div className="bg-card rounded-2xl border border-border shadow-card p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Waiting for Approval</h2>
          <p className="text-muted-foreground">Your join request has been sent to the teacher. Please wait for approval to enter the class.</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      </div>
    );
  }

  // MAIN VIEW
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live Class</h1>
        <p className="text-muted-foreground text-sm mt-1">{isTeacher ? 'Start a live teaching session' : 'Join an active class'}</p>
      </div>

      {isTeacher ? (
        <div className="space-y-6">
          <div className="bg-gradient-hero rounded-2xl p-8 text-white">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <PlayCircle className="w-10 h-10" />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold mb-2">Smart Board Teaching</h2>
                <p className="text-blue-200 mb-4">PDF annotations, live sync & student management</p>
                <div className="space-y-3">
                  <input
                    value={sessionTitle}
                    onChange={e => setSessionTitle(e.target.value)}
                    placeholder="Session title (e.g. Math - Chapter 5)"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm"
                  />
                  <div className="flex gap-3">
                    <select
                      value={selectedClassId}
                      onChange={e => setSelectedClassId(e.target.value)}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none [&>option]:text-black"
                    >
                      <option value="">All classes (optional)</option>
                      {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      onClick={startClass}
                      disabled={starting || !sessionTitle.trim()}
                      className="px-6 py-2.5 rounded-xl bg-white text-blue-600 font-bold text-sm hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {starting ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                      {starting ? 'Starting...' : 'Start Live Class'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {activeSession ? (
            <div className="bg-card rounded-2xl border border-border shadow-card p-6">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 border border-green-200 mb-4">
                <div className="pulse-dot" />
                <div>
                  <p className="font-semibold text-green-800">{activeSession.title}</p>
                  <p className="text-green-600 text-sm">Live class in progress</p>
                </div>
              </div>
              {joinStatus === 'approved' ? (
                <button onClick={() => setSmartBoardOpen(true)} className="w-full py-3 rounded-xl bg-gradient-blue text-white font-semibold hover:opacity-90 flex items-center justify-center gap-2">
                  <PlayCircle className="w-5 h-5" /> Enter Class
                </button>
              ) : !joinStatus ? (
                <button onClick={requestToJoin} className="w-full py-3 rounded-xl bg-gradient-green text-white font-semibold hover:opacity-90 flex items-center justify-center gap-2">
                  <Users className="w-5 h-5" /> Request to Join
                </button>
              ) : null}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border shadow-card p-8 text-center">
              <PlayCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground mb-6">No live class active right now</p>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border shadow-card p-6">
            <h3 className="font-bold mb-3 flex items-center gap-2"><LinkIcon className="w-4 h-4 text-primary" /> Join with Code</h3>
            <div className="flex gap-3">
              <input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter join code (e.g. ABC123)"
                maxLength={6}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono tracking-wider uppercase"
              />
              <button onClick={joinByCode} disabled={!joinCodeInput.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-blue text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50">
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveClassPage;
