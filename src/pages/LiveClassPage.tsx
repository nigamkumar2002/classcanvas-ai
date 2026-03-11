import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayCircle, StopCircle, Users, ChevronLeft, ChevronRight, Pen, Eraser, MousePointer, Trash2,
  Maximize2, Minimize2, ZoomIn, ZoomOut, Highlighter, MessageSquare, FileText, Copy, Check,
  Clock, Link as LinkIcon, ExternalLink, Video as VideoIcon, Radio,
  Circle, Square, Minus, ArrowRight, Type, Undo2, Redo2, Move, Crosshair,
  Palette, SlidersHorizontal, BarChart3, Timer, Stamp, Star, ThumbsUp, ThumbsDown, Hand,
  Smile, Sparkles, Target, Eye, EyeOff, X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import * as pdfjsLib from 'pdfjs-dist';
import { useRealtimeSync, type BoardState, type SerializedAnnotation, type CursorState, type PollData, type ReactionData, type TimerData, type StampData } from '@/components/live-class/useRealtimeSync';
import { useWebRTC } from '@/components/live-class/useWebRTC';
import MediaControls from '@/components/live-class/MediaControls';
import LiveChatPanel from '@/components/live-class/LiveChatPanel';
import ParticipantsPanel from '@/components/live-class/ParticipantsPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

