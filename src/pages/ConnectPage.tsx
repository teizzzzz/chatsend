import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { Layout } from '@/components/Layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BackIcon } from '@/components/ui/icons';
import { useSessionStore } from '@/store/useSessionStore';

/**
 * Pairing screen, driven by the session store. Two modes via `?mode=`:
 *  - create: request a room, display the 6-character code + a QR code that
 *    encodes the join link, wait for a guest.
 *  - join: enter the peer's code (or arrive with ?code= from a scanned QR,
 *    which auto-joins) and connect.
 * Both modes auto-navigate to /chat once the DataChannel opens.
 */
export function ConnectPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode') === 'join' ? 'join' : 'create';
  const codeParam = params.get('code');

  const { status, code, error, createRoom, joinRoom, leave } = useSessionStore();
  const [joinCode, setJoinCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);

  // Host mode: render a QR of the join link so the other device can scan
  // instead of typing (req §5.1).
  useEffect(() => {
    if (mode !== 'create' || !code) {
      setQr(null);
      return;
    }
    const joinUrl = `${window.location.origin}/connect?mode=join&code=${code}`;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 192 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [mode, code]);

  // Scanned-QR path: /connect?mode=join&code=ABC123 joins immediately.
  // Gate on live store status (not a ref): the unmount cleanup calls leave(),
  // so under StrictMode's double mount the second run re-joins cleanly.
  useEffect(() => {
    if (mode !== 'join' || codeParam?.length !== 6) return;
    if (useSessionStore.getState().status !== 'idle') return;
    setJoinCode(codeParam.toUpperCase());
    void joinRoom(codeParam);
  }, [mode, codeParam, joinRoom]);

  // Host mode: create the room on arrival; abandon it if the user leaves
  // before a connection is made (StrictMode's double mount is handled by the
  // store's epoch guard — the second createRoom supersedes the first).
  useEffect(() => {
    if (mode === 'create') void createRoom();
    return () => {
      if (useSessionStore.getState().status !== 'connected') leave();
    };
  }, [mode, createRoom, leave]);

  // Success path for both modes.
  useEffect(() => {
    if (status === 'connected') navigate('/chat');
  }, [status, navigate]);

  const busy = status === 'connecting' || status === 'joining' || status === 'negotiating';

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
              {code ? (
                <p className="font-mono text-4xl font-bold tracking-[0.3em] text-brand-600 dark:text-brand-400">
                  {code}
                </p>
              ) : (
                <p className="animate-pulse font-mono text-4xl font-bold tracking-[0.3em] text-slate-300 dark:text-slate-700">
                  ······
                </p>
              )}
              {qr && (
                <img
                  src={qr}
                  alt="QR code to join"
                  className="mx-auto mt-4 h-40 w-40 rounded-lg bg-white p-1"
                />
              )}
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Enter this code on the other device — or scan the QR code.
              </p>
            </Card>

            <StatusLine status={status} error={error} host />

            {status === 'failed' && (
              <Button className="w-full" onClick={() => void createRoom()}>
                Try again
              </Button>
            )}
          </section>
        ) : (
          <section className="space-y-4">
            <h1 className="text-xl font-bold">Enter connection code</h1>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && joinCode.length === 6 && !busy) {
                  void joinRoom(joinCode);
                }
              }}
              placeholder="ABC123"
              className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
              autoFocus
              disabled={busy}
            />
            <Button
              className="w-full"
              disabled={joinCode.length !== 6 || busy}
              onClick={() => void joinRoom(joinCode)}
            >
              {busy ? 'Connecting…' : 'Connect'}
            </Button>

            <StatusLine status={status} error={error} />
          </section>
        )}
      </div>
    </Layout>
  );
}

function StatusLine({
  status,
  error,
  host = false,
}: {
  status: ReturnType<typeof useSessionStore.getState>['status'];
  error: string | null;
  host?: boolean;
}) {
  if (status === 'failed' && error) {
    return <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  const text: Partial<Record<typeof status, string>> = {
    connecting: 'Contacting server…',
    waiting: host ? 'Waiting for a peer to join…' : undefined,
    joining: 'Joining room…',
    negotiating: 'Peer found — establishing direct connection…',
  };
  const label = text[status];
  if (!label) return null;
  return <p className="text-center text-sm text-slate-400">{label}</p>;
}
