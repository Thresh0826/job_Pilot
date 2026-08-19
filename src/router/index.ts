/** 应用顶层阶段。 */
export type AppPhase = 'welcome' | 'onboarding' | 'dashboard';

/** Dashboard 主导航标签。 */
export type DashboardTab = 'home' | 'jobs' | 'profile' | 'messages' | 'applications' | 'settings';

export interface NavItem {
  tab: DashboardTab;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { tab: 'home', label: '首页' },
  { tab: 'jobs', label: '找工作' },
  { tab: 'profile', label: '我的资料' },
  { tab: 'messages', label: '沟通' },
  { tab: 'applications', label: '投递记录' },
  { tab: 'settings', label: '设置' },
];
