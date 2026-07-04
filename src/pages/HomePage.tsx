import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import {
  PlusIcon,
  LinkIcon,
  HistoryIcon,
  SettingsIcon,
} from '@/components/ui/icons';
import { useAppStore } from '@/store/useAppStore';
import { usePresenceStore } from '@/store/usePresenceStore';

/**
 * Landing screen. Four primary entry points required by the MVP: create a
 * connection, join one, view history, and open settings. Phase 0 wires the
 * navigation only — the actual pairing happens in a later phase.
 */

interface ActionProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  accent?: boolean;
}

function Action({ icon, title, subtitle, onClick, accent }: ActionProps) {
  return (
    <Card
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 p-4 transition-transform active:scale-[0.99]"
    >
      <div
        className={
          accent
            ? 'flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-xl text-white'
            : 'flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-600 dark:bg-slate-800 dark:text-slate-300'
        }
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>
    </Card>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const deviceName = useAppStore((s) => s.deviceName);
  const nearby = usePresenceStore((s) => s.nearby);

  return (
    <Layout>
      <div className="space-y-6 p-5">
        <section>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Send files like messages
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This device: <span className="font-medium">{deviceName}</span>
          </p>
        </section>

        <div className="space-y-3">
          <Action
            accent
            icon={<PlusIcon />}
            title="Create connection"
            subtitle="Generate a code and wait for a peer"
            onClick={() => navigate('/connect?mode=create')}
          />
          <Action
            icon={<LinkIcon />}
            title="Join connection"
            subtitle="Enter a 6-digit code to pair"
            onClick={() => navigate('/connect?mode=join')}
          />
          <Action
            icon={<HistoryIcon />}
            title="History"
            subtitle="Browse and search past transfers"
            onClick={() => navigate('/history')}
          />
          <Action
            icon={<SettingsIcon />}
            title="Settings"
            subtitle="Device name, theme, clear data"
            onClick={() => navigate('/settings')}
          />
        </div>

        {nearby.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Nearby devices
            </h2>
            <div className="space-y-2">
              {nearby.map((device) => (
                <Card
                  key={device.id}
                  onClick={() => navigate(`/connect?mode=create&invite=${device.id}`)}
                  className="flex cursor-pointer items-center gap-3 p-3 transition-transform active:scale-[0.99]"
                >
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {device.name}
                    </p>
                    <p className="text-xs text-slate-400">Same network · tap to connect</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
