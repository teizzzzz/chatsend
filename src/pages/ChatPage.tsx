import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  BackIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  PaperclipIcon,
  SendIcon,
} from '@/components/ui/icons';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { zipFolder } from '@/services/folderZip';
import { cn, formatBytes, formatTime } from '@/lib/utils';
import { linkify } from '@/lib/linkify';
import type { Message } from '@/types';
import { useSessionStore, type SessionStatus } from '@/store/useSessionStore';
import { useAppStore } from '@/store/useAppStore';

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

/**
 * File message bubble. Renders the offer / progress / result lifecycle:
 * receiver gets Accept & Decline while pending and a Download link when
 * complete; sender sees progress and can Cancel in flight or Retry after
 * failure / rejection / cancellation (req §5.2).
 */
function FileBubble({ message }: { message: Message }) {
  const sent = message.direction === 'sent';
  const { transferring, fileUrls, acceptFile, rejectFile, cancelTransfer, retryFile } =
    useSessionStore();
  const file = message.file;
  if (!file) return null;
  const url = fileUrls[message.id];

  return (
    <div className={cn('flex', sent ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'w-[78%] max-w-[78%] rounded-2xl px-3.5 py-3 text-sm shadow-sm',
          sent
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100',
        )}
      >
        {/* File identity */}
        <div className="flex items-center gap-3">
          <FileTypeIcon file={file} />
          <div className="min-w-0">
            <p className="truncate font-medium">{file.name}</p>
            <p className={cn('text-xs', sent ? 'text-brand-100' : 'text-slate-400')}>
              {formatBytes(file.size)}
              {file.extension ? ` · ${file.extension.toUpperCase()}` : ''}
            </p>
          </div>
        </div>

        {/* Lifecycle-specific row */}
        <div className="mt-2.5">
          {message.status === 'pending' &&
            (sent ? (
              <div className="flex items-center justify-between gap-2">
                <p className={cn('text-xs', sent ? 'text-brand-100' : 'text-slate-400')}>
                  Waiting for peer to accept…
                </p>
                <BubbleAction onClick={() => cancelTransfer(message.id)} sent={sent}>
                  Cancel
                </BubbleAction>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => acceptFile(message.id)}
                  disabled={transferring}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => rejectFile(message.id)}
                >
                  Decline
                </Button>
              </div>
            ))}

          {message.status === 'transferring' && (
            <div className="space-y-1.5">
              <div
                className={cn(
                  'h-1.5 w-full overflow-hidden rounded-full',
                  sent ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700',
                )}
              >
                <div
                  className={cn('h-full rounded-full transition-[width]', sent ? 'bg-white' : 'bg-brand-500')}
                  style={{ width: `${message.progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={sent ? 'text-brand-100' : 'text-slate-400'}>
                  {message.progress}%
                </span>
                <BubbleAction onClick={() => cancelTransfer(message.id)} sent={sent}>
                  Cancel
                </BubbleAction>
              </div>
            </div>
          )}

          {message.status === 'completed' &&
            (sent ? (
              <p className="text-xs text-brand-100">Sent ✓</p>
            ) : url ? (
              <a
                href={url}
                download={file.name}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                <DownloadIcon /> Download
              </a>
            ) : (
              <p className="text-xs text-slate-400">Received</p>
            ))}

          {(message.status === 'rejected' ||
            message.status === 'cancelled' ||
            message.status === 'failed') && (
            <div className="flex items-center justify-between gap-2">
              <p className={cn('text-xs', sent ? 'text-brand-100' : 'text-slate-400')}>
                {message.status === 'rejected'
                  ? sent
                    ? 'Declined by peer'
                    : 'Declined'
                  : message.status === 'cancelled'
                    ? 'Cancelled'
                    : (message.error ?? 'Transfer failed')}
              </p>
              {sent && (
                <BubbleAction onClick={() => retryFile(message.id)} sent={sent}>
                  Retry
                </BubbleAction>
              )}
            </div>
          )}
        </div>

        <p className={cn('mt-1.5 text-right text-[10px]', sent ? 'text-brand-100' : 'text-slate-400')}>
          {formatTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

/** Small inline text action used inside bubbles (Cancel / Retry). */
function BubbleAction({
  onClick,
  sent,
  children,
}: {
  onClick: () => void;
  sent: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 text-xs font-medium underline underline-offset-2',
        sent ? 'text-white/90 hover:text-white' : 'text-brand-600 dark:text-brand-400',
      )}
    >
      {children}
    </button>
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const {
    status,
    peer,
    messages,
    transferring,
    verificationCode,
    sendText,
    sendFiles,
    leave,
  } = useSessionStore();
  const { trustedDevices, trustDevice, untrustDevice } = useAppStore();
  const [draft, setDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [zipping, setZipping] = useState(false);
  const dragDepth = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const connected = status === 'connected';

  // Folder pick → pack into one zip → normal file pipeline.
  const handleFolder = async (files: File[]) => {
    if (files.length === 0) return;
    setZipping(true);
    try {
      sendFiles([await zipFolder(files)]);
    } finally {
      setZipping(false);
    }
  };

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

  // Drag & drop anywhere on the chat surface. Depth counter because
  // dragenter/dragleave also fire on every child element.
  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragOver(true);
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (!connected) return;
    const files = [...e.dataTransfer.files];
    if (files.length) sendFiles(files);
  };

  return (
    <Layout bare>
      <div
        data-dropzone
        className="relative flex min-h-0 flex-1 flex-col"
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
      {dragOver && connected && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-500 bg-brand-50/90 dark:bg-brand-900/40">
          <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
            Drop files to send
          </p>
        </div>
      )}
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
            <span>{STATUS_LABEL[status]}</span>
            {connected && verificationCode && (
              <span
                className="font-mono text-slate-400"
                title="Security verification code — identical on both devices when the connection is untampered"
                data-testid="verification-code"
              >
                · {verificationCode.slice(0, 3)} {verificationCode.slice(3)}
              </span>
            )}
          </p>
        </div>
        {connected && peer && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              trustedDevices[peer.id]
                ? untrustDevice(peer.id)
                : trustDevice(peer.id, peer.name)
            }
            title={
              trustedDevices[peer.id]
                ? 'Files from this device are accepted automatically'
                : 'Trust this device to auto-accept its files'
            }
          >
            {trustedDevices[peer.id] ? 'Trusted ✓' : 'Trust'}
          </Button>
        )}
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
            ) : m.type === 'file' ? (
              <FileBubble key={m.id} message={m} />
            ) : (
              <TextBubble key={m.id} message={m} />
            ),
          )
        )}
      </div>

      {/* Composer (bottom padding respects the home-indicator safe area) */}
      <div className="flex items-center gap-2 border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) sendFiles(files);
            e.target.value = ''; // allow re-picking the same file
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
          onChange={(e) => {
            void handleFolder([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            connected && !transferring && !zipping
              ? 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'text-slate-300 dark:text-slate-700',
          )}
          aria-label="Attach file"
          title={transferring ? 'A transfer is already in progress' : 'Send a file'}
          disabled={!connected || transferring || zipping}
        >
          <PaperclipIcon className="text-xl" />
        </button>
        <button
          onClick={() => folderInputRef.current?.click()}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            connected && !transferring && !zipping
              ? 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              : 'text-slate-300 dark:text-slate-700',
          )}
          aria-label="Attach folder"
          title={zipping ? 'Packing folder…' : 'Send a folder (packed as zip)'}
          disabled={!connected || transferring || zipping}
        >
          <FolderIcon className="text-xl" />
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
      </div>
    </Layout>
  );
}
