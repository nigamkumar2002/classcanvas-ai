import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export interface RemoteStream {
  peerId: string;
  stream: MediaStream;
  peerName?: string;
}

export function useWebRTC(sessionId: string | null, userId: string, userName: string) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [mediaStarted, setMediaStarted] = useState(false);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const createPeerConnection = useCallback((peerId: string, peerName?: string): RTCPeerConnection => {
    if (peersRef.current.has(peerId)) {
      peersRef.current.get(peerId)!.close();
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        channelRef.current?.send({
          type: 'broadcast', event: 'rtc-ice',
          payload: { from: userId, to: peerId, candidate: event.candidate.toJSON() }
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        setRemoteStreams(prev => {
          const exists = prev.find(r => r.peerId === peerId);
          if (exists) return prev.map(r => r.peerId === peerId ? { ...r, stream } : r);
          return [...prev, { peerId, stream, peerName }];
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(peerId);
      }
    };

    peersRef.current.set(peerId, pc);
    return pc;
  }, [userId]);

  const createOffer = useCallback(async (peerId: string, peerName?: string) => {
    try {
      const pc = createPeerConnection(peerId, peerName);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      channelRef.current?.send({
        type: 'broadcast', event: 'rtc-offer',
        payload: { from: userId, fromName: userName, to: peerId, sdp: offer }
      });
    } catch (err) { console.error('Create offer failed:', err); }
  }, [userId, userName, createPeerConnection]);

  const handleOffer = useCallback(async (fromId: string, fromName: string, sdp: RTCSessionDescriptionInit) => {
    try {
      const pc = createPeerConnection(fromId, fromName);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      channelRef.current?.send({
        type: 'broadcast', event: 'rtc-answer',
        payload: { from: userId, to: fromId, sdp: answer }
      });
    } catch (err) { console.error('Handle offer failed:', err); }
  }, [userId, createPeerConnection]);

  const handleAnswer = useCallback(async (fromId: string, sdp: RTCSessionDescriptionInit) => {
    try {
      const pc = peersRef.current.get(fromId);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    } catch (err) { console.error('Handle answer failed:', err); }
  }, []);

  const removePeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) { pc.close(); peersRef.current.delete(peerId); }
    setRemoteStreams(prev => prev.filter(r => r.peerId !== peerId));
  }, []);

  // Setup signaling channel
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`rtc-signal-${sessionId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'rtc-offer' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        await handleOffer(payload.from, payload.fromName, payload.sdp);
      })
      .on('broadcast', { event: 'rtc-answer' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        await handleAnswer(payload.from, payload.sdp);
      })
      .on('broadcast', { event: 'rtc-ice' }, async ({ payload }) => {
        if (payload.to !== userId) return;
        const pc = peersRef.current.get(payload.from);
        if (pc && payload.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }
          catch (err) { console.error('ICE error:', err); }
        }
      })
      .on('broadcast', { event: 'rtc-join' }, async ({ payload }) => {
        if (payload.userId === userId) return;
        // New peer wants to connect
        await createOffer(payload.userId, payload.userName);
      })
      .on('broadcast', { event: 'rtc-leave' }, ({ payload }) => {
        removePeer(payload.userId);
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, userId, handleOffer, handleAnswer, createOffer, removePeer]);

  const startMedia = useCallback(async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: withVideo ? { width: 320, height: 240, facingMode: 'user' } : false,
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      setAudioEnabled(true);
      setVideoEnabled(withVideo);
      setMediaStarted(true);

      // Announce to others
      channelRef.current?.send({
        type: 'broadcast', event: 'rtc-join',
        payload: { userId, userName }
      });
      return stream;
    } catch (err) {
      console.error('Media error:', err);
      return null;
    }
  }, [userId, userName]);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setAudioEnabled(prev => !prev);
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return;

    if (videoEnabled) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop();
        localStreamRef.current!.removeTrack(t);
      });
      setVideoEnabled(false);
    } else {
      try {
        const vidStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' }
        });
        const videoTrack = vidStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);

        peersRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
          else pc.addTrack(videoTrack, localStreamRef.current!);
        });
        setVideoEnabled(true);
      } catch (err) { console.error('Camera error:', err); }
    }
  }, [videoEnabled]);

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: true,
      });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.onended = () => {
        setIsScreenSharing(false);
        screenStreamRef.current = null;
      };

      // Replace video in peer connections with screen
      peersRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
        else pc.addTrack(videoTrack, stream);
      });
      return stream;
    } catch (err) {
      console.error('Screen share error:', err);
      return null;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);

      // Restore camera track if video was enabled
      if (localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        if (camTrack) {
          peersRef.current.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(camTrack);
          });
        }
      }
    }
  }, []);

  const stopMedia = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast', event: 'rtc-leave',
      payload: { userId }
    });
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    setLocalStream(null);
    setRemoteStreams([]);
    setIsScreenSharing(false);
    setMediaStarted(false);
    localStreamRef.current = null;
    screenStreamRef.current = null;
  }, [userId]);

  return {
    localStream,
    remoteStreams,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    mediaStarted,
    startMedia,
    stopMedia,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
  };
}
