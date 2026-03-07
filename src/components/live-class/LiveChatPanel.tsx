import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from './useRealtimeSync';

interface LiveChatPanelProps {
  messages: ChatMessage[];
  onSend: (msg: ChatMessage) => void;
  userId: string;
  userName: string;
}

const LiveChatPanel: React.FC<LiveChatPanelProps> = ({ messages, onSend, userId, userName }) => {
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
    <div className="w-72 bg-slate-900 border-l border-white/10 flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-white/10">
        <h3 className="text-white font-semibold text-sm">💬 Live Chat</h3>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.map(m => (
          <div key={m.id} className={`rounded-lg p-2 ${m.senderId === userId ? 'bg-primary/20' : 'bg-white/5'}`}>
            <p className="text-white/70 text-xs font-medium">
              {m.sender} <span className="text-white/30">{m.time}</span>
            </p>
            <p className="text-white text-sm">{m.text}</p>
          </div>
        ))}
        {messages.length === 0 && (
          <p className="text-white/30 text-xs text-center py-4">No messages yet</p>
        )}
      </div>
      <div className="p-3 border-t border-white/10 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 bg-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button onClick={send} className="px-3 py-2 bg-primary rounded-lg text-white text-xs font-medium hover:opacity-90">
          Send
        </button>
      </div>
    </div>
  );
};

export default LiveChatPanel;
