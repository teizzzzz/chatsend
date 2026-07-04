import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BackIcon, PaperclipIcon, SendIcon } from '@/components/ui/icons';
import { cn, formatTime } from '@/lib/utils';
import type { Message } from '@/types';

/**
 * The chat-style transfer surface — the heart of the app.
 *
 * Layout: a fixed header (peer name + status), a scrollable bubble list, and a
 * fixed composer (text input, file button, send). Outgoing bubbles align
 * right, incoming left. Phase 0 uses static sample messages and a local-echo
 * send so the interaction shape is visible; real messages flow over the
 * DataChannel in a later phase.
 */

// Sample data so the layout is reviewable before transport exists.
const SAMPLE: Message[] = [
  {
    id: 'm1',
    sessionId: 's1',
    kind: 'text',
    direction: 'incoming',
    status: 'received',
    text: 'Hey! Ready to send those photos?',
    peerName: "Alex's Laptop",
    createdAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: 'm2',
    sessionId: 's1',
    kind: 'text',
    direction: 'outgoing',
    status: 'sent',
    text: 'Yep, sending now.',
    createdAt: Date.now() - 1000 * 60 * 4,
  },
];

function Bubble({ message }: { message: Message }) {
  const isOutgoing = message.direction === 'outgoing';
  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          isOutgoing
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p
          className={cn(
            'mt-1 text-right text-[10px]',
            isOutgoing ? 'text-brand-100' : 'text-slate-400',
          )}
        >
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>(SAMPLE);
  const [draft, setDraft] = useState('');

  // Phase 0: local echo only. No network, no persistence yet.
  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `local_${Date.now()}`,
        sessionId: 's1',
        kind: 'text',
        direction: 'outgoing',
        status: 'sent',
        text,
        createdAt: Date.now(),
      },
    ]);
    setDraft('');
  };

  return (
    <Layout bare>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
          onClick={() => navigate('/')}
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          aria-label="Back"
        >
          <BackIcon className="text-xl" />
        </button>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            Alex's Laptop
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-300" />
            Not connected (Phase 0)
          </p>
        </div>
      </header>

      {/* Message list */}
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin p-4">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Attach file"
          title="File sending arrives in a later phase"
        >
          <PaperclipIcon className="text-xl" />
        </button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message…"
        />
        <Button
          size="md"
          className="w-10 shrink-0 px-0"
          onClick={handleSend}
          aria-label="Send"
        >
          <SendIcon className="text-lg" />
        </Button>
      </div>
    </Layout>
  );
}
