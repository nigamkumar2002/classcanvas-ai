import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RemoteStream } from './useWebRTC';

interface MediaControlsProps {
  localStream: MediaStream | null;
  remoteStreams: RemoteStream[];
  audioEnabled: boolean;
  videoEnabled: boolean;
  isScreenSharing: boolean;
  mediaStarted: boolean;
  isTeacher: boolean;
  onStartMedia: (withVideo?: boolean) => void;
  onStopMedia: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
}

const VideoTile: React.FC<{ stream: MediaStream; muted?: boolean; label?: string; small?: boolean }> = ({ stream, muted, label, small }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={cn("relative bg-slate-800 rounded-lg overflow-hidden flex-shrink-0", small ? "w-24 h-18" : "w-32 h-24")}>
      <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      {label && (
        <span className="absolute bottom-0.5 left-1 text-[9px] text-white bg-black/60 rounded px-1">{label}</span>
      )}
    </div>
  );
};

const MediaControls: React.FC<MediaControlsProps> = ({
  localStream, remoteStreams, audioEnabled, videoEnabled,
  isScreenSharing, mediaStarted, isTeacher,
  onStartMedia, onStopMedia, onToggleAudio, onToggleVideo,
  onStartScreenShare, onStopScreenShare,
}) => {
  if (!mediaStarted) {
    return (
      <div className="px-4 py-2 bg-slate-900 border-t border-white/10 flex items-center justify-center gap-3">
        <button
          onClick={() => onStartMedia(false)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 text-xs font-semibold transition-colors"
        >
          <Mic className="w-4 h-4" /> Join Audio
        </button>
        <button
          onClick={() => onStartMedia(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-semibold transition-colors"
        >
          <Video className="w-4 h-4" /> Join with Video
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border-t border-white/10 flex-shrink-0">
      {/* Video tiles */}
      {(localStream || remoteStreams.length > 0) && (
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto">
          {localStream && <VideoTile stream={localStream} muted label="You" small />}
          {remoteStreams.map(rs => (
            <VideoTile key={rs.peerId} stream={rs.stream} label={rs.peerName || 'Peer'} small />
          ))}
        </div>
      )}

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-2 px-4 py-2 border-t border-white/5">
        <button onClick={onToggleAudio}
          className={cn("p-2.5 rounded-full transition-colors", audioEnabled ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-500/30 text-red-400 hover:bg-red-500/40")}>
          {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>
        <button onClick={onToggleVideo}
          className={cn("p-2.5 rounded-full transition-colors", videoEnabled ? "bg-white/10 text-white hover:bg-white/20" : "bg-white/5 text-white/50 hover:bg-white/10")}>
          {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>
        {isTeacher && (
          <button onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
            className={cn("p-2.5 rounded-full transition-colors", isScreenSharing ? "bg-blue-500/30 text-blue-400 hover:bg-blue-500/40" : "bg-white/10 text-white hover:bg-white/20")}>
            {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </button>
        )}
        <button onClick={onStopMedia} className="p-2.5 rounded-full bg-red-500/30 text-red-400 hover:bg-red-500/40 transition-colors">
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default MediaControls;
