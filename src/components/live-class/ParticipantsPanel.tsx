import React from 'react';
import { UserCheck, UserX, Copy, Check, Link as LinkIcon } from 'lucide-react';
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
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onApproveAll: () => void;
}

const ParticipantsPanel: React.FC<ParticipantsPanelProps> = ({
  participants, joinCode, onApprove, onReject, onApproveAll,
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
    <div className="w-64 bg-slate-900 border-l border-white/10 flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">👥 Participants ({approved.length})</h3>
        {pending.length > 0 && (
          <button onClick={onApproveAll} className="text-xs text-green-400 font-medium hover:underline">
            Approve All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {pending.length > 0 && (
          <p className="text-amber-400 text-[10px] font-semibold uppercase tracking-wide px-2 pt-1">
            Pending ({pending.length})
          </p>
        )}
        {pending.map(p => (
          <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-white text-xs truncate max-w-[120px]">
                {p.profile_name || p.user_id.slice(0, 8) + '...'}
              </span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => onApprove(p.id)} className="p-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">
                <UserCheck className="w-3 h-3" />
              </button>
              <button onClick={() => onReject(p.id)} className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30">
                <UserX className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}

        {approved.length > 0 && (
          <p className="text-green-400 text-[10px] font-semibold uppercase tracking-wide px-2 pt-2">
            In Class ({approved.length})
          </p>
        )}
        {approved.map(p => (
          <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-white text-xs truncate max-w-[120px]">
                {p.profile_name || p.user_id.slice(0, 8) + '...'}
              </span>
            </div>
            <span className="text-green-400 text-[10px]">✓</span>
          </div>
        ))}

        {participants.length === 0 && (
          <p className="text-white/30 text-xs text-center py-4">No students yet</p>
        )}
      </div>

      {joinCode && (
        <div className="p-3 border-t border-white/10 space-y-2">
          <button onClick={copyCode}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 text-white text-xs font-mono hover:bg-white/20">
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />} {joinCode}
          </button>
          <button onClick={copyLink}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30">
            <LinkIcon className="w-3 h-3" /> Copy Join Link
          </button>
        </div>
      )}
    </div>
  );
};

export default ParticipantsPanel;