type Tool = 'pointer' | 'pen' | 'eraser' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'text' | 'laser';
const COLORS = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF', '#000000'];
const WIDTHS = [1, 2, 3, 5, 8, 12];

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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showWidthPicker, setShowWidthPicker] = useState(false);

  // Undo/Redo
  const [undoStack, setUndoStack] = useState<Annotation[][]>([]);
  const [redoStack, setRedoStack] = useState<Annotation[][]>([]);

  // Text tool
  const [textInput, setTextInput] = useState('');
  const [textPos, setTextPos] = useState<{x: number; y: number} | null>(null);

  // Laser pointer
  const [laserPos, setLaserPos] = useState<{x: number; y: number} | null>(null);
  const laserTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Track what the student last rendered to avoid unnecessary PDF re-renders
  const studentLastRenderRef = useRef<{ url: string | null; page: number; zoom: number }>({ url: null, page: 0, zoom: 0 });
  // Store student annotations separately to avoid race conditions
  const studentAnnotationsRef = useRef<Annotation[]>([]);

  // Poll state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [activePoll, setActivePoll] = useState<{question: string; options: string[]; votes: Record<string, string>; id: string} | null>(null);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [myVote, setMyVote] = useState<string | null>(null);

  // Timer state
  const [showTimer, setShowTimer] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDuration, setTimerDuration] = useState(300);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Spotlight / stamp state
  const [spotlight, setSpotlight] = useState<{x: number; y: number} | null>(null);
  const [stamps, setStamps] = useState<{id: string; emoji: string; x: number; y: number}[]>([]);

  // Reactions
  const [reactions, setReactions] = useState<{id: string; emoji: string; time: number}[]>([]);

  const isTeacher = user?.role === 'teacher' || user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'developer';
  const isStudent = user?.role === 'student';

  const {
    remoteBoardState, remoteCursor, remoteDrawStroke, chatMessages,
    remotePoll, remoteReaction, remoteTimer, remoteStamp,
    broadcastBoardState, requestBoardState, broadcastCursor, broadcastDrawStroke, broadcastClearCanvas, sendChatMessage,
    broadcastPoll, broadcastPollVote, broadcastReaction, broadcastTimer, broadcastStamp,
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
            if (p) {
              setJoinStatus((p as any).status);
              if ((p as any).status === 'approved') setSmartBoardOpen(true);
            }
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
            setSmartBoardOpen(true);
            toast.success('You have been approved! Entering class...');
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

  // Ask teacher for immediate board snapshot when a student joins
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
    setAnnotations([]); setUndoStack([]); setRedoStack([]);
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
      setPdfDoc(doc); setTotalPages(doc.numPages); setCurrentPage(1);
      setAnnotations([]); setUndoStack([]); setRedoStack([]);
    }).catch(err => console.error('PDF load error:', err));
  }, [selectedMaterial, isTeacher]);

  // --- PDF LOADING (Student) - only load doc when URL changes ---
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
      const viewport = page.getViewport({ scale, rotation: 0 });
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

  // *** FIX: Student PDF rendering - ONLY re-render PDF when page/zoom/material change ***
  // This is the key fix: decouple PDF rendering from annotation updates
  useEffect(() => {
    if (isTeacher || !studentPdfDoc || !pdfCanvasRef.current || !remoteBoardState) return;
    const pageNum = remoteBoardState.currentPage;
    const zoomVal = remoteBoardState.zoom;
    const matUrl = remoteBoardState.materialUrl;

    // Check if we actually need to re-render the PDF (page/zoom/material changed)
    const last = studentLastRenderRef.current;
    if (last.url === matUrl && last.page === pageNum && last.zoom === zoomVal) {
      // Only annotations changed - just redraw annotation canvas without touching PDF
      if (annotCanvasRef.current) {
        drawAnnotations(remoteBoardState.annotations);
        studentAnnotationsRef.current = remoteBoardState.annotations;
      }
      return;
    }

    // PDF page/zoom/material changed - full re-render
    const render = async () => {
      try {
        const page = await studentPdfDoc.getPage(pageNum);
        const scale = (zoomVal / 100) * 1.5;
        const viewport = page.getViewport({ scale, rotation: 0 });
        const canvas = pdfCanvasRef.current!;
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        if (annotCanvasRef.current) {
          annotCanvasRef.current.width = viewport.width;
          annotCanvasRef.current.height = viewport.height;
          drawAnnotations(remoteBoardState.annotations);
          studentAnnotationsRef.current = remoteBoardState.annotations;
        }
        studentLastRenderRef.current = { url: matUrl, page: pageNum, zoom: zoomVal };
        setCurrentPage(pageNum);
        setZoom(zoomVal);
      } catch (err) {
        console.error('Student render error:', err);
      }
    };
    render();
  }, [studentPdfDoc, remoteBoardState?.currentPage, remoteBoardState?.zoom, remoteBoardState?.materialUrl, remoteBoardState?.annotations, isTeacher]);

  // *** FIX: Student incremental stroke rendering - no conflict with full redraws ***
  useEffect(() => {
    if (isTeacher || !remoteDrawStroke || !annotCanvasRef.current) return;
    const canvas = annotCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) return;
    const ann = remoteDrawStroke;
    if (ann.points.length < 2) return;

    ctx.save();
    ctx.beginPath();
    if (ann.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = ann.width * 5;
    } else if (ann.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = ann.width * 6;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.lineWidth = ann.width;
    }
    ctx.strokeStyle = ann.tool === 'eraser' ? '#000' : ann.color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.moveTo(ann.points[0].x, ann.points[0].y);
    ann.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }, [remoteDrawStroke, isTeacher]);

  // --- DRAW ANNOTATIONS (used for full redraw) ---
  const drawAnnotations = useCallback((anns: Annotation[]) => {
    const canvas = annotCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    anns.forEach(ann => {
      if (ann.points.length < 2) return;
      ctx.save();
      ctx.beginPath();
      if (ann.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = ann.width * 5;
      } else if (ann.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = ann.width * 6;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.lineWidth = ann.width;
      }
      ctx.strokeStyle = ann.tool === 'eraser' ? '#000' : ann.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ann.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    });
  }, []);

  useEffect(() => {
    if (isTeacher) drawAnnotations(annotations);
  }, [annotations, drawAnnotations, isTeacher]);

  // --- BROADCAST BOARD STATE (Teacher) - debounced to reduce noise ---
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const broadcastCurrentState = useCallback(() => {
    if (!isTeacher || !activeSession) return;
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = setTimeout(() => {
      broadcastBoardState({
        materialId: selectedMaterial?.id || null,
        materialUrl: selectedMaterial?.file_url || null,
        materialFileType: selectedMaterial?.file_type || null,
        materialTitle: selectedMaterial?.title || null,
        currentPage, totalPages, zoom, annotations,
      });
    }, 100); // Small debounce to batch rapid changes
  }, [isTeacher, activeSession, selectedMaterial, currentPage, totalPages, zoom, annotations, broadcastBoardState]);

  useEffect(() => { broadcastCurrentState(); }, [annotations, currentPage, zoom, selectedMaterial, broadcastCurrentState]);

  // --- CURSOR & LASER TRACKING ---
  const lastCursorBroadcastRef = useRef(0);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isTeacher || !annotCanvasRef.current) return;
    const now = performance.now();
    if (now - lastCursorBroadcastRef.current < 16) return;
    lastCursorBroadcastRef.current = now;
    const rect = annotCanvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    broadcastCursor({ x, y, visible: true });

    if (tool === 'laser') {
      setLaserPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      if (laserTimeoutRef.current) clearTimeout(laserTimeoutRef.current);
      laserTimeoutRef.current = setTimeout(() => setLaserPos(null), 3000);
    }
  }, [isTeacher, broadcastCursor, tool]);

  const handlePointerLeave = useCallback(() => {
    if (isTeacher) broadcastCursor({ x: 0, y: 0, visible: false });
    setLaserPos(null);
  }, [isTeacher, broadcastCursor]);

  // --- DRAWING (Teacher only) ---
  const getPos = (e: React.PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const startDraw = (e: React.PointerEvent) => {
    if (!isTeacher || !annotCanvasRef.current) return;

    if (tool === 'pointer' || tool === 'laser') return;

    // Text tool: place text input
    if (tool === 'text') {
      const rect = annotCanvasRef.current.getBoundingClientRect();
      setTextPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      return;
    }

    e.preventDefault();
    const pos = getPos(e, annotCanvasRef.current);
    const toolType = (['line', 'arrow', 'rectangle', 'circle'].includes(tool) ? tool : tool) as Annotation['tool'];
    const ann: Annotation = { id: crypto.randomUUID(), tool: toolType, points: [pos], color, width: lineWidth };
    setCurrentAnnotation(ann);
    setIsDrawing(true);
  };

  const draw = (e: React.PointerEvent) => {
    handlePointerMove(e);
    if (!isDrawing || !currentAnnotation || !annotCanvasRef.current) return;

    const pos = getPos(e, annotCanvasRef.current);

    // For shape tools, keep only start and end points
    if (['line', 'arrow', 'rectangle', 'circle'].includes(currentAnnotation.tool)) {
      const updated = { ...currentAnnotation, points: [currentAnnotation.points[0], pos] };
      setCurrentAnnotation(updated);

      // Redraw all annotations + current shape preview
      drawAnnotations(annotations);
      const ctx = annotCanvasRef.current.getContext('2d')!;
      drawShape(ctx, updated);

      // Broadcast shape as 2-point annotation
      broadcastDrawStroke(updated);
      return;
    }

    // Freehand tools (pen, highlighter, eraser)
    const updated = { ...currentAnnotation, points: [...currentAnnotation.points, pos] };
    setCurrentAnnotation(updated);

    const pts = updated.points;
    if (pts.length >= 2) {
      broadcastDrawStroke({ ...updated, points: pts.slice(-2) });

      const ctx = annotCanvasRef.current.getContext('2d')!;
      ctx.save();
      ctx.beginPath();
      if (updated.tool === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineWidth = updated.width * 6; }
      else if (updated.tool === 'eraser') { ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = updated.width * 5; }
      else { ctx.globalAlpha = 1; ctx.lineWidth = updated.width; }
      ctx.strokeStyle = updated.tool === 'eraser' ? '#000' : updated.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawShape = (ctx: CanvasRenderingContext2D, ann: Annotation) => {
    if (ann.points.length < 2) return;
    const [start, end] = [ann.points[0], ann.points[ann.points.length - 1]];
    ctx.save();
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.width;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (ann.tool === 'line') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    } else if (ann.tool === 'arrow') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      // Arrowhead
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLen = 15;
      ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
    } else if (ann.tool === 'rectangle') {
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (ann.tool === 'circle') {
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  };

  // Override drawAnnotations to handle shapes
  const drawAnnotationsWithShapes = useCallback((anns: Annotation[]) => {
    const canvas = annotCanvasRef.current;
    if (!canvas || canvas.width === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    anns.forEach(ann => {
      if (ann.points.length < 2) return;
      if (['line', 'arrow', 'rectangle', 'circle'].includes(ann.tool)) {
        drawShape(ctx, ann);
        return;
      }
      ctx.save();
      ctx.beginPath();
      if (ann.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = ann.width * 5;
      } else if (ann.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = ann.width * 6;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.lineWidth = ann.width;
      }
      ctx.strokeStyle = ann.tool === 'eraser' ? '#000' : ann.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      ann.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    });
  }, []);

  // Replace the original drawAnnotations with shape-aware version
  useEffect(() => {
    if (isTeacher) drawAnnotationsWithShapes(annotations);
  }, [annotations, drawAnnotationsWithShapes, isTeacher]);

  const stopDraw = () => {
    if (!isDrawing || !currentAnnotation) return;
    // Push undo state
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(prev => [...prev, currentAnnotation]);
    setCurrentAnnotation(null);
    setIsDrawing(false);
  };

  const addTextAnnotation = () => {
    if (!textInput.trim() || !textPos || !annotCanvasRef.current) return;
    const canvas = annotCanvasRef.current;
    const scaleX = canvas.width / canvas.getBoundingClientRect().width;
    const scaleY = canvas.height / canvas.getBoundingClientRect().height;
    const x = textPos.x * scaleX;
    const y = textPos.y * scaleY;

    // Draw text directly on canvas
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.font = `${lineWidth * 6 + 12}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(textInput, x, y);
    ctx.restore();

    // Create annotation for sync - use pen tool type with special encoding
    const textAnn: Annotation = {
      id: crypto.randomUUID(),
      tool: 'pen',
      points: [{ x, y }, { x: x + 1, y: y + 1 }], // minimal points
      color,
      width: lineWidth,
    };
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations(prev => [...prev, textAnn]);
    broadcastDrawStroke(textAnn);

    setTextInput('');
    setTextPos(null);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prevState = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, annotations]);
    setUndoStack(prev => prev.slice(0, -1));
    setAnnotations(prevState);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const nextState = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack(prev => prev.slice(0, -1));
    setAnnotations(nextState);
  };

  const clearCanvas = () => {
    setUndoStack(prev => [...prev, annotations]);
    setRedoStack([]);
    setAnnotations([]);
    broadcastClearCanvas();
    if (annotCanvasRef.current) {
      annotCanvasRef.current.getContext('2d')!.clearRect(0, 0, annotCanvasRef.current.width, annotCanvasRef.current.height);
    }
  };

  const changePage = (p: number) => {
    setCurrentPage(p);
    setAnnotations([]);
    setUndoStack([]);
    setRedoStack([]);
  };

  // --- POLL ---
  const createPoll = () => {
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) {
      toast.error('Add a question and at least 2 options'); return;
    }
    const poll: PollData = {
      id: crypto.randomUUID(),
      question: pollQuestion.trim(),
      options: pollOptions.filter(o => o.trim()),
      votes: {},
    };
    setActivePoll(poll);
    broadcastPoll(poll);
    setShowPollCreator(false);
    setPollQuestion(''); setPollOptions(['', '']);
    toast.success('Poll launched!');
  };

  const votePoll = (option: string) => {
    if (!activePoll || myVote) return;
    setMyVote(option);
    const updated = { ...activePoll, votes: { ...activePoll.votes, [user?.user_id || '']: option } };
    setActivePoll(updated);
    broadcastPollVote(user?.user_id || '', option);
  };

  const closePoll = () => { setActivePoll(null); setMyVote(null); broadcastPoll({ id: '', question: '', options: [], votes: {}, closed: true }); };

  // Sync remote poll
  useEffect(() => {
    if (!remotePoll) return;
    if (remotePoll.closed) { setActivePoll(null); setMyVote(null); return; }
    setActivePoll(remotePoll);
  }, [remotePoll]);

  // --- TIMER ---
  const startTimer = () => {
    setTimerSeconds(timerDuration);
    setTimerRunning(true);
    setShowTimer(true);
    broadcastTimer({ duration: timerDuration, remaining: timerDuration, running: true });
  };
  const stopTimer = () => {
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    broadcastTimer({ duration: timerDuration, remaining: timerSeconds, running: false });
  };

  useEffect(() => {
    if (!timerRunning) return;
    timerRef.current = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) { setTimerRunning(false); toast.info('⏰ Time is up!'); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // broadcast timer every 5s
  useEffect(() => {
    if (!isTeacher || !timerRunning) return;
    const iv = setInterval(() => { broadcastTimer({ duration: timerDuration, remaining: timerSeconds, running: true }); }, 5000);
    return () => clearInterval(iv);
  }, [isTeacher, timerRunning, timerSeconds, timerDuration, broadcastTimer]);

  // Student timer sync
  useEffect(() => {
    if (isTeacher || !remoteTimer) return;
    setTimerSeconds(remoteTimer.remaining);
    setTimerRunning(remoteTimer.running);
    setShowTimer(remoteTimer.running || remoteTimer.remaining > 0);
  }, [remoteTimer, isTeacher]);

  // --- REACTIONS ---
  const sendReaction = (emoji: string) => {
    const r = { id: crypto.randomUUID(), emoji, sender: user?.full_name || '' };
    setReactions(prev => [...prev, { ...r, time: Date.now() }]);
    broadcastReaction(r);
  };

  useEffect(() => {
    if (!remoteReaction) return;
    setReactions(prev => [...prev, { ...remoteReaction, time: Date.now() }]);
  }, [remoteReaction]);

  // Cleanup old reactions
  useEffect(() => {
    const iv = setInterval(() => {
      setReactions(prev => prev.filter(r => Date.now() - r.time < 3000));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // --- STAMPS (Teacher places emoji on board) ---
  const placeStamp = (emoji: string, e: React.PointerEvent) => {
    if (!isTeacher || !annotCanvasRef.current) return;
    const rect = annotCanvasRef.current.getBoundingClientRect();
    const stamp: StampData = {
      id: crypto.randomUUID(), emoji,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    setStamps(prev => [...prev, stamp]);
    broadcastStamp(stamp);
    setTimeout(() => setStamps(prev => prev.filter(s => s.id !== stamp.id)), 4000);
  };

  useEffect(() => {
    if (!remoteStamp) return;
    setStamps(prev => [...prev, remoteStamp]);
    setTimeout(() => setStamps(prev => prev.filter(s => s.id !== remoteStamp.id)), 4000);
  }, [remoteStamp]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

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

  // Tool definitions for toolbar
  const toolGroups = [
    {
      label: 'Select',
      tools: [
        { t: 'pointer' as Tool, icon: MousePointer, label: 'Pointer' },
        { t: 'laser' as Tool, icon: Crosshair, label: 'Laser Pointer' },
      ]
    },
    {
      label: 'Draw',
      tools: [
        { t: 'pen' as Tool, icon: Pen, label: 'Pen' },
        { t: 'highlighter' as Tool, icon: Highlighter, label: 'Highlighter' },
        { t: 'eraser' as Tool, icon: Eraser, label: 'Eraser' },
      ]
    },
    {
      label: 'Shapes',
      tools: [
        { t: 'line' as Tool, icon: Minus, label: 'Line' },
        { t: 'arrow' as Tool, icon: ArrowRight, label: 'Arrow' },
        { t: 'rectangle' as Tool, icon: Square, label: 'Rectangle' },
        { t: 'circle' as Tool, icon: Circle, label: 'Circle' },
      ]
    },
    {
      label: 'Other',
      tools: [
        { t: 'text' as Tool, icon: Type, label: 'Text' },
      ]
    }
  ];

  const getCursorStyle = () => {
    if (!isTeacher) return 'default';
    switch (tool) {
      case 'pointer': return 'default';
      case 'laser': return 'crosshair';
      case 'pen': case 'highlighter': case 'line': case 'arrow': case 'rectangle': case 'circle': return 'crosshair';
      case 'eraser': return 'cell';
      case 'text': return 'text';
      default: return 'default';
    }
  };

  // === SMART BOARD VIEW ===
  if (smartBoardOpen && activeSession && (isTeacher || joinStatus === 'approved')) {
    return (
      <div className={cn('fixed z-50 bg-slate-950 flex flex-col', fullscreen ? 'inset-0' : 'inset-0 md:inset-3 md:rounded-2xl md:overflow-hidden md:shadow-2xl md:shadow-black/50')}>
        {/* HEADER BAR */}
        <div className="flex items-center justify-between px-3 md:px-5 py-2.5 bg-slate-900/95 backdrop-blur border-b border-white/10 flex-shrink-0">
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
            {/* Poll button */}
            {isTeacher && (
              <button onClick={() => activePoll ? closePoll() : setShowPollCreator(true)} title={activePoll ? 'Close Poll' : 'Create Poll'}
                className={cn('p-2 rounded-lg transition-colors', activePoll ? 'bg-amber-500/20 text-amber-400' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {/* Timer button */}
            {isTeacher && (
              <button onClick={() => timerRunning ? stopTimer() : setShowTimer(!showTimer)} title="Timer"
                className={cn('p-2 rounded-lg transition-colors', timerRunning ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/60 hover:bg-white/10 hover:text-white')}>
                <Timer className="w-4 h-4" />
              </button>
            )}
            {/* Reactions */}
            <div className="flex items-center gap-0.5">
              {['👍', '❤️', '🎉', '✋'].map(emoji => (
                <button key={emoji} onClick={() => sendReaction(emoji)} title="React"
                  className="p-1 rounded-lg text-sm hover:bg-white/10 transition-colors">{emoji}</button>
              ))}
            </div>
            {isTeacher && (
              <>
                <div className="w-px h-5 bg-white/10 mx-0.5" />
                <button onClick={() => setZoom(z => Math.min(200, z + 20))} className="p-2 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors"><ZoomIn className="w-4 h-4" /></button>
                <span className="text-white/40 text-[10px] w-8 text-center">{zoom}%</span>
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
          {/* Enhanced Annotation Toolbar (Teacher only) */}
          {isTeacher && (
            <div className="flex flex-col items-center gap-0.5 p-1.5 bg-slate-900/80 backdrop-blur border-r border-white/10 w-14 flex-shrink-0 overflow-y-auto custom-scroll">
              {toolGroups.map((group, gi) => (
                <React.Fragment key={gi}>
                  <p className="text-[8px] text-white/25 font-bold uppercase tracking-wider mt-1 mb-0.5">{group.label}</p>
                  {group.tools.map(({ t, icon: Icon, label }) => (
                    <button key={t} onClick={() => setTool(t)} title={label}
                      className={cn('p-1.5 rounded-lg transition-all w-9 h-9 flex items-center justify-center',
                        tool === t ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-white/50 hover:bg-white/10 hover:text-white')}>
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                  {gi < toolGroups.length - 1 && <div className="w-7 h-px bg-white/10 my-0.5" />}
                </React.Fragment>
              ))}

              <div className="w-7 h-px bg-white/10 my-0.5" />
              <p className="text-[8px] text-white/25 font-bold uppercase tracking-wider mt-0.5 mb-0.5">Color</p>
              <button onClick={() => setShowColorPicker(!showColorPicker)} title="Colors"
                className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 w-9 h-9 flex items-center justify-center relative">
                <div className="w-5 h-5 rounded-full border-2 border-white/40" style={{ background: color }} />
              </button>
              {showColorPicker && (
                <div className="flex flex-col gap-1 py-1">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => { setColor(c); if (tool === 'pointer' || tool === 'eraser' || tool === 'laser') setTool('pen'); }}
                      className={cn('w-5 h-5 rounded-full border-2 transition-all hover:scale-110 mx-auto',
                        color === c && !['eraser', 'laser'].includes(tool) ? 'border-white scale-110' : 'border-transparent')}
                      style={{ background: c }} />
                  ))}
                </div>
              )}

              <div className="w-7 h-px bg-white/10 my-0.5" />
              <p className="text-[8px] text-white/25 font-bold uppercase tracking-wider mt-0.5 mb-0.5">Size</p>
              <button onClick={() => setShowWidthPicker(!showWidthPicker)} title="Line Width"
                className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 w-9 h-9 flex items-center justify-center">
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              {showWidthPicker && (
                <div className="flex flex-col gap-1 py-1">
                  {WIDTHS.map(w => (
                    <button key={w} onClick={() => setLineWidth(w)}
                      className={cn('w-8 flex items-center justify-center py-0.5 rounded mx-auto', lineWidth === w ? 'bg-white/20' : 'hover:bg-white/10')}>
                      <div className="rounded-full bg-white" style={{ width: Math.min(w + 4, 16), height: Math.min(w, 10) }} />
                    </button>
                  ))}
                </div>
              )}

              <div className="w-7 h-px bg-white/10 my-0.5" />
              <p className="text-[8px] text-white/25 font-bold uppercase tracking-wider mt-0.5 mb-0.5">Edit</p>
              <button onClick={undo} title="Undo" disabled={undoStack.length === 0}
                className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 disabled:opacity-20 w-9 h-9 flex items-center justify-center transition-colors">
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={redo} title="Redo" disabled={redoStack.length === 0}
                className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 disabled:opacity-20 w-9 h-9 flex items-center justify-center transition-colors">
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={clearCanvas} title="Clear All"
                className="p-1.5 rounded-lg text-red-400/70 hover:bg-red-500/20 hover:text-red-400 w-9 h-9 flex items-center justify-center transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* PDF Canvas Area */}
          <div ref={boardContainerRef} className="flex-1 overflow-auto flex items-start justify-center bg-slate-950 relative p-3 md:p-6">
            {hasPDF ? (
              <div className="relative inline-block">
                <canvas ref={pdfCanvasRef} className="max-w-full shadow-2xl shadow-black/50" style={{ display: 'block' }} />
                <canvas
                  ref={annotCanvasRef}
                  className="absolute inset-0 w-full h-full"
                  style={{
                    cursor: getCursorStyle(),
                    pointerEvents: !isTeacher ? 'none' : 'auto',
                    touchAction: 'none',
                  }}
                  onPointerDown={startDraw}
                  onPointerMove={draw}
                  onPointerUp={stopDraw}
                  onPointerLeave={() => { stopDraw(); handlePointerLeave(); }}
                />
                {/* Laser pointer (teacher local) */}
                {isTeacher && tool === 'laser' && laserPos && (
                  <div className="absolute pointer-events-none z-20"
                    style={{ left: laserPos.x, top: laserPos.y, transform: 'translate(-50%, -50%)' }}>
                    <div className="w-5 h-5 rounded-full bg-red-500/70 border-2 border-red-300 shadow-[0_0_20px_rgba(239,68,68,0.7)]" />
                  </div>
                )}
                {/* Text input overlay */}
                {isTeacher && textPos && (
                  <div className="absolute z-20" style={{ left: textPos.x, top: textPos.y }}>
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTextAnnotation(); if (e.key === 'Escape') { setTextPos(null); setTextInput(''); } }}
                      autoFocus
                      placeholder="Type text..."
                      className="bg-black/80 text-white border border-white/30 rounded px-2 py-1 text-sm min-w-[120px] outline-none focus:border-primary"
                      style={{ color }}
                    />
                  </div>
                )}
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
                    <div className="w-6 h-6 rounded-full bg-red-500/50 border-2 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
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
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:150ms]" />
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    );
  }

  // === LOBBY ===
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <VideoIcon className="w-6 h-6 text-primary" /> Live Class
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Interactive real-time teaching & learning</p>
        </div>
      </div>

      {/* Teacher: Start a new session */}
      {isTeacher && !activeSession && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6 space-y-5">
          <h2 className="font-bold text-lg flex items-center gap-2"><PlayCircle className="w-5 h-5 text-primary" /> Start Live Class</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Session Title *</label>
              <input value={sessionTitle} onChange={e => setSessionTitle(e.target.value)} placeholder="e.g. Math - Chapter 5"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Class (Optional)</label>
              <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">
                <option value="">All classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                <LinkIcon className="w-3.5 h-3.5 inline mr-1" /> External Meeting Link (Optional)
              </label>
              <input value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/... or Zoom link"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
              <p className="text-xs text-muted-foreground mt-1.5">
                Optionally use Google Meet, Zoom, or Teams for video while using our Smart Board for content.
              </p>
            </div>
          </div>
          <button onClick={startClass} disabled={starting}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2">
            {starting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Starting...</>
              : <><PlayCircle className="w-4 h-4" /> Start Live Class</>}
          </button>
        </div>
      )}

      {/* Teacher active session */}
      {isTeacher && activeSession && !smartBoardOpen && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg">{activeSession.title}</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setSmartBoardOpen(true)} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
                Open Smart Board
              </button>
              <button onClick={endClass} className="px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors">
                End Class
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xl font-bold text-primary">{approvedCount}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xl font-bold text-amber-500">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 col-span-2">
              <p className="text-lg font-bold font-mono text-foreground">{joinCode}</p>
              <p className="text-xs text-muted-foreground">Join Code</p>
            </div>
          </div>
          {activeSession.meeting_link && (
            <a href={activeSession.meeting_link} target="_blank" rel="noopener noreferrer"
              className="mt-4 flex items-center gap-2 text-sm text-primary hover:underline">
              <ExternalLink className="w-4 h-4" /> Open External Meeting
            </a>
          )}
        </div>
      )}

      {/* Student: Join */}
      {isStudent && !activeSession && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-8 text-center max-w-md mx-auto space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <VideoIcon className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Join a Live Class</h2>
          <p className="text-muted-foreground text-sm">Enter the join code provided by your teacher to request access to the live class.</p>
          <div className="flex gap-2">
            <input value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value.toUpperCase())} placeholder="Enter join code"
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm text-center font-mono tracking-widest uppercase focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
            <button onClick={joinByCode} className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity">Join</button>
          </div>
        </div>
      )}

      {/* Student: Active session found */}
      {isStudent && activeSession && !joinStatus && (
        <div className="bg-card rounded-2xl border border-border shadow-card p-8 text-center max-w-md mx-auto space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
            <Radio className="w-8 h-8 text-green-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold">{activeSession.title}</h2>
          <p className="text-muted-foreground text-sm">A live class is happening now. Request to join!</p>
          <button onClick={requestToJoin} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
            Request to Join
          </button>
        </div>
      )}
    </div>
  );
};

export default LiveClassPage;
