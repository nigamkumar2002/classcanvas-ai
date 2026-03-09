import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayCircle, StopCircle, Users, ChevronLeft, ChevronRight, Pen, Eraser, MousePointer, Trash2,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Highlighter, MessageSquare, FileText, Copy, Check,
  Clock, Link as LinkIcon, ExternalLink, Video as VideoIcon, Radio
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';
import { useRealtimeSync, type BoardState, type SerializedAnnotation, type CursorState } from '@/components/live-class/useRealtimeSync';
import { useWebRTC } from '@/components/live-class/useWebRTC';
import MediaControls from '@/components/live-class/MediaControls';
import LiveChatPanel from '@/components/live-class/LiveChatPanel';
import ParticipantsPanel from '@/components/live-class/ParticipantsPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type Tool = 'pointer' | 'pen' | 'eraser' | 'highlighter';
const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF'];

interface Annotation extends SerializedAnnotation {}
interface MaterialItem { id: string; title: string; file_url?: string; file_type?: string; type: string; }
interface Participant { id: string; session_id: string; user_id: string; status: string; joined_at: string; approved_at: string | null; profile_name?: string; }

const LiveClassPage = () => {
  const { user } = useAuth();
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement>(null);
  const boardContainerRef = useRef<HTMLDivElement>(null);

  // Session state
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [smartBoardOpen, setSmartBoardOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Drawing state
  const [tool, setTool] = useState<Tool>('pointer');
  const [color, setColor] = useState('#EF4444');
  const [lineWidth, setLineWidth] = useState(3);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);

  // PDF state
  const [zoom, setZoom] = useState(100);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showParticipants, setShowParticipants] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  // UI toggles
  const [showChat, setShowChat] = useState(false);

  // Session creation form
  const [classes, setClasses] = useState<{id: string; name: string}[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [meetingLink, setMeetingLink] = useState('');

  // Student PDF state
  const [studentPdfDoc, setStudentPdfDoc] = useState<any>(null);
  const [studentMaterialUrl, setStudentMaterialUrl] = useState<string | null>(null);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';
  const isStudent = user?.role === 'student';

  const {
    remoteBoardState, remoteCursor, remoteDrawStroke, chatMessages,
    broadcastBoardState, requestBoardState, broadcastCursor, broadcastDrawStroke, broadcastClearCanvas, sendChatMessage,
  } = useRealtimeSync(activeSession?.id || null, isTeacher);

  const {
    localStream, remoteStreams, audioEnabled, videoEnabled,
    isScreenSharing, mediaStarted,
    startMedia, stopMedia, toggleAudio, toggleVideo,
    startScreenShare, stopScreenShare,
  } = useWebRTC(activeSession?.id || null, user?.user_id || '', user?.full_name || 'User');

  const generateJoinCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

  // --- INIT ---
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
          if (isStudent) {
            const { data: p } = await supabase.from('live_session_participants')
              .select('*').eq('session_id', sessions[0].id).eq('user_id', user?.user_id).single();
            if (p) setJoinStatus((p as any).status);
          }
          const { data: parts } = await supabase.from('live_session_participants')
            .select('*').eq('session_id', sessions[0].id);
          setParticipants((parts as Participant[]) || []);
        }
        setMaterials((mats as MaterialItem[]) || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) setJoinCodeInput(code);
  }, []);

  // --- REALTIME PARTICIPANTS ---
  useEffect(() => {
    if (!activeSession) return;
    const channel = supabase.channel('live-participants')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_session_participants',
        filter: `session_id=eq.${activeSession.id}`,
      }, () => {
        supabase.from('live_session_participants').select('*').eq('session_id', activeSession.id)
          .then(({ data }) => setParticipants((data as Participant[]) || []));
      })
      .subscribe();

    if (isStudent) {
      const statusChannel = supabase.channel('my-status')
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'live_session_participants',
          filter: `user_id=eq.${user?.user_id}`,
        }, (payload: any) => {
          if (payload.new?.status === 'approved') {
            setJoinStatus('approved');
            toast.success('You have been approved! You can now enter the class.');
          }
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
        supabase.removeChannel(statusChannel);
      };
    }
    return () => { supabase.removeChannel(channel); };
  }, [activeSession?.id, isStudent, user?.user_id]);

  // Ask teacher for immediate board snapshot when a student joins/enters
  useEffect(() => {
    if (isTeacher || !activeSession || joinStatus !== 'approved') return;
    requestBoardState();

    if (remoteBoardState) return;
    const retry = setInterval(() => requestBoardState(), 1500);
    return () => clearInterval(retry);
  }, [isTeacher, activeSession?.id, joinStatus, remoteBoardState, requestBoardState]);

  // --- SESSION MANAGEMENT ---
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
      meeting_link: meetingLink.trim() || null,
    } as any).select().single();
    if (!error && data) {
      setActiveSession(data);
      setJoinCode(code);
      setSmartBoardOpen(true);
      toast.success(`Live class started! Join code: ${code}`);
      if (user?.school_id) {
        const { data: students } = await supabase.from('profiles').select('user_id')
          .eq('school_id', user.school_id).eq('role', 'student');
        if (students) {
          const notifs = students.map((s: any) => ({
            user_id: s.user_id, title: '🔴 Live Class Started!',
            message: `${user.full_name} started "${sessionTitle.trim()}". Join code: ${code}`,
            type: 'live_class', school_id: user.school_id, link: '/live-class',
          }));
          await supabase.from('notifications').insert(notifs as any);
        }
      }
    }
    setStarting(false);
  };

  const endClass = async () => {
    if (!activeSession) return;
    stopMedia();
    await supabase.from('live_sessions').update({
      status: 'ended', ended_at: new Date().toISOString()
    } as any).eq('id', activeSession.id);
    await supabase.from('live_session_participants').delete().eq('session_id', activeSession.id);
    setActiveSession(null); setSmartBoardOpen(false); setPdfDoc(null);
    setSelectedMaterial(null); setParticipants([]); setJoinCode('');
    setAnnotations([]);
    toast.success('Live class ended');
  };

  const requestToJoin = async () => {
    if (!activeSession) return;
    const { error } = await supabase.from('live_session_participants').insert({
      session_id: activeSession.id, user_id: user?.user_id, status: 'pending',
    } as any);
    if (error) {
      if (error.message.includes('duplicate')) toast.info('Already requested');
      else toast.error(error.message);
    } else {
      setJoinStatus('pending');
      toast.success('Join request sent! Waiting for teacher approval.');
    }
  };

  const joinByCode = async () => {
    if (!joinCodeInput.trim()) return;
    const { data: sessions } = await supabase.from('live_sessions')
      .select('*').eq('join_code', joinCodeInput.trim().toUpperCase()).eq('status', 'active').single();
    if (!sessions) { toast.error('Invalid or expired join code'); return; }
    setActiveSession(sessions);
    setJoinCode(joinCodeInput.trim().toUpperCase());
    await supabase.from('live_session_participants').insert({
      session_id: (sessions as any).id, user_id: user?.user_id, status: 'pending',
    } as any);
    setJoinStatus('pending');
    toast.success('Join request sent!');
  };

  const approveParticipant = async (id: string) => {
    await supabase.from('live_session_participants')
      .update({ status: 'approved', approved_at: new Date().toISOString() } as any).eq('id', id);
  };
  const rejectParticipant = async (id: string) => {
    await supabase.from('live_session_participants').delete().eq('id', id);
  };
  const approveAll = async () => {
    const pending = participants.filter(p => p.status === 'pending');
    for (const p of pending) {
      await supabase.from('live_session_participants')
        .update({ status: 'approved', approved_at: new Date().toISOString() } as any).eq('id', p.id);
    }
    toast.success('All students approved!');
  };

  // --- PDF LOADING (Teacher) ---
  useEffect(() => {
    if (!isTeacher || !selectedMaterial?.file_url) return;
    const isPDF = selectedMaterial.file_type?.includes('pdf') || selectedMaterial.file_url?.endsWith('.pdf');
    if (!isPDF) return;
    pdfjsLib.getDocument({ url: selectedMaterial.file_url }).promise.then(doc => {
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1); setAnnotations([]);
    }).catch(err => console.error('PDF load error:', err));
  }, [selectedMaterial, isTeacher]);

  // --- PDF LOADING (Student) ---
  useEffect(() => {
    if (isTeacher || !remoteBoardState?.materialUrl) return;
    if (remoteBoardState.materialUrl === studentMaterialUrl) return;
    setStudentMaterialUrl(remoteBoardState.materialUrl);
    pdfjsLib.getDocument({ url: remoteBoardState.materialUrl }).promise.then(doc => {
      setStudentPdfDoc(doc);
      setTotalPages(remoteBoardState.totalPages);
    }).catch(err => console.error('Student PDF load error:', err));
  }, [isTeacher, remoteBoardState?.materialUrl, studentMaterialUrl]);

  // --- PDF RENDERING (Teacher) ---
  useEffect(() => {
    if (!isTeacher || !pdfDoc || !pdfCanvasRef.current) return;
    const render = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const scale = (zoom / 100) * 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = pdfCanvasRef.current!;
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      if (annotCanvasRef.current) {
        annotCanvasRef.current.width = viewport.width;
        annotCanvasRef.current.height = viewport.height;
        drawAnnotations(annotations);
      }
    };
    render();
  }, [pdfDoc, currentPage, zoom, isTeacher]);

  // --- PDF RENDERING (Student - synced) ---
  useEffect(() => {
    if (isTeacher || !studentPdfDoc || !pdfCanvasRef.current || !remoteBoardState) return;
    const render = async () => {
      const pageNum = remoteBoardState.currentPage;
      const zoomVal = remoteBoardState.zoom;
      const page = await studentPdfDoc.getPage(pageNum);
      const scale = (zoomVal / 100) * 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = pdfCanvasRef.current!;
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      if (annotCanvasRef.current) {
        annotCanvasRef.current.width = viewport.width;
        annotCanvasRef.current.height = viewport.height;
        drawAnnotations(remoteBoardState.annotations);
      }
      setCurrentPage(pageNum);
      setZoom(zoomVal);
    };
    render();
  }, [studentPdfDoc, remoteBoardState, isTeacher]);

  // --- Student: render live drawing strokes from teacher ---
  useEffect(() => {
    if (isTeacher || !remoteDrawStroke || !annotCanvasRef.current) return;
    const canvas = annotCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ann = remoteDrawStroke;
    if (ann.points.length < 2) return;
    ctx.beginPath();
    if (ann.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = ann.width * 5; }
    else if (ann.tool === 'highlighter') { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.35; ctx.lineWidth = ann.width * 6; }
    else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.lineWidth = ann.width; }
    ctx.strokeStyle = ann.tool === 'eraser' ? '#000' : ann.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.moveTo(ann.points[0].x, ann.points[0].y);
    ann.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }, [remoteDrawStroke, isTeacher]);

  // --- DRAW ANNOTATIONS ---
  const drawAnnotations = useCallback((anns: Annotation[]) => {
    const canvas = annotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    anns.forEach(ann => {
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
  }, []);

  useEffect(() => {
    if (isTeacher) drawAnnotations(annotations);
  }, [annotations, drawAnnotations, isTeacher]);

  // --- BROADCAST BOARD STATE (Teacher) ---
  const broadcastCurrentState = useCallback(() => {
    if (!isTeacher || !activeSession) return;
    broadcastBoardState({
      materialId: selectedMaterial?.id || null,
      materialUrl: selectedMaterial?.file_url || null,
      materialFileType: selectedMaterial?.file_type || null,
      materialTitle: selectedMaterial?.title || null,
      currentPage, totalPages, zoom, annotations,
    });
  }, [isTeacher, activeSession, selectedMaterial, currentPage, totalPages, zoom, annotations, broadcastBoardState]);

  useEffect(() => { broadcastCurrentState(); }, [annotations, currentPage, zoom, selectedMaterial, broadcastCurrentState]);

  // --- CURSOR TRACKING ---
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTeacher || !annotCanvasRef.current) return;
    const rect = annotCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    broadcastCursor({ x, y, visible: true });
  }, [isTeacher, broadcastCursor]);

  const handleMouseLeave = useCallback(() => {
    if (isTeacher) broadcastCursor({ x: 0, y: 0, visible: false });
  }, [isTeacher, broadcastCursor]);

  // --- DRAWING (Teacher only) ---
  const getPos = (e: React.MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const startDraw = (e: React.MouseEvent) => {
    if (tool === 'pointer' || !isTeacher || !annotCanvasRef.current) return;
    const pos = getPos(e, annotCanvasRef.current);
    const ann: Annotation = { id: crypto.randomUUID(), tool: tool as Annotation['tool'], points: [pos], color, width: lineWidth };
    setCurrentAnnotation(ann);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent) => {
    handleMouseMove(e);
    if (!isDrawing || !currentAnnotation || !annotCanvasRef.current) return;
    const pos = getPos(e, annotCanvasRef.current);
    const updated = { ...currentAnnotation, points: [...currentAnnotation.points, pos] };
    setCurrentAnnotation(updated);
    // Live-broadcast the in-progress stroke to students
    broadcastDrawStroke(updated);
    // Draw locally
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
    broadcastClearCanvas();
    if (annotCanvasRef.current) {
      annotCanvasRef.current.getContext('2d')!.clearRect(0, 0, annotCanvasRef.current.width, annotCanvasRef.current.height);
    }
  };

  const changePage = (p: number) => { setCurrentPage(p); setAnnotations([]); };

  // --- RENDER ---
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-white/50 text-sm">Loading live class...</p>
      </div>
    </div>
  );

  const hasPDF = isTeacher ? !!pdfDoc : !!studentPdfDoc;
  const pendingCount = participants.filter(p => p.status === 'pending').length;
  const approvedCount = participants.filter(p => p.status === 'approved').length;

  // === SMART BOARD VIEW ===
  if (smartBoardOpen && activeSession && (isTeacher || joinStatus === 'approved')) {
    return (
      <div className={cn('fixed z-50 bg-slate-950 flex flex-col', fullscreen ? 'inset-0' : 'inset-0 md:inset-3 md:rounded-2xl md:overflow-hidden md:shadow-2xl md:shadow-black/50')}>
        {/* HEADER BAR */}
        <div className="flex items-center justify-between px-3 md:px-5 py-2.5 bg-slate-900/95 backdrop-blur border-b border-white/10 flex-shrink-0">
          {/* Left: Live badge + title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 rounded-full px-3 py-1 flex-shrink-0">
              <Radio className="w-3 h-3 text-red-500 animate-pulse" />
              <span className="text-red-400 text-[11px] font-bold tracking-wide">LIVE</span>
            </div>
            <span className="text-white font-medium text-sm hidden md:block truncate max-w-[250px]">
              {isTeacher ? (selectedMaterial?.title || activeSession.title) : (remoteBoardState?.materialTitle || activeSession.title)}
            </span>
            {isTeacher && joinCode && (
              <button onClick={() => { navigator.clipboard.writeText(joinCode); toast.success('Code copied!'); }}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 text-xs font-mono border border-white/10 transition-colors">
                <Copy className="w-3 h-3" /> {joinCode}
              </button>
            )}
          </div>

          {/* Center: Page navigation */}
          {hasPDF && (
            <div className="flex items-center gap-1 bg-white/5 rounded-lg px-1 py-0.5 border border-white/10">
              <button onClick={() => isTeacher && changePage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1 || !isTeacher}
                className="p-1.5 rounded-md text-white/70 hover:bg-white/10 disabled:opacity-20 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-white text-xs font-medium px-2 tabular-nums">{currentPage} / {totalPages}</span>
              <button onClick={() => isTeacher && changePage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages || !isTeacher}
                className="p-1.5 rounded-md text-white/70 hover:bg-white/10 disabled:opacity-20 transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setShowParticipants(!showParticipants)}
              className={cn('relative p-2 rounded-lg transition-colors', showParticipants ? 'bg-primary/20 text-primary' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
              <Users className="w-4 h-4" />
              {pendingCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-[9px] text-white font-bold flex items-center justify-center animate-pulse">{pendingCount}</span>}
            </button>
            {isTeacher && (
              <button onClick={() => setShowMaterialPicker(true)} className="p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors" title="Select Material">
                <FileText className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setShowChat(!showChat)}
              className={cn('p-2 rounded-lg transition-colors', showChat ? 'bg-primary/20 text-primary' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
              <MessageSquare className="w-4 h-4" />
            </button>
            {isTeacher && (
              <>
                <div className="w-px h-5 bg-white/10 mx-0.5" />
                <button onClick={() => setZoom(z => Math.min(200, z + 20))} className="p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"><ZoomIn className="w-4 h-4" /></button>
                <button onClick={() => setZoom(z => Math.max(50, z - 20))} className="p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"><ZoomOut className="w-4 h-4" /></button>
              </>
            )}
            <button onClick={() => setFullscreen(!fullscreen)} className="p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors">
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {isTeacher && (
              <button onClick={endClass} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 text-xs font-semibold ml-1 border border-red-500/20 transition-colors">
                <StopCircle className="w-3.5 h-3.5" /> End
              </button>
            )}
            <button onClick={() => { stopMedia(); setSmartBoardOpen(false); }} className="p-2 rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors ml-0.5">✕</button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* Annotation Toolbar (Teacher only) */}
          {isTeacher && (
            <div className="flex flex-col items-center gap-1.5 p-2 bg-slate-900/80 backdrop-blur border-r border-white/10 w-14 flex-shrink-0">
              <p className="text-[9px] text-white/30 font-bold uppercase tracking-wider mb-1">Tools</p>
              {([
                { t: 'pointer' as Tool, icon: MousePointer, label: 'Select' },
                { t: 'pen' as Tool, icon: Pen, label: 'Pen' },
                { t: 'highlighter' as Tool, icon: Highlighter, label: 'Highlight' },
                { t: 'eraser' as Tool, icon: Eraser, label: 'Eraser' },
              ]).map(({ t, icon: Icon, label }) => (
                <button key={t} onClick={() => setTool(t)} title={label}
                  className={cn('p-2 rounded-lg transition-all w-10 h-10 flex items-center justify-center',
                    tool === t ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-white/50 hover:bg-white/10 hover:text-white')}>
                  <Icon className="w-4 h-4" />
                </button>
              ))}
              <div className="w-8 h-px bg-white/10 my-1" />
              <p className="text-[9px] text-white/30 font-bold uppercase tracking-wider mb-1">Color</p>
              <div className="flex flex-col gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => { setColor(c); if (tool === 'pointer' || tool === 'eraser') setTool('pen'); }}
                    className={cn('w-6 h-6 rounded-full border-2 transition-all hover:scale-110 mx-auto',
                      color === c && tool !== 'eraser' ? 'border-white scale-110' : 'border-transparent')}
                    style={{ background: c }} />
                ))}
              </div>
              <div className="w-8 h-px bg-white/10 my-1" />
              <button onClick={clearCanvas} title="Clear All"
                className="p-2 rounded-lg text-red-400/70 hover:bg-red-500/20 hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* PDF Canvas Area */}
          <div ref={boardContainerRef} className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 relative">
            {hasPDF ? (
              <div className="relative inline-block">
                <canvas ref={pdfCanvasRef} className="max-w-full shadow-2xl shadow-black/50" style={{ display: 'block' }} />
                <canvas
                  ref={annotCanvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    cursor: !isTeacher ? 'default' : tool === 'pointer' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
                    pointerEvents: !isTeacher ? 'none' : 'auto',
                  }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={() => { stopDraw(); handleMouseLeave(); }}
                />
                {/* Teacher cursor overlay (for students) */}
                {!isTeacher && remoteCursor?.visible && (
                  <div
                    className="absolute pointer-events-none z-10"
                    style={{
                      left: `${remoteCursor.x * 100}%`,
                      top: `${remoteCursor.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      transition: 'left 50ms linear, top 50ms linear',
                    }}
                  >
                    <div className="w-6 h-6 rounded-full bg-red-500/50 border-2 border-red-400 animate-pulse" />
                    <span className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] text-red-300 whitespace-nowrap bg-black/80 rounded-full px-2 py-0.5 font-medium">
                      Teacher
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-white/40 p-12">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-10 h-10 opacity-40" />
                </div>
                <p className="text-lg font-medium mb-2">
                  {isTeacher ? 'No material selected' : 'Waiting for teacher to share material...'}
                </p>
                <p className="text-sm text-white/25 mb-6">
                  {isTeacher ? 'Select a PDF material to start the smart board' : 'The teacher\'s board will appear here in real-time'}
                </p>
                {isTeacher && (
                  <button onClick={() => setShowMaterialPicker(true)}
                    className="px-6 py-3 bg-primary rounded-xl text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                    Select Material
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Side panels */}
          {showParticipants && (
            <ParticipantsPanel
              participants={participants}
              joinCode={joinCode}
              isTeacher={isTeacher}
              onApprove={approveParticipant}
              onReject={rejectParticipant}
              onApproveAll={approveAll}
              onClose={() => setShowParticipants(false)}
            />
          )}
          {showChat && (
            <LiveChatPanel
              messages={chatMessages}
              onSend={sendChatMessage}
              userId={user?.user_id || ''}
              userName={user?.full_name || 'User'}
              onClose={() => setShowChat(false)}
            />
          )}
        </div>

        {/* Media Controls */}
        <MediaControls
          localStream={localStream}
          remoteStreams={remoteStreams}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          isScreenSharing={isScreenSharing}
          mediaStarted={mediaStarted}
          isTeacher={isTeacher}
          onStartMedia={startMedia}
          onStopMedia={stopMedia}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onStartScreenShare={startScreenShare}
          onStopScreenShare={stopScreenShare}
        />

        {/* Material Picker Modal */}
        {showMaterialPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 rounded-2xl shadow-2xl border border-white/10 w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <h3 className="font-bold text-white">Select Material</h3>
                <button onClick={() => setShowMaterialPicker(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">✕</button>
              </div>
              <div className="p-4 space-y-2 overflow-y-auto flex-1">
                {materials.filter(m => m.file_url).map(m => (
                  <button key={m.id} onClick={() => { setSelectedMaterial(m); setShowMaterialPicker(false); }}
                    className={cn('w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all',
                      selectedMaterial?.id === m.id ? 'border-primary bg-primary/10 text-white' : 'border-white/10 bg-white/5 text-white/80 hover:border-primary/40 hover:bg-white/10')}>
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.title}</p>
                      <p className="text-xs text-white/40 capitalize">{m.type?.replace('_', ' ')}</p>
                    </div>
                    {selectedMaterial?.id === m.id && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                  </button>
                ))}
                {materials.filter(m => m.file_url).length === 0 && (
                  <div className="text-center py-12 text-white/30">
                    <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No materials with files uploaded yet</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // === STUDENT WAITING ===
  if (activeSession && isStudent && joinStatus === 'pending') {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Live Class</h1></div>
        <div className="bg-card rounded-2xl border border-border shadow-card p-10 text-center max-w-md mx-auto">
          <div className="w-20 h-20 rounded-2xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold mb-3">Waiting for Approval</h2>
          <p className="text-muted-foreground text-sm">Your join request has been sent. Please wait for the teacher to approve you.</p>
          <div className="mt-8 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0.15s' }} />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
        </div>
      </div>
    );
  }

  // === MAIN LOBBY ===
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Live Class</h1>
        <p className="text-muted-foreground text-sm mt-1">{isTeacher ? 'Start a live teaching session with smart board' : 'Join an active live class'}</p>
      </div>

      {isTeacher ? (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl shadow-blue-900/20">
            <div className="flex items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0">
                <PlayCircle className="w-8 h-8" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Smart Board Teaching</h2>
                  <p className="text-blue-200 text-sm mt-1">PDF annotations, live sync, audio/video & student management</p>
                </div>
                <input value={sessionTitle} onChange={e => setSessionTitle(e.target.value)}
                  placeholder="Session title (e.g. Math - Chapter 5)"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm" />
                <div className="flex gap-3 flex-wrap">
                  <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                    className="flex-1 min-w-[150px] px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none [&>option]:text-black">
                    <option value="">All classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={startClass} disabled={starting || !sessionTitle.trim()}
                    className="px-8 py-3 rounded-xl bg-white text-blue-600 font-bold text-sm hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg">
                    {starting ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    {starting ? 'Starting...' : 'Start Live Class'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border shadow-card p-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> External Meeting Link (Optional)
            </h3>
            <p className="text-muted-foreground text-sm mb-3">
              Provide a Google Meet, Zoom, or Teams link for students to join alongside the smart board.
            </p>
            <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/... or https://zoom.us/..."
              className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {activeSession ? (
            <div className="bg-card rounded-2xl border border-border shadow-card p-6">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800/40 mb-5">
                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-300">{activeSession.title}</p>
                  <p className="text-emerald-600 dark:text-emerald-400 text-sm">Live class in progress</p>
                </div>
              </div>
              {activeSession.meeting_link && (
                <a href={activeSession.meeting_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400 font-semibold mb-3 hover:opacity-90 border border-blue-200 dark:border-blue-800/40 transition-opacity">
                  <VideoIcon className="w-5 h-5" /> Join External Meeting
                </a>
              )}
              {joinStatus === 'approved' ? (
                <button onClick={() => setSmartBoardOpen(true)}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                  <PlayCircle className="w-5 h-5" /> Enter Smart Board
                </button>
              ) : !joinStatus ? (
                <button onClick={requestToJoin}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
                  <Users className="w-5 h-5" /> Request to Join
                </button>
              ) : null}
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border shadow-card p-10 text-center">
              <PlayCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-20" />
              <p className="text-muted-foreground mb-2">No live class active right now</p>
              <p className="text-muted-foreground text-sm">Use a join code below or wait for a notification</p>
            </div>
          )}
          <div className="bg-card rounded-2xl border border-border shadow-card p-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-primary" /> Join with Code
            </h3>
            <div className="flex gap-3">
              <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter join code (e.g. ABC123)" maxLength={6}
                className="flex-1 px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono tracking-wider uppercase" />
              <button onClick={joinByCode} disabled={!joinCodeInput.trim()}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
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
