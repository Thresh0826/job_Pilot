import type { JobPreferences, TravelPreference, WeekendPreference } from '../../../core/strategy';
import { ChoiceGroup, Field, Slider, Textarea } from '../ui';

const WEEKEND_OPTIONS: { value: WeekendPreference; label: string }[] = [
  { value: 'MUST_DOUBLE', label: '必须双休' },
  { value: 'PREFER_DOUBLE', label: '双休优先' },
  { value: 'SINGLE_OK', label: '单休也可以' },
];

const TRAVEL_OPTIONS: { value: TravelPreference; label: string }[] = [
  { value: 'NONE', label: '不接受' },
  { value: 'OCCASIONAL', label: '偶尔接受' },
  { value: 'ACCEPT', label: '接受' },
];

const YES_NO = [
  { value: 'yes', label: '接受' },
  { value: 'no', label: '不接受' },
];

const COMPANY_SIZES = ['0-20人', '20-99人', '100-499人', '500-999人', '1000人以上'];

export function PreferencesForm({
  value,
  onChange,
}: {
  value: JobPreferences;
  onChange: (next: JobPreferences) => void;
}) {
  const set = (patch: Partial<JobPreferences>) => onChange({ ...value, ...patch });

  return (
    <div>
      <Field label="双休要求">
        <ChoiceGroup
          options={WEEKEND_OPTIONS}
          value={value.weekendPreference}
          onChange={(v) => set({ weekendPreference: v as WeekendPreference })}
        />
      </Field>

      <Field label="是否接受销售">
        <ChoiceGroup
          options={YES_NO}
          value={value.acceptSales ? 'yes' : 'no'}
          onChange={(v) => set({ acceptSales: v === 'yes' })}
        />
      </Field>

      <Field label="是否接受外包 / 劳务派遣">
        <ChoiceGroup
          options={YES_NO}
          value={value.acceptOutsourcing ? 'yes' : 'no'}
          onChange={(v) => set({ acceptOutsourcing: v === 'yes' })}
        />
      </Field>

      <Field label="出差">
        <ChoiceGroup
          options={TRAVEL_OPTIONS}
          value={value.travelPreference}
          onChange={(v) => set({ travelPreference: v as TravelPreference })}
        />
      </Field>

      <Field label="最大通勤时间">
        <Slider
          value={value.maxCommuteMinutes}
          min={10}
          max={120}
          step={5}
          onChange={(maxCommuteMinutes) => set({ maxCommuteMinutes })}
          format={(v) => `${v} 分钟`}
        />
      </Field>

      <Field label="公司规模偏好" hint="可多选">
        <ChoiceGroup
          multiple
          options={COMPANY_SIZES.map((s) => ({ value: s, label: s }))}
          value={value.companySizes}
          onChange={(v) => set({ companySizes: v as string[] })}
        />
      </Field>

      <Field label="其他要求" optional hint="例如：不接受倒班、不接受驻场、希望外企、希望有年终奖">
        <Textarea
          value={value.otherRequirements}
          placeholder="写下你的其他求职要求"
          onChange={(e) => set({ otherRequirements: e.target.value })}
        />
      </Field>
    </div>
  );
}
