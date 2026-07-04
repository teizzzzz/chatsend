import Dexie, { type Table } from 'dexie';
import type { Message } from '@/types';

/**
 * Local persistence (IndexedDB via Dexie). Transfer history never leaves the
 * device — this is the only place it's stored (requirements §6.1).
 *
 * `messages` doubles as the chat timeline record and the history record; the
 * history page queries it directly. Indexes cover the access patterns we
 * have: newest-first listing (createdAt) and per-session lookup (sessionId).
 */
class ChatSendDB extends Dexie {
  messages!: Table<Message, string>;

  constructor() {
    super('chatsend');
    this.version(1).stores({
      // Primary key `id`, plus secondary indexes.
      messages: 'id, sessionId, createdAt, type, direction',
    });
  }
}

export const db = new ChatSendDB();

/** Insert or update one history record. */
export async function saveMessage(message: Message): Promise<void> {
  await db.messages.put(message);
}

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id);
}

export async function clearAllMessages(): Promise<void> {
  await db.messages.clear();
}
