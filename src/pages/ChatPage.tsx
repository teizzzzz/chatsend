import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  BackIcon,
  CheckIcon,
  CopyIcon,
  PaperclipIcon,
  SendIcon,
} from '@/components/ui/icons';
import { cn, formatTime } from '@/lib/utils';
import { linkify } from '@/lib/linkify';
import type { Message } from '@/types';
import { useSessionStore, type SessionStatus } from '@/store/useSessionStore';

/**
 * The chat-style transfer surface. Header shows the live peer name and
 * connection status; the timeline renders this session's messages (sent
 * right, received left, system events centered); the composer sends text
 * over the DataChannel. File messages arrive in Phase 3.
 */

const STATUS_LABEL: Record<SessionStatus, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  waiting: 'Waiting for peer…',
  joining: 'Joining…',
  negotiating: 'Establishing connection…',
  connected: 'Connected',
  disconnected: 'Disconnected',
  failed: 'Connection failed',
};

function statusDotClass(status: SessionStatus): string {
  if (status === 'connected') return 'bg-emerald-500';
  if (status === 'disconnected' || status === 'failed') return 'bg-red-500';
  if (status === 'idle') return 'bg-slate-300 dark:bg-slate-600';
  return 'bg-amber-400';
}

function SystemChip({ message }: { message: Message }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {message.content} · {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

function TextBubble({ message }: { message: Message }) {
  const sent = message.direction === 'sent';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions / non-secure context) — ignore.
    }
  };

  return (
    <div className={cn('flex', sent ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
          sent
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100',
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {linkify(message.content ?? '')}
        </p>
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-2 text-[10px]',
            sent ? 'text-brand-100' : 'text-slate-400',
          )}
        >
          <button
            onClick={copy}
            className="opacity-60 transition-opacity hover:opacity-100"
            aria-label="Copy message"
            title="Copy"
          >
            {copied ? <CheckIcon className="text-xs" /> : <CopyIcon className="text-xs" />}
          </button>
          <span>{formatTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const { status, peer, messages, sendText, leave } = useSessionStore();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const connected = status === 'connected';

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const handleSend = () => {
    if (sendText(draft)) setDraft('');
  };

  const handleLeave = () => {
    leave();
    navigate('/');
  };

  return (
    <Layout bare>
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <button
          onClick={handleLeave}
          className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          aria-label="Back"
        >
          <BackIcon className="text-xl" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
            {peer?.name ?? 'No device'}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className={cn('h-2 w-2 rounded-full', statusDotClass(status))} />
            {STATUS_LABEL[status]}
          </p>
        </div>
        {connected && (
          <Button variant="ghost" size="sm" onClick={handleLeave}>
            Disconnect
          </Button>
        )}
      </header>

      {/* Timeline */}
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto scrollbar-thin p-4">
        {status === 'idle' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-400">
              No active session. Pair with another device first.
            </p>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Go home
            </Button>
          </div>
        ) : (
          messages.map((m) =>
            m.type === 'system' ? (
              <SystemChip key={m.id} message={m} />
            ) : (
              <TextBubble key={m.id} message={m} />
            ),
          )
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400"
          aria-label="Attach file"
          title="File sending arrives in Phase 3"
          disabled
        >
          <PaperclipIcon className="text-xl" />
        </button>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={connected ? 'Type a message…' : 'Not connected'}
          disabled={!connected}
        />
        <Button
          size="md"
          className="w-10 shrink-0 px-0"
          onClick={handleSend}
          aria-label="Send"
          disabled={!connected || !draft.trim()}
        >
          <SendIcon className="text-lg" />
        </Button>
      </div>
    </Layout>
  );
}
