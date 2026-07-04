import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * Applies the selected theme to the root <html> element by toggling the
 * `dark` class (Tailwind's `darkMode: 'class'`). For 'system' it follows the
 * OS preference and reacts to live changes. Mount once, near the app root.
 */
export function useTheme(): void {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      root.classList.toggle('dark', isDark);
    };

    apply();

    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);
}
