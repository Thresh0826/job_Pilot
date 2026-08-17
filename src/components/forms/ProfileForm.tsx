import type { UserProfile } from '../../../core/profile';
import { Field, Input, TagInput } from '../ui';

const CITY_SUGGESTIONS = ['无锡', '苏州', '上海', '杭州', '南京', '常州', '南通', '宁波', '北京', '深圳', '广州', '成都'];

export function ProfileForm({
  value,
  onChange,
}: {
  value: UserProfile;
  onChange: (next: UserProfile) => void;
}) {
  return (
    <div>
      <Field label="姓名" optional>
        <Input
          value={value.name}
          placeholder="你的姓名"
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field>
      <Field label="当前城市" optional>
        <Input
          value={value.currentCity}
          placeholder="例如：无锡"
          onChange={(e) => onChange({ ...value, currentCity: e.target.value })}
        />
      </Field>
      <Field label="目标城市" optional hint="可多选">
        <TagInput
          value={value.targetCities}
          onChange={(targetCities) => onChange({ ...value, targetCities })}
          placeholder="输入城市"
          addLabel="+ 添加城市"
          suggestions={CITY_SUGGESTIONS}
        />
      </Field>
    </div>
  );
}
