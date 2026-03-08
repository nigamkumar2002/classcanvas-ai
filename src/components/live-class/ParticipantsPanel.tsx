import React from 'react';
import { UserCheck, UserX, Copy, Check, Link as LinkIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Participant {
  id: string;
  session_id: string;
  user_id: string;
  status: string;
  joined_at: string;
  approved_at: string | null;
  profile_name?: string;
}

interface ParticipantsPanelProps {
  participants: Participant[];
  joinCode: string;
  isTeacher: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
  onClose: () => void;
}

const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants, joinCode, isTeacher, onApprove, onReject, onApproveAll, onClose,
}) => {
  const [copied, setCopied] = React.useState(false);
  const pending = participants.filter(p => p.status === 'pending');
  const approved = participants.filter(p => p.status === 'approved');

  const copyCode = () => {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/live-class?code=${joinCode}`);
    toast.success('Join link copied!');
  };

  return (
    <div className="w-72 bg-slate-900/95 backdrop-blur border-l border-white/10 flex flex-col flex-shrink-0 animate-in slide-in-from-right-4 duration-200">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">👥 Participants ({approved.length})</h3>
        <div className="flex items-center gap-2">
          {isTeacher && pending.length > 0 && (
            <button onClick={onApproveAll} className="text-xs text-emerald-400 font-semibold hover:underline">
              Approve All
            </button>
          )}
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1 scrollbar-thin">
        {pending.length > 0 && (
          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-wider px-2 pt-1 pb-2">
            ⏳ Pending ({pending.length})
          </p>
        )}
        {pending.map(p => (
          <div key={p.id} className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold">
                {(p.profile_name || p.user_id)[0]?.toUpperCase()}
              </div>
              <span className="text-white text-xs font-medium truncate max-w-[100px]">
                {p.profile_name || p.user_id.slice(0, 8)}
              </span>
            </div>
            {isTeacher && (
              <div className="flex gap-1.5">
                <button onClick={() => onApprove(p.id)} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                  <UserCheck className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onReject(p.id)} className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                  <UserX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {approved.length > 0 && (
          <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2 pt-3 pb-2">
            ✓ In Class ({approved.length})
          </p>
        )}
        {approved.map(p => (
          <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/5">
            <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">
              {(p.profile_name || p.user_id)[0]?.toUpperCase()}
            </div>
            <span className="text-white text-xs font-medium truncate max-w-[120px]">
              {p.profile_name || p.user_id.slice(0, 8)}
            </span>
            <div className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />
          </div>
        ))}

        {participants.length === 0 && (
          <div className="flex flex-col items-center py-12 text-white/20">
            <p className="text-sm">No students yet</p>
            <p className="text-xs mt-1">Share the join code</p>
          </div>
        )}
      </div>

      {isTeacher && joinCode && (
        <div className="p-3 border-t border-white/10 space-y-2">
          <button onClick={copyCode}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/10 text-white text-sm font-mono hover:bg-white/20 transition-colors">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {joinCode}
          </button>
          <button onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary/20 text-primary text-xs font-semibold hover:bg-primary/30 transition-colors">
            <LinkIcon className="w-3.5 h-3.5" /> Copy Join Link
          </button>
        </div>
      )}
    </div>
  );
};

export default ParticipantsPanel;
