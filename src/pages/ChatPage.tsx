import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BackIcon, PaperclipIcon, SendIcon } from '@/components/ui/icons';
import { cn, formatTime } from '@/lib/utils';
import type { Message } from '@/types';
import { useSessionStore, type SessionStatus } from '@/store/useSessionStore';

/**
 * The chat-style transfer surface. Header shows the live peer name and
 * connection status from the session store; the timeline renders the
 * session's messages (system events only in Phase 1 — text lands in Phase 2,
 * so the composer is present but disabled).
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

export function ChatPage() {
  const navigate = useNavigate();
  const { status, peer, messages, leave } = useSessionStore();
  const connected = status === 'connected';

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
      <div className="flex-1 space-y-2 overflow-y-auto scrollbar-thin p-4">
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
          messages.map((m) => <SystemChip key={m.id} message={m} />)
        )}
      </div>

      {/* Composer — enabled in Phase 2 (text over the DataChannel). */}
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
          placeholder={connected ? 'Text messages arrive in Phase 2' : 'Not connected'}
          disabled
        />
        <Button size="md" className="w-10 shrink-0 px-0" aria-label="Send" disabled>
          <SendIcon className="text-lg" />
        </Button>
      </div>
    </Layout>
  );
}
