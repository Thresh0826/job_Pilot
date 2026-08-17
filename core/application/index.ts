import type { PlatformType } from '../../shared/enums';

export type ApplicationStatus =
  | 'PENDING'
  | 'REVIEWED'
  | 'INTERVIEW'
  | 'OFFER'
  | 'REJECTED'
  | 'IGNORED';

/** 投递记录。 */
export interface ApplicationRecord {
  id: string;
  company: string;
  title: string;
  salary: string;
  platform: PlatformType;
  appliedAt: string;
  status: ApplicationStatus;
}
