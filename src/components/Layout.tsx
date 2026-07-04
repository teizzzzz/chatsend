import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LogoIcon } from '@/components/ui/icons';

/**
 * App shell: a centered, phone-width column with a branded header. Chat lives
 * full-height, so pages control their own scrolling inside this frame. The
 * bottom tab bar is defined here but shown only on top-level routes.
 */

interface LayoutProps {
  children: ReactNode;
  /** Hide the header/frame chrome for immersive pages (e.g. chat). */
  bare?: boolean;
}

export function Layout({ children, bare = false }: LayoutProps) {
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-slate-50 dark:bg-slate-950">
      {!bare && (
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Link
            to="/"
            className="flex items-center gap-2 text-brand-600 dark:text-brand-400"
          >
            <LogoIcon className="text-xl" />
            <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              ChatSend
            </span>
          </Link>
          {!isHome && (
            <span className="ml-auto text-xs uppercase tracking-wide text-slate-400">
              {pathname.replace('/', '')}
            </span>
          )}
        </header>
      )}
      <main className={cn('flex-1 overflow-y-auto scrollbar-thin', bare && 'flex flex-col')}>
        {children}
      </main>
    </div>
  );
}
