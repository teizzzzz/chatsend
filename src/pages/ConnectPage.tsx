import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BackIcon } from '@/components/ui/icons';
import { createConnectionCode } from '@/lib/utils';

/**
 * Pairing screen with two modes selected via the `?mode=` query param:
 *  - create: show a generated 6-digit code for the peer to enter.
 *  - join: enter the peer's code.
 *
 * Phase 0 renders the UI and generates a placeholder code. The WebSocket
 * signalling + WebRTC negotiation that actually pairs devices arrives in a
 * later phase; the "Continue" buttons are stubbed to the chat route.
 */
export function ConnectPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'join' ? 'join' : 'create';

  // Generated once per visit in create mode. Real rooms come from the server.
  const generatedCode = useMemo(() => createConnectionCode(), []);
  const [joinCode, setJoinCode] = useState('');

  return (
    <Layout>
      <div className="space-y-6 p-5">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <BackIcon /> Back
        </button>

        {mode === 'create' ? (
          <section className="space-y-4">
            <h1 className="text-xl font-bold">Your connection code</h1>
            <Card className="p-6 text-center">
              <p className="font-mono text-4xl font-bold tracking-[0.3em] text-brand-600 dark:text-brand-400">
                {generatedCode}
              </p>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Enter this code on the other device to connect.
              </p>
            </Card>
            <p className="text-center text-sm text-slate-400">
              Waiting for a peer to join…
            </p>
            <Button
              className="w-full"
              onClick={() => navigate('/chat')}
              disabled
              title="Signalling not implemented yet (Phase 0)"
            >
              Waiting…
            </Button>
          </section>
        ) : (
          <section className="space-y-4">
            <h1 className="text-xl font-bold">Enter connection code</h1>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
              autoFocus
            />
            <Button
              className="w-full"
              disabled={joinCode.length !== 6}
              onClick={() => navigate('/chat')}
            >
              Connect
            </Button>
            <p className="text-center text-xs text-slate-400">
              Pairing is stubbed in Phase 0 — this only navigates for now.
            </p>
          </section>
        )}
      </div>
    </Layout>
  );
}
