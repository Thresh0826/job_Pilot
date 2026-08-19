import { AppShell } from '../components/AppShell';
import { useAppStore } from '../stores/useAppStore';
import Home from './Home';
import Jobs from './Jobs';
import Profile from './Profile';
import Messages from './Messages';
import Applications from './Applications';
import Settings from './Settings';

export default function Dashboard() {
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <AppShell>
      {activeTab === 'home' && <Home />}
      {activeTab === 'jobs' && <Jobs />}
      {activeTab === 'profile' && <Profile />}
      {activeTab === 'messages' && <Messages />}
      {activeTab === 'applications' && <Applications />}
      {activeTab === 'settings' && <Settings />}
    </AppShell>
  );
}
