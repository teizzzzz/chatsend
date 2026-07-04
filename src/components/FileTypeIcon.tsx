import { FileIcon, FilmIcon, ImageIcon } from '@/components/ui/icons';
import { fileCategory, type FileCategory } from '@/lib/fileKind';
import { cn } from '@/lib/utils';
import type { FileMeta } from '@/types';

/**
 * Colored, category-aware file icon (req P1: 文件类型图标). Used in chat file
 * bubbles and history rows so a PDF, a photo, and an archive are visually
 * distinct at a glance.
 */

const ICON: Record<FileCategory, typeof FileIcon> = {
  image: ImageIcon,
  video: FilmIcon,
  audio: FilmIcon,
  document: FileIcon,
  archive: FileIcon,
  other: FileIcon,
};

const TINT: Record<FileCategory, string> = {
  image: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  video: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
  audio: 'bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300',
  document: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
  archive: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
  other: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
};

export function FileTypeIcon({
  file,
  className,
}: {
  file: FileMeta;
  className?: string;
}) {
  const category = fileCategory(file);
  const Icon = ICON[category];
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-xl',
        TINT[category],
        className ?? 'h-10 w-10 text-lg',
      )}
    >
      <Icon />
    </div>
  );
}
