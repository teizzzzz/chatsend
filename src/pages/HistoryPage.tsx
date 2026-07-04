import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MessageIcon, SearchIcon, TrashIcon } from '@/components/ui/icons';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { HistoryCalendar, dayKeyOf } from '@/components/HistoryCalendar';
import { cn, formatBytes, formatDateTime } from '@/lib/utils';
import { fileCategory } from '@/lib/fileKind';
import { db, deleteMessage, clearAllMessages } from '@/services/db';
import type { Message } from '@/types';

/**
 * Transfer history, backed by IndexedDB (`useLiveQuery` keeps it in sync
 * with writes from anywhere in the app). Filter chips implement req §7.4
 * (all / sent / received / images / videos / documents / failed) and a
 * device dropdown implements per-device filtering (req §5.5). Search and
 * filtering run in memory — fine at MVP history sizes.
 */

type FilterKey = 'all' | 'sent' | 'received' | 'image' | 'video' | 'document' | 'failed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'received', label: 'Received' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
  { key: 'document', label: 'Documents' },
  { key: 'failed', label: 'Failed' },
];

/** Non-successful outcomes grouped under the "Failed" chip. */
const FAILED_STATUSES: Message['status'][] = ['failed', 'rejected', 'cancelled'];

function matchesFilter(message: Message, filter: FilterKey): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'sent':
    case 'received':
      return message.type !== 'system' && message.direction === filter;
    case 'failed':
      return FAILED_STATUSES.includes(message.status);
    case 'image':
    case 'video':
    case 'document':
      return (
        message.type === 'file' && !!message.file && fileCategory(message.file) === filter
      );
  }
}

function RowIcon({ message }: { message: Message }) {
  if (message.type === 'file' && message.file) {
    return <FileTypeIcon file={message.file} className="h-9 w-9 text-base" />;
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base text-slate-500 dark:bg-slate-800 dark:text-slate-300">
      <MessageIcon />
    </div>
  );
}

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

function StatusBadge({ status }: { status: Message['status'] }) {
  if (!FAILED_STATUSES.includes(status)) return null;
  const label =
    status === 'failed' ? 'Failed' : status === 'rejected' ? 'Declined' : 'Cancelled';
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
      {label}
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
      <RowIcon message={message} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-slate-900 dark:text-slate-100">
            {message.type === 'file' ? message.file?.name : message.content}
          </p>
          {message.type !== 'system' && <DirectionBadge direction={message.direction} />}
          <StatusBadge status={message.status} />
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
  const [filter, setFilter] = useState<FilterKey>('all');
  const [device, setDevice] = useState<string>('all');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const records = useLiveQuery(
    () => db.messages.orderBy('createdAt').reverse().toArray(),
    [],
  );

  const devices = useMemo(() => {
    const names = new Set<string>();
    for (const r of records ?? []) if (r.peerDeviceName) names.add(r.peerDeviceName);
    return [...names].sort();
  }, [records]);

  const filtered = useMemo(() => {
    if (!records) return [];
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (device !== 'all' && r.peerDeviceName !== device) return false;
      if (view === 'calendar' && selectedDay && dayKeyOf(r.createdAt) !== selectedDay)
        return false;
      if (!q) return true;
      const haystack = [r.content, r.file?.name, r.peerDeviceName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [records, query, filter, device, view, selectedDay]);

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

        {/* View toggle: flat list vs calendar month grid */}
        <div className="grid grid-cols-2 gap-2">
          {(['list', 'calendar'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-xl border px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                view === v
                  ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {v}
            </button>
          ))}
        </div>

        {view === 'calendar' && records && (
          <HistoryCalendar
            records={records}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
        )}

        {/* Filter chips (req §7.4) */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Device filter (req §5.5) */}
        {devices.length > 0 && (
          <select
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            aria-label="Filter by device"
            className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All devices</option>
            {devices.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}

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
