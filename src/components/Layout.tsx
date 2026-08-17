import type { ReactNode } from 'react';
import {
  ClipboardList,
  Home,
  MessageSquare,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { NAV_ITEMS, type DashboardTab } from '../router';
import { useAppStore } from '../stores/useAppStore';
import { Badge } from './ui';

const ICONS: Record<DashboardTab, LucideIcon> = {
  home: Home,
  jobs: Search,
  messages: MessageSquare,
  applications: ClipboardList,
  settings: Settings,
};

export function Layout({ children }: { children: ReactNode }) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const runMode = useAppStore((s) => s.runMode);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo">J</div>
          <span className="sidebar__name">JobPilot</span>
        </div>
        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.tab];
            return (
              <button
                key={item.tab}
                className={`nav-item ${activeTab === item.tab ? 'nav-item--active' : ''}`}
                onClick={() => setActiveTab(item.tab)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar__foot">
          {runMode === 'TEST' ? <Badge variant="test">测试模式</Badge> : <Badge variant="accent">正式模式</Badge>}
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          {runMode === 'TEST' ? <Badge variant="test">TEST MODE</Badge> : null}
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
