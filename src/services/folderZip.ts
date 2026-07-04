import { zip } from 'fflate';

/**
 * Folder transfer (req P2: 文件夹传输): a picked folder is packed into a
 * single zip on the sending device — structure preserved via each file's
 * webkitRelativePath — and then travels through the ordinary file-transfer
 * pipeline. The receiver gets one `<folder>.zip` download.
 *
 * Files are read fully into memory before zipping, so this suits
 * documents/photos-sized folders rather than multi-GB trees (the same
 * constraint the in-memory ChunkAssembler already implies).
 */

/** Folder name from the first path segment, e.g. "docs/a/b.txt" → "docs". */
export function folderNameOf(files: File[]): string {
  const rel = files[0]?.webkitRelativePath ?? '';
  const top = rel.split('/')[0];
  return top || 'folder';
}

/** Pack a webkitdirectory file list into a single zip File. */
export async function zipFolder(files: File[]): Promise<File> {
  const name = folderNameOf(files);
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    entries[path] = new Uint8Array(await file.arrayBuffer());
  }
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    // level 0 = store: no compression latency; the DataChannel is the
    // bottleneck and media files rarely compress anyway.
    zip(entries, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out)));
  });
  return new File([bytes.slice().buffer], `${name}.zip`, { type: 'application/zip' });
}
