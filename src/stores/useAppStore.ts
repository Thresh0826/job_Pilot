import { create } from 'zustand';
import type { SettingsSnapshot } from '../../shared/settings';
import type { RunMode } from '../../shared/enums';
import type { AppPhase, DashboardTab } from '../router';

interface AppState {
  bootstrapped: boolean;
  phase: AppPhase;
  onboardingCompleted: boolean;
  runMode: RunMode;
  dataDir: string;
  activeTab: DashboardTab;
  settings: SettingsSnapshot | null;
  settingsLoaded: boolean;

  bootstrap: () => Promise<void>;
  start: () => Promise<void>;
  goDashboard: (tab?: DashboardTab) => void;
  setActiveTab: (tab: DashboardTab) => void;
  loadSettings: () => Promise<void>;
  saveSettings: (snapshot: SettingsSnapshot) => Promise<void>;
  saveAndCompleteOnboarding: (snapshot: SettingsSnapshot) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  phase: 'welcome',
  onboardingCompleted: false,
  runMode: 'TEST',
  dataDir: '',
  activeTab: 'home',
  settings: null,
  settingsLoaded: false,

  bootstrap: async () => {
    const data = await window.api.bootstrap();
    set({
      bootstrapped: true,
      onboardingCompleted: data.onboardingCompleted,
      runMode: data.runMode,
      dataDir: data.dataDir,
    });
  },

  start: async () => {
    const { onboardingCompleted, settingsLoaded } = get();
    if (!settingsLoaded) await get().loadSettings();
    if (onboardingCompleted) {
      set({ phase: 'dashboard', activeTab: 'home' });
    } else {
      set({ phase: 'onboarding' });
    }
  },

  goDashboard: (tab) => set({ phase: 'dashboard', activeTab: tab ?? 'home' }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadSettings: async () => {
    const settings = await window.api.getSettings();
    set({ settings, settingsLoaded: true });
  },

  saveSettings: async (snapshot) => {
    const saved = await window.api.saveSettings(snapshot);
    set({ settings: saved });
  },

  saveAndCompleteOnboarding: async (snapshot) => {
    await window.api.saveSettings(snapshot);
    await window.api.completeOnboarding();
    set({ settings: snapshot, onboardingCompleted: true });
  },
}));
