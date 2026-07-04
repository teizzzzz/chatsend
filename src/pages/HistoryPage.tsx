import { useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchIcon, TrashIcon } from '@/components/ui/icons';
import { cn, formatBytes, formatDateTime } from '@/lib/utils';
import type { Message } from '@/types';

/**
 * Transfer history. Shows text + file records with search, per-row delete, and
 * clear-all. Phase 0 renders sample records from local state; a later phase
 * backs this with IndexedDB (Dexie) queries. The filtering/rendering logic
 * here is written against the `Message` type so swapping the data source is a
 * drop-in change.
 */

const SAMPLE: Message[] = [
  {
    id: 'h1',
    sessionId: 's1',
    kind: 'file',
    direction: 'outgoing',
    status: 'sent',
    file: { id: 'f1', name: 'vacation.zip', size: 24_500_000, mimeType: 'application/zip' },
    peerName: "Alex's Laptop",
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: 'h2',
    sessionId: 's1',
    kind: 'text',
    direction: 'incoming',
    status: 'received',
    text: 'Thanks, got the files!',
    peerName: "Alex's Laptop",
    createdAt: Date.now() - 1000 * 60 * 60 * 3 + 5000,
  },
  {
    id: 'h3',
    sessionId: 's2',
    kind: 'file',
    direction: 'incoming',
    status: 'received',
    file: { id: 'f2', name: 'slides.pdf', size: 3_200_000, mimeType: 'application/pdf' },
    peerName: 'Meeting Room PC',
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
  },
];

function DirectionBadge({ direction }: { direction: Message['direction'] }) {
  const incoming = direction === 'incoming';
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium',
        incoming
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
      )}
    >
      {incoming ? 'Received' : 'Sent'}
    </span>
  );
}

function HistoryRow({
  message,
  onDelete,
}: {
  message: Message;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            {message.kind === 'file' ? message.file?.name : message.text}
          </p>
          <DirectionBadge direction={message.direction} />
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {message.kind === 'file' && message.file
            ? `${formatBytes(message.file.size)} · `
            : ''}
          {message.peerName} · {formatDateTime(message.createdAt)}
        </p>
      </div>
      <button
        onClick={() => onDelete(message.id)}
        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
        aria-label="Delete record"
      >
        <TrashIcon />
      </button>
    </Card>
  );
}

export function HistoryPage() {
  const [records, setRecords] = useState<Message[]>(SAMPLE);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const haystack = [r.text, r.file?.name, r.peerName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, query]);

  const handleDelete = (id: string) =>
    setRecords((prev) => prev.filter((r) => r.id !== id));
  const handleClearAll = () => setRecords([]);

  return (
    <Layout>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              className="pl-9"
            />
          </div>
          <Button
            variant="danger"
            size="md"
            onClick={handleClearAll}
            disabled={records.length === 0}
          >
            Clear
          </Button>
        </div>

        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            {records.length === 0 ? 'No history yet.' : 'No matching records.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <HistoryRow key={r.id} message={r} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
