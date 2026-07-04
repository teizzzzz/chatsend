import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { ConnectPage } from '@/pages/ConnectPage';
import { ChatPage } from '@/pages/ChatPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { InviteBanner } from '@/components/InviteBanner';
import { usePresenceStore } from '@/store/usePresenceStore';
import { useTheme } from '@/lib/useTheme';

/**
 * Root component: applies the theme, starts nearby-device presence, and
 * declares the route table. Routes map 1:1 to the MVP screens. Keeping
 * routing flat here means pages stay unaware of each other and navigation
 * lives in one readable place.
 */
export default function App() {
  useTheme();
  const initPresence = usePresenceStore((s) => s.init);
  useEffect(() => initPresence(), [initPresence]);

  return (
    <>
      <InviteBanner />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {/* Unknown routes fall back to home. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
