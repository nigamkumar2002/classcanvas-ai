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
  id: string;
  tool: 'pen' | 'eraser' | 'highlighter' | 'line' | 'arrow' | 'rectangle' | 'circle';
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: string;
  senderId: string;
  time: string;
}

export interface PollData {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, string>;
  closed?: boolean;
}

export interface ReactionData {
  id: string;
  emoji: string;
  sender: string;
}

export interface TimerData {
  duration: number;
  remaining: number;
  running: boolean;
}

export interface StampData {
  id: string;
  emoji: string;
  x: number;
  y: number;
}

export function useRealtimeSync(sessionId: string | null, isTeacher: boolean) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastBoardStateRef = useRef<BoardState | null>(null);

  const [remoteBoardState, setRemoteBoardState] = useState<BoardState | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<CursorState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [remoteDrawStroke, setRemoteDrawStroke] = useState<SerializedAnnotation | null>(null);
  const [remotePoll, setRemotePoll] = useState<PollData | null>(null);
  const [remoteReaction, setRemoteReaction] = useState<ReactionData | null>(null);
  const [remoteTimer, setRemoteTimer] = useState<TimerData | null>(null);
  const [remoteStamp, setRemoteStamp] = useState<StampData | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`live-board-${sessionId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'board-state' }, ({ payload }) => {
        if (!isTeacher) setRemoteBoardState(payload as BoardState);
      })
      .on('broadcast', { event: 'board-state-request' }, () => {
        if (isTeacher && lastBoardStateRef.current) {
          channel.send({ type: 'broadcast', event: 'board-state', payload: lastBoardStateRef.current });
        }
      })
      .on('broadcast', { event: 'cursor-move' }, ({ payload }) => {
        if (!isTeacher) setRemoteCursor(payload as CursorState);
      })
      .on('broadcast', { event: 'draw-stroke' }, ({ payload }) => {
        if (!isTeacher) setRemoteDrawStroke(payload as SerializedAnnotation);
      })
      .on('broadcast', { event: 'clear-canvas' }, () => {
        if (!isTeacher) setRemoteBoardState(prev => (prev ? { ...prev, annotations: [] } : null));
      })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        setChatMessages(prev => [...prev, payload as ChatMessage]);
      })
      .on('broadcast', { event: 'poll' }, ({ payload }) => {
        setRemotePoll(payload as PollData);
      })
      .on('broadcast', { event: 'poll-vote' }, ({ payload }) => {
        setRemotePoll(prev => prev ? { ...prev, votes: { ...prev.votes, [payload.oderId]: payload.option } } : null);
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        setRemoteReaction(payload as ReactionData);
      })
      .on('broadcast', { event: 'timer-sync' }, ({ payload }) => {
        setRemoteTimer(payload as TimerData);
      })
      .on('broadcast', { event: 'stamp' }, ({ payload }) => {
        setRemoteStamp(payload as StampData);
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [sessionId, isTeacher]);

  const broadcastBoardState = useCallback((state: BoardState) => {
    lastBoardStateRef.current = state;
    channelRef.current?.send({ type: 'broadcast', event: 'board-state', payload: state });
  }, []);

  const requestBoardState = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'board-state-request', payload: {} });
  }, []);

  const broadcastCursor = useCallback((cursor: CursorState) => {
    channelRef.current?.send({ type: 'broadcast', event: 'cursor-move', payload: cursor });
  }, []);

  const broadcastDrawStroke = useCallback((stroke: SerializedAnnotation) => {
    channelRef.current?.send({ type: 'broadcast', event: 'draw-stroke', payload: stroke });
  }, []);

  const broadcastClearCanvas = useCallback(() => {
    channelRef.current?.send({ type: 'broadcast', event: 'clear-canvas', payload: {} });
  }, []);

  const sendChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages(prev => [...prev, msg]);
    channelRef.current?.send({ type: 'broadcast', event: 'chat-message', payload: msg });
  }, []);

  const broadcastPoll = useCallback((poll: PollData) => {
    setRemotePoll(poll);
    channelRef.current?.send({ type: 'broadcast', event: 'poll', payload: poll });
  }, []);

  const broadcastPollVote = useCallback((oderId: string, option: string) => {
    channelRef.current?.send({ type: 'broadcast', event: 'poll-vote', payload: { oderId, option } });
  }, []);

  const broadcastReaction = useCallback((reaction: ReactionData) => {
    channelRef.current?.send({ type: 'broadcast', event: 'reaction', payload: reaction });
  }, []);

  const broadcastTimer = useCallback((timer: TimerData) => {
    setRemoteTimer(timer);
    channelRef.current?.send({ type: 'broadcast', event: 'timer-sync', payload: timer });
  }, []);

  const broadcastStamp = useCallback((stamp: StampData) => {
    channelRef.current?.send({ type: 'broadcast', event: 'stamp', payload: stamp });
  }, []);

  return {
    remoteBoardState, remoteCursor, remoteDrawStroke, chatMessages,
    remotePoll, remoteReaction, remoteTimer, remoteStamp,
    broadcastBoardState, requestBoardState, broadcastCursor,
    broadcastDrawStroke, broadcastClearCanvas, sendChatMessage,
    broadcastPoll, broadcastPollVote, broadcastReaction, broadcastTimer, broadcastStamp,
  };
}
