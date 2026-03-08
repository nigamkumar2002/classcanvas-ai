import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, PhoneOff, Phone } from 'lucide-react';
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

const VideoTile: React.FC<{ stream: MediaStream; muted?: boolean; label?: string }> = ({ stream, muted, label }) => {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative bg-slate-800 rounded-lg overflow-hidden w-28 h-20 flex-shrink-0 border border-white/5">
      <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      {label && (
        <span className="absolute bottom-0.5 left-1 text-[9px] text-white bg-black/70 rounded px-1 py-px font-medium">
          {label}
        </span>
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
      <div className="px-4 py-3 bg-slate-900/95 backdrop-blur border-t border-white/10 flex items-center justify-center gap-4">
        <button onClick={() => onStartMedia(false)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-semibold transition-all hover:scale-105">
          <Phone className="w-4 h-4" /> Join Audio
        </button>
        <button onClick={() => onStartMedia(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-sm font-semibold transition-all hover:scale-105">
          <Video className="w-4 h-4" /> Join with Video
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/95 backdrop-blur border-t border-white/10 flex-shrink-0">
      {(localStream || remoteStreams.length > 0) && (
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-white/5">
          {localStream && <VideoTile stream={localStream} muted label="You" />}
          {remoteStreams.map(rs => (
            <VideoTile key={rs.peerId} stream={rs.stream} label={rs.peerName || 'Peer'} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-center gap-3 px-4 py-3">
        <button onClick={onToggleAudio} title={audioEnabled ? 'Mute' : 'Unmute'}
          className={cn("p-3 rounded-full transition-all", audioEnabled ? "bg-white/10 text-white hover:bg-white/20" : "bg-red-500 text-white hover:bg-red-600")}>
          {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button onClick={onToggleVideo} title={videoEnabled ? 'Camera Off' : 'Camera On'}
          className={cn("p-3 rounded-full transition-all", videoEnabled ? "bg-white/10 text-white hover:bg-white/20" : "bg-white/5 text-white/50 hover:bg-white/10")}>
          {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        {isTeacher && (
          <button onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
            title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            className={cn("p-3 rounded-full transition-all", isScreenSharing ? "bg-blue-500 text-white hover:bg-blue-600" : "bg-white/10 text-white hover:bg-white/20")}>
            {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </button>
        )}
        <div className="w-px h-8 bg-white/10 mx-1" />
        <button onClick={onStopMedia} title="Leave"
          className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-all">
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default MediaControls;
