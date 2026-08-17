import type { JobPilotApi } from '../../shared/ipc';

declare global {
  interface Window {
    api: JobPilotApi;
  }
}

export {};
