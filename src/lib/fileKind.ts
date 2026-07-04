/**
 * Coarse file categorisation for filter chips and type icons (req §7.4).
 * MIME type is checked first (set by the sender's browser); extension is the
 * fallback for files whose type the OS didn't know.
 */

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'archive' | 'other';

const DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'odt', 'ods', 'odp', 'epub',
]);
const ARCHIVE_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);

export function fileCategory(file: { mimeType?: string; extension?: string }): FileCategory {
  const mime = file.mimeType ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document';

  const ext = (file.extension ?? '').toLowerCase();
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) return 'audio';
  return 'other';
}
