import { useEffect } from 'react';
import { useAppStore } from './stores/useAppStore';
import { ToastHost } from './components/ui';
import Welcome from './pages/Welcome';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';

export default function App() {
  const bootstrapped = useAppStore((s) => s.bootstrapped);
  const phase = useAppStore((s) => s.phase);
  const bootstrap = useAppStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <div className="app">
      {!bootstrapped ? (
        <div className="splash">
          <div className="splash__mark">
            <span className="splash__dot" />
            JobPilot
          </div>
        </div>
      ) : phase === 'welcome' ? (
        <Welcome />
      ) : phase === 'onboarding' ? (
        <Onboarding />
      ) : (
        <Dashboard />
      )}
      <ToastHost />
    </div>
  );
}
