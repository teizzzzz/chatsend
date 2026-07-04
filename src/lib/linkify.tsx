import type { ReactNode } from 'react';

/**
 * Render text with URLs turned into safe external links (req §5.3: URLs are
 * auto-recognised). Kept out of utils.ts because it produces JSX.
 */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

export function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <a
        key={`${start}-${match[0]}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all underline underline-offset-2"
      >
        {match[0]}
      </a>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
