import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Send, MessageSquare, Plus, ArrowLeft, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Message { id: string; sender_id: string; recipient_id: string; subject: string | null; body: string; is_read: boolean; created_at: string; }
interface Contact { user_id: string; full_name: string; role: string; }

const MessagesPage = () => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadContacts = async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name, role').neq('user_id', user!.id);
      setContacts(data || []);
      setLoading(false);
    };
    loadContacts();

    const channel = supabase.channel('messages-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const msg = payload.new as Message;
        if (msg.sender_id === user!.id || msg.recipient_id === user!.id) {
          setMessages(prev => [...prev, msg]);
        }
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!selectedContact) return;
    const loadMessages = async () => {
      const { data } = await supabase.from('messages').select('*')
        .or(`and(sender_id.eq.${user!.id},recipient_id.eq.${selectedContact.user_id}),and(sender_id.eq.${selectedContact.user_id},recipient_id.eq.${user!.id})`)
        .order('created_at');
      setMessages((data || []) as Message[]);
      await supabase.from('messages').update({ is_read: true }).eq('sender_id', selectedContact.user_id).eq('recipient_id', user!.id).eq('is_read', false);
    };
    loadMessages();
  }, [selectedContact]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedContact) return;
    const { error } = await supabase.from('messages').insert({
      sender_id: user!.id, recipient_id: selectedContact.user_id,
      body: newMessage.trim(), school_id: user!.school_id,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    setNewMessage('');
  };

  const filteredContacts = contacts.filter(c => c.full_name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-muted-foreground text-sm mt-1">Chat with teachers, students, and staff</p>
      </div>

      <div className="flex-1 flex bg-card rounded-2xl border border-border overflow-hidden min-h-0">
        <div className={`w-full md:w-80 border-r border-border flex flex-col ${selectedContact ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search contacts..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted text-sm focus:outline-none" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map(c => (
              <button key={c.user_id} onClick={() => setSelectedContact(c)}
                className={`w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left ${selectedContact?.user_id === c.user_id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">{c.full_name[0]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.full_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{c.role.replace('_', ' ')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 flex flex-col ${selectedContact ? 'flex' : 'hidden md:flex'}`}>
          {selectedContact ? (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-border">
                <button onClick={() => setSelectedContact(null)} className="md:hidden p-1"><ArrowLeft className="w-5 h-5" /></button>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{selectedContact.full_name[0]}</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedContact.full_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{selectedContact.role.replace('_', ' ')}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(m => {
                  const isMine = m.sender_id === user!.id;
                  return (
                    <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm ${isMine ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        <p>{m.body}</p>
                        <p className={`text-[10px] mt-1 ${isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-3 border-t border-border">
                <div className="flex gap-2">
                  <input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Type a message..." className="flex-1 px-4 py-2 rounded-xl bg-muted text-sm focus:outline-none" />
                  <button onClick={handleSend} disabled={!newMessage.trim()} className="p-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50">
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div><MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/20 mb-4" /><p className="text-muted-foreground">Select a contact to start messaging</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagesPage;
