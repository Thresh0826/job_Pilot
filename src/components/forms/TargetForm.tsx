import type { JobTarget } from '../../../core/strategy';
import { Field, Input, TagInput } from '../ui';

const POSITION_SUGGESTIONS = [
  '新媒体运营',
  '运营助理',
  '内容运营',
  '电商运营',
  '社区运营',
  '市场专员',
  '文案策划',
];

const INDUSTRY_SUGGESTIONS = [
  '互联网',
  '电子商务',
  '文化传媒',
  '企业服务',
  '教育培训',
  '消费零售',
  '医疗健康',
  '金融',
];

const LOCATION_SUGGESTIONS = ['无锡', '苏州', '上海', '杭州', '南京', '常州', '南通', '宁波', '北京', '深圳'];

export function TargetForm({ value, onChange }: { value: JobTarget; onChange: (next: JobTarget) => void }) {
  const set = (patch: Partial<JobTarget>) => onChange({ ...value, ...patch });

  return (
    <div>
      <Field label="目标岗位" hint="可多选">
        <TagInput
          value={value.positions}
          onChange={(positions) => set({ positions })}
          placeholder="输入岗位"
          addLabel="+ 添加岗位"
          suggestions={POSITION_SUGGESTIONS}
        />
      </Field>

      <div className="row">
        <Field label="最低可接受薪资（元/月）">
          <Input
            type="number"
            min={0}
            step={1000}
            value={value.minSalary ?? ''}
            placeholder="6000"
            onChange={(e) =>
              set({ minSalary: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="理想薪资（元/月）">
          <Input
            type="number"
            min={0}
            step={1000}
            value={value.idealSalary ?? ''}
            placeholder="8000"
            onChange={(e) =>
              set({ idealSalary: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </Field>
      </div>

      <Field label="工作地点" hint="可多选">
        <TagInput
          value={value.locations}
          onChange={(locations) => set({ locations })}
          placeholder="输入城市"
          addLabel="+ 添加地点"
          suggestions={LOCATION_SUGGESTIONS}
        />
      </Field>

      <Field label="行业偏好" hint="可多个">
        <TagInput
          value={value.preferredIndustries}
          onChange={(preferredIndustries) => set({ preferredIndustries })}
          placeholder="输入行业"
          addLabel="+ 添加行业"
          suggestions={INDUSTRY_SUGGESTIONS}
        />
      </Field>

      <Field label="排除行业" hint="可多个">
        <TagInput
          value={value.excludedIndustries}
          onChange={(excludedIndustries) => set({ excludedIndustries })}
          placeholder="输入行业"
          addLabel="+ 添加行业"
        />
      </Field>

      <Field label="排除岗位关键词" hint="例如：销售、保险、电话营销、地推">
        <TagInput
          value={value.excludedKeywords}
          onChange={(excludedKeywords) => set({ excludedKeywords })}
          placeholder="输入关键词"
          addLabel="+ 添加关键词"
          suggestions={['销售', '保险', '电话营销', '地推']}
        />
      </Field>
    </div>
  );
}
