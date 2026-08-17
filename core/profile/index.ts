import { z } from 'zod';

/** 用户基础资料。 */
export interface UserProfile {
  /** 姓名，可为空。 */
  name: string;
  /** 当前城市，可为空。 */
  currentCity: string;
  /** 目标城市，多选。 */
  targetCities: string[];
}

export const userProfileSchema = z.object({
  name: z.string(),
  currentCity: z.string(),
  targetCities: z.array(z.string()),
});

export const EMPTY_PROFILE: UserProfile = {
  name: '',
  currentCity: '',
  targetCities: [],
};
