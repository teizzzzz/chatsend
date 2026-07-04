import type { FileMeta } from '@/types';

/**
 * File chunking (sender) and reassembly (receiver) for DataChannel transfer.
 * Pure logic, no React and no knowledge of the channel itself — the caller
 * supplies a `send` function, so this is trivially unit-testable.
 */

/** 64 KiB chunks: safely under every browser's DataChannel message limit. */
export const CHUNK_SIZE = 64 * 1024;

export function makeFileMeta(file: File): FileMeta {
  const dot = file.name.lastIndexOf('.');
  return {
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    extension: dot > 0 ? file.name.slice(dot + 1).toLowerCase() : '',
    chunkSize: CHUNK_SIZE,
    totalChunks: Math.max(1, Math.ceil(file.size / CHUNK_SIZE)),
  };
}

export type PumpResult = 'completed' | 'cancelled' | 'failed';

/**
 * Read `file` slice by slice and push each chunk through `send` (which is
 * expected to apply backpressure). Reports cumulative bytes after each chunk
 * so the caller can render a percentage.
 */
export async function pumpFile(
  file: File,
  send: (chunk: ArrayBuffer) => Promise<boolean>,
  onProgress: (sentBytes: number) => void,
  isCancelled: () => boolean,
): Promise<PumpResult> {
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    if (isCancelled()) return 'cancelled';
    let chunk: ArrayBuffer;
    try {
      chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    } catch {
      return 'failed'; // file became unreadable (e.g. removed drive)
    }
    if (!(await send(chunk))) {
      return isCancelled() ? 'cancelled' : 'failed';
    }
    onProgress(Math.min(offset + CHUNK_SIZE, file.size));
  }
  return 'completed';
}

/** Collects incoming binary chunks and produces the final Blob. */
export class ChunkAssembler {
  private readonly parts: ArrayBuffer[] = [];
  private receivedBytes = 0;

  constructor(readonly meta: FileMeta) {}

  append(chunk: ArrayBuffer): void {
    this.parts.push(chunk);
    this.receivedBytes += chunk.byteLength;
  }

  get received(): number {
    return this.receivedBytes;
  }

  get done(): boolean {
    return this.receivedBytes >= this.meta.size;
  }

  toBlob(): Blob {
    return new Blob(this.parts, { type: this.meta.mimeType });
  }
}
