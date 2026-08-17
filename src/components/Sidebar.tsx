import { ClipboardList, House, MessagesSquare, Search, Settings, type LucideIcon } from 'lucide-react';
import { NAV_ITEMS, type DashboardTab } from '../router';
import type { RunMode } from '../../shared/enums';
import { Badge, StatusDot } from './ui';

const ICONS: Record<DashboardTab, LucideIcon> = {
  home: House,
  jobs: Search,
  messages: MessagesSquare,
  applications: ClipboardList,
  settings: Settings,
};

export function Sidebar({
  activeTab,
  onSelect,
  runMode,
}: {
  activeTab: DashboardTab;
  onSelect: (tab: DashboardTab) => void;
  runMode: RunMode;
}) {
  const mainItems = NAV_ITEMS.filter((i) => i.tab !== 'settings');
  const settingsItem = NAV_ITEMS.find((i) => i.tab === 'settings');

  const renderItem = (item: { tab: DashboardTab; label: string }) => {
    const Icon = ICONS[item.tab];
    return (
      <button
        key={item.tab}
        className={`nav-item ${activeTab === item.tab ? 'nav-item--active' : ''}`}
        onClick={() => onSelect(item.tab)}
        aria-current={activeTab === item.tab ? 'page' : undefined}
      >
        <Icon size={17} strokeWidth={1.8} />
        {item.label}
      </button>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <StatusDot variant="agent" />
        JobPilot
      </div>

      <nav className="sidebar__nav">
        {mainItems.map(renderItem)}

        <div className="sidebar__group-label">系统</div>
        {settingsItem ? renderItem(settingsItem) : null}
      </nav>

      <div className="sidebar__foot">
        {runMode === 'TEST' ? <Badge variant="test">测试模式</Badge> : <Badge variant="agent">正式模式</Badge>}
      </div>
    </aside>
  );
}
