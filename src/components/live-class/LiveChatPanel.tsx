import React, { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import type { ChatMessage } from './useRealtimeSync';

interface LiveChatPanelProps {
  messages: ChatMessage[];
  onSend: (msg: ChatMessage) => void;
  userId: string;
  userName: string;
  onClose: () => void;
}

const LiveChatPanel: React.FC<LiveChatPanelProps> = ({ messages, onSend, userId, userName, onClose }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = () => {
    if (!input.trim()) return;
    onSend({
      id: crypto.randomUUID(),
      text: input.trim(),
      sender: userName,
      senderId: userId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    setInput('');
  };

  return (
    <div className="w-80 bg-slate-900/95 backdrop-blur border-l border-white/10 flex flex-col flex-shrink-0 animate-in slide-in-from-right-4 duration-200">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          💬 Live Chat
          {messages.length > 0 && (
            <span className="text-[10px] bg-white/10 rounded-full px-2 py-0.5 text-white/60">{messages.length}</span>
          )}
        </h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {messages.map(m => {
          const isOwn = m.senderId === userId;
          return (
            <div key={m.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-3 py-2 max-w-[85%] ${isOwn ? 'bg-primary/30 rounded-br-sm' : 'bg-white/10 rounded-bl-sm'}`}>
                {!isOwn && <p className="text-[10px] text-white/50 font-semibold mb-0.5">{m.sender}</p>}
                <p className="text-white text-sm leading-relaxed">{m.text}</p>
              </div>
              <span className="text-[9px] text-white/30 mt-0.5 px-1">{m.time}</span>
            </div>
          );
        })}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-white/20">
            <p className="text-sm">No messages yet</p>
            <p className="text-xs mt-1">Start the conversation</p>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2 items-center bg-white/5 rounded-xl px-3 py-1 border border-white/10 focus-within:border-primary/50 transition-colors">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-white text-sm placeholder-white/30 focus:outline-none py-2"
          />
          <button onClick={send} disabled={!input.trim()}
            className="p-1.5 rounded-lg text-primary hover:bg-primary/20 disabled:opacity-30 transition-colors">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveChatPanel;
