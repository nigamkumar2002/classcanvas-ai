import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface BoardState {
  materialId: string | null;
  materialUrl: string | null;
  materialFileType: string | null;
  materialTitle: string | null;
  currentPage: number;
  totalPages: number;
  zoom: number;
  annotations: SerializedAnnotation[];
}

export interface SerializedAnnotation {
  tool: 'pen' | 'eraser' | 'highlighter';
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  senderId: string;
  time: string;
}

export function useRealtimeSync(sessionId: string | null, isTeacher: boolean) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [remoteBoardState, setRemoteBoardState] = useState<BoardState | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<CursorState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`live-board-${sessionId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'board-state' }, ({ payload }) => {
        if (!isTeacher) setRemoteBoardState(payload as BoardState);
      })
      .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
        if (!isTeacher) setRemoteCursor(payload as CursorState);
      })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        setChatMessages(prev => [...prev, payload as ChatMessage]);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, isTeacher]);

  const broadcastBoardState = useCallback((state: BoardState) => {
    channelRef.current?.send({ type: 'broadcast', event: 'board-state', payload: state });
  }, []);

  const broadcastCursor = useCallback((cursor: CursorState) => {
    channelRef.current?.send({ type: 'broadcast', event: 'cursor-move', payload: cursor });
  }, []);

  const sendChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages(prev => [...prev, msg]);
    channelRef.current?.send({ type: 'broadcast', event: 'chat-message', payload: msg });
  }, []);

  return {
    remoteBoardState,
    remoteCursor,
    chatMessages,
    broadcastBoardState,
    broadcastCursor,
    sendChatMessage,
  };
}
