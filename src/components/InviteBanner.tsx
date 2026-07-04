import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { usePresenceStore } from '@/store/usePresenceStore';

/**
 * Floating banner shown on any page when a nearby device sends a connect
 * invitation. Accepting reuses the QR-link flow: navigate to the join route
 * with the code, which auto-joins.
 */
export function InviteBanner() {
  const navigate = useNavigate();
  const { invite, clearInvite } = usePresenceStore();
  if (!invite) return null;

  const accept = () => {
    const { code } = invite;
    clearInvite();
    navigate(`/connect?mode=join&code=${code}`);
  };

  return (
    <div className="fixed inset-x-0 top-3 z-50 mx-auto w-[min(26rem,calc(100%-1.5rem))]">
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-white p-3 shadow-lg dark:border-brand-800 dark:bg-slate-900">
        <p className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">
          <span className="font-semibold">{invite.device.name}</span> wants to connect
        </p>
        <Button size="sm" onClick={accept}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" onClick={clearInvite}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
