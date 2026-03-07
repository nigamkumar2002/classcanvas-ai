import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayCircle, StopCircle, Users, ChevronLeft, ChevronRight, Pen, Eraser, MousePointer, Trash2,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Highlighter, MessageSquare, FileText, Copy, Check,
  Clock, Link as LinkIcon, ExternalLink, Video as VideoIcon
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
const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#000000'];

interface Annotation extends SerializedAnnotation {}
interface MaterialItem { id: string; title: string; file_url?: string; file_type?: string; type: string; }
interface Participant { id: string; session_id: string; user_id: string; status: string; joined_at: string; approved_at: string | null; profile_name?: string; }

const LiveClassPage = () => {
  const { user } = useAuth();
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotCanvasRef = useRef<HTMLCanvasElement>(null);
  const cursorOverlayRef = useRef<HTMLDivElement>(null);
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

  // Student PDF state (for rendering teacher's board)
  const [studentPdfDoc, setStudentPdfDoc] = useState<any>(null);
  const [studentMaterialUrl, setStudentMaterialUrl] = useState<string | null>(null);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';
  const isStudent = user?.role === 'student';

  // Realtime sync
  const {
    remoteBoardState, remoteCursor, chatMessages,
    broadcastBoardState, broadcastCursor, sendChatMessage,
  } = useRealtimeSync(activeSession?.id || null, isTeacher);

  // WebRTC
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

  // URL join code
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

    // Also listen for student's own approval
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
      // Notify students
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

  // --- PDF LOADING (Student - from remote board state) ---
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

  // --- PDF RENDERING (Student - synced from teacher) ---
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

  // Broadcast on annotation/page/material changes
  useEffect(() => { broadcastCurrentState(); }, [annotations, currentPage, zoom, selectedMaterial, broadcastCurrentState]);

  // --- CURSOR TRACKING (Teacher broadcasts cursor) ---
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isTeacher || !annotCanvasRef.current) return;
    const rect = annotCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    broadcastCursor({
      x, y, visible: true,
      canvasWidth: annotCanvasRef.current.width,
      canvasHeight: annotCanvasRef.current.height,
    });
  }, [isTeacher, broadcastCursor]);

  const handleMouseLeave = useCallback(() => {
    if (isTeacher) broadcastCursor({ x: 0, y: 0, visible: false, canvasWidth: 0, canvasHeight: 0 });
  }, [isTeacher, broadcastCursor]);

  // --- DRAWING (Teacher only) ---
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
    handleMouseMove(e); // Always track cursor
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
      annotCanvasRef.current.getContext('2d')!.clearRect(0, 0, annotCanvasRef.current.width, annotCanvasRef.current.height);
    }
  };

  const changePage = (p: number) => { setCurrentPage(p); setAnnotations([]); };

  // --- RENDER ---
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // === SMART BOARD VIEW ===
  const hasPDF = isTeacher ? !!pdfDoc : !!studentPdfDoc;
  const pendingCount = participants.filter(p => p.status === 'pending').length;
  const approvedCount = participants.filter(p => p.status === 'approved').length;

  if (smartBoardOpen && activeSession && (isTeacher || joinStatus === 'approved')) {
    return (
      <div className={cn('fixed z-50 bg-slate-950 flex flex-col', fullscreen ? 'inset-0' : 'inset-2 rounded-2xl overflow-hidden')}>
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 text-xs font-bold">LIVE</span>
            </div>
            <span className="text-white font-semibold text-sm hidden sm:block truncate max-w-[200px]">
              {isTeacher ? (selectedMaterial?.title || activeSession.title) : (remoteBoardState?.materialTitle || activeSession.title)}
            </span>
            {isTeacher && joinCode && (
              <button onClick={() => { navigator.clipboard.writeText(joinCode); toast.success('Code copied!'); }}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 text-xs font-mono">
                <Copy className="w-3 h-3" /> {joinCode}
              </button>
            )}
          </div>

          {hasPDF && (
            <div className="flex items-center gap-2">
              <button onClick={() => isTeacher && changePage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1 || !isTeacher}
                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-white text-sm font-medium px-2">{currentPage}/{totalPages}</span>
              <button onClick={() => isTeacher && changePage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages || !isTeacher}
                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => setShowParticipants(!showParticipants)}
              className={cn('relative p-1.5 rounded-lg transition-colors', showParticipants ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20')}>
              <Users className="w-4 h-4" />
              {pendingCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-[10px] text-white font-bold flex items-center justify-center">{pendingCount}</span>}
            </button>
            {isTeacher && (
              <button onClick={() => setShowMaterialPicker(true)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20" title="Select Material">
                <FileText className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => setShowChat(!showChat)}
              className={cn('p-1.5 rounded-lg transition-colors', showChat ? 'bg-primary text-white' : 'bg-white/10 text-white hover:bg-white/20')}>
              <MessageSquare className="w-4 h-4" />
            </button>
            {isTeacher && (
              <>
                <button onClick={() => setZoom(z => Math.min(200, z + 20))} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"><ZoomIn className="w-4 h-4" /></button>
                <button onClick={() => setZoom(z => Math.max(50, z - 20))} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20"><ZoomOut className="w-4 h-4" /></button>
              </>
            )}
            <button onClick={() => setFullscreen(!fullscreen)} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20">
              {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {isTeacher && (
              <button onClick={endClass} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs font-semibold">
                <StopCircle className="w-3.5 h-3.5" /> End
              </button>
            )}
            <button onClick={() => { stopMedia(); setSmartBoardOpen(false); }} className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20">✕</button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* Annotation Toolbar (Teacher only) */}
          {isTeacher && (
            <div className="flex flex-col items-center gap-2 p-2 bg-slate-800 border-r border-white/10 w-12 flex-shrink-0">
              {([
                { t: 'pointer' as Tool, icon: MousePointer },
                { t: 'pen' as Tool, icon: Pen },
                { t: 'highlighter' as Tool, icon: Highlighter },
                { t: 'eraser' as Tool, icon: Eraser },
              ]).map(({ t, icon: Icon }) => (
                <button key={t} onClick={() => setTool(t)}
                  className={cn('p-2 rounded-lg transition-all', tool === t ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20')}>
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
              <div className="w-full h-px bg-white/10 my-1" />
              {COLORS.map(c => (
                <button key={c} onClick={() => { setColor(c); setTool('pen'); }}
                  className={cn('w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 flex-shrink-0',
                    color === c && tool !== 'eraser' ? 'border-white' : 'border-transparent')}
                  style={{ background: c }} />
              ))}
              <div className="w-full h-px bg-white/10 my-1" />
              <button onClick={clearCanvas} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* PDF Canvas Area */}
          <div ref={boardContainerRef} className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 relative">
            {hasPDF ? (
              <div className="relative inline-block">
                <canvas ref={pdfCanvasRef} className="max-w-full shadow-xl" style={{ display: 'block' }} />
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
                  onMouseLeave={(e) => { stopDraw(); handleMouseLeave(); }}
                />
                {/* Teacher cursor overlay (for students) */}
                {!isTeacher && remoteCursor?.visible && (
                  <div
                    className="absolute pointer-events-none z-10 transition-all duration-75"
                    style={{
                      left: `${remoteCursor.x * 100}%`,
                      top: `${remoteCursor.y * 100}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <div className="w-5 h-5 rounded-full bg-red-500/60 border-2 border-red-400 animate-pulse" />
                    <span className="absolute top-5 left-1/2 -translate-x-1/2 text-[9px] text-red-300 whitespace-nowrap bg-black/60 rounded px-1">
                      Teacher
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-white/50 p-8">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">
                  {isTeacher ? 'No material selected' : 'Waiting for teacher to share material...'}
                </p>
                {isTeacher && (
                  <button onClick={() => setShowMaterialPicker(true)}
                    className="px-4 py-2 bg-primary rounded-xl text-white text-sm font-medium hover:opacity-90">
                    Select Material
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Side panels */}
          {showParticipants && isTeacher && (
            <ParticipantsPanel
              participants={participants}
              joinCode={joinCode}
              onApprove={approveParticipant}
              onReject={rejectParticipant}
              onApproveAll={approveAll}
            />
          )}
          {showChat && (
            <LiveChatPanel
              messages={chatMessages}
              onSend={sendChatMessage}
              userId={user?.user_id || ''}
              userName={user?.full_name || 'User'}
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

  // === STUDENT WAITING ===
  if (activeSession && isStudent && joinStatus === 'pending') {
    return (
      <div className="space-y-6">
        <div><h1 className="text-2xl font-bold">Live Class</h1></div>
        <div className="bg-card rounded-2xl border border-border shadow-card p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">Waiting for Approval</h2>
          <p className="text-muted-foreground">Your join request has been sent. Please wait for the teacher to approve you.</p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0.1s' }} />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      </div>
    );
  }

  // === MAIN LOBBY ===
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live Class</h1>
        <p className="text-muted-foreground text-sm mt-1">{isTeacher ? 'Start a live teaching session' : 'Join an active class'}</p>
      </div>

      {isTeacher ? (
        <div className="space-y-6">
          {/* Start class card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <PlayCircle className="w-10 h-10" />
              </div>
              <div className="flex-1 space-y-3">
                <h2 className="text-2xl font-bold">Smart Board Teaching</h2>
                <p className="text-blue-200">PDF annotations, live sync, audio/video & student management</p>
                <input value={sessionTitle} onChange={e => setSessionTitle(e.target.value)}
                  placeholder="Session title (e.g. Math - Chapter 5)"
                  className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 text-sm" />
                <div className="flex gap-3 flex-wrap">
                  <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                    className="flex-1 min-w-[150px] px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:outline-none [&>option]:text-black">
                    <option value="">All classes</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={startClass} disabled={starting || !sessionTitle.trim()}
                    className="px-6 py-2.5 rounded-xl bg-white text-blue-600 font-bold text-sm hover:bg-blue-50 transition-all disabled:opacity-50 flex items-center gap-2">
                    {starting ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    {starting ? 'Starting...' : 'Start Live Class'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* External meeting link option */}
          <div className="bg-card rounded-2xl border border-border shadow-card p-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-primary" /> External Meeting Link (Optional)
            </h3>
            <p className="text-muted-foreground text-sm mb-3">
              Optionally provide a Google Meet, Zoom, or Teams link for students to join alongside the smart board.
            </p>
            <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/... or https://zoom.us/..."
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {activeSession ? (
            <div className="bg-card rounded-2xl border border-border shadow-card p-6">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 mb-4">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300">{activeSession.title}</p>
                  <p className="text-green-600 dark:text-green-400 text-sm">Live class in progress</p>
                </div>
              </div>

              {/* External meeting link */}
              {activeSession.meeting_link && (
                <a href={activeSession.meeting_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold mb-3 hover:opacity-90 border border-blue-200 dark:border-blue-800">
                  <VideoIcon className="w-5 h-5" /> Join External Meeting
                </a>
              )}

              {joinStatus === 'approved' ? (
                <button onClick={() => setSmartBoardOpen(true)}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 flex items-center justify-center gap-2">
                  <PlayCircle className="w-5 h-5" /> Enter Smart Board
                </button>
              ) : !joinStatus ? (
                <button onClick={requestToJoin}
                  className="w-full py-3 rounded-xl bg-green-600 text-white font-semibold hover:opacity-90 flex items-center justify-center gap-2">
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

          {/* Join by code */}
          <div className="bg-card rounded-2xl border border-border shadow-card p-6">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-primary" /> Join with Code
            </h3>
            <div className="flex gap-3">
              <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Enter join code (e.g. ABC123)" maxLength={6}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono tracking-wider uppercase" />
              <button onClick={joinByCode} disabled={!joinCodeInput.trim()}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50">
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
