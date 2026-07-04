import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { clearAllMessages } from '@/services/db';
import type { ThemeMode } from '@/types';

/**
 * Settings: rename this device, switch theme, and clear history. Device name
 * and theme persist via the app store (localStorage). Clearing history will
 * wipe the IndexedDB store once it exists; in Phase 0 it's a stub.
 */

const THEMES: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {description && (
        <p className="mb-3 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const {
    deviceName,
    setDeviceName,
    theme,
    setTheme,
    saveHistory,
    setSaveHistory,
    trustedDevices,
    untrustDevice,
  } = useAppStore();
  const [nameDraft, setNameDraft] = useState(deviceName);
  const saved = nameDraft.trim() === deviceName;

  const handleClearHistory = () => {
    if (window.confirm('Delete all transfer history? This cannot be undone.')) {
      void clearAllMessages();
    }
  };

  return (
    <Layout>
      <div className="space-y-4 p-5">
        <Section
          title="Device name"
          description="Shown to peers when you connect."
        >
          <div className="flex gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="My Device"
            />
            <Button onClick={() => setDeviceName(nameDraft)} disabled={saved}>
              Save
            </Button>
          </div>
        </Section>

        <Section title="Appearance">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                  theme === t.value
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Trusted devices"
          description="Files from trusted devices are accepted automatically. Trust a device from the chat header while connected."
        >
          {Object.keys(trustedDevices).length === 0 ? (
            <p className="text-sm text-slate-400">No trusted devices yet.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(trustedDevices).map(([id, info]) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                    {info.name}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => untrustDevice(id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Data"
          description="History is stored only on this device."
        >
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Save transfer history
              </span>
              <button
                role="switch"
                aria-checked={saveHistory}
                onClick={() => setSaveHistory(!saveHistory)}
                className={cn(
                  'relative h-6 w-11 rounded-full transition-colors',
                  saveHistory ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    saveHistory ? 'translate-x-[22px]' : 'translate-x-0.5',
                  )}
                />
              </button>
            </label>
            <Button variant="danger" onClick={handleClearHistory}>
              Clear all history
            </Button>
          </div>
        </Section>

        <p className="pt-2 text-center text-xs text-slate-400">
          ChatSend v0.8.0 · MVP
        </p>
      </div>
    </Layout>
  );
}
