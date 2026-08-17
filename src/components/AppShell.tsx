import type { ReactNode } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { Badge } from './ui';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const runMode = useAppStore((s) => s.runMode);

  return (
    <div className="shell">
      <Sidebar activeTab={activeTab} onSelect={setActiveTab} runMode={runMode} />

      <div className="main">
        <div className="topbar">
          {runMode === 'TEST' ? <Badge variant="test">测试模式</Badge> : null}
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
