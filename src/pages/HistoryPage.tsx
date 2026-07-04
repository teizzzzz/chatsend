import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SearchIcon, TrashIcon } from '@/components/ui/icons';
import { cn, formatBytes, formatDateTime } from '@/lib/utils';
import { db, deleteMessage, clearAllMessages } from '@/services/db';
import type { Message } from '@/types';

/**
 * Transfer history, backed by IndexedDB. `useLiveQuery` keeps the list in
 * sync with writes from anywhere in the app (new messages, deletes, clear),
 * so mutations here just call the db service. Search filters in memory —
 * fine at MVP history sizes.
 */

function DirectionBadge({ direction }: { direction: Message['direction'] }) {
  const incoming = direction === 'received';
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
            {message.type === 'file' ? message.file?.name : message.content}
          </p>
          {message.type !== 'system' && <DirectionBadge direction={message.direction} />}
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
          {message.type === 'file' && message.file
            ? `${formatBytes(message.file.size)} · `
            : ''}
          {message.peerDeviceName ? `${message.peerDeviceName} · ` : ''}
          {formatDateTime(message.createdAt)}
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
  const [query, setQuery] = useState('');

  const records = useLiveQuery(
    () => db.messages.orderBy('createdAt').reverse().toArray(),
    [],
  );

  const filtered = useMemo(() => {
    if (!records) return [];
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const haystack = [r.content, r.file?.name, r.peerDeviceName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, query]);

  const handleClearAll = () => {
    if (window.confirm('Delete all transfer history? This cannot be undone.')) {
      void clearAllMessages();
    }
  };

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
            disabled={!records || records.length === 0}
          >
            Clear
          </Button>
        </div>

        {records && filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">
            {records.length === 0 ? 'No history yet.' : 'No matching records.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <HistoryRow
                key={r.id}
                message={r}
                onDelete={(id) => void deleteMessage(id)}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
