import { useEffect, useState } from 'react';
import { createDefaultDecisionRules, type DecisionRules } from '../../../core/decision';
import { Button, Input, SegmentedControl, Switch, TagInput, useToast } from '../ui';

const TOLERANCE_OPTIONS: { value: DecisionRules['degreeTolerance']; label: string }[] = [
  { value: 'STRICT', label: '严格（不满足直接跳过）' },
  { value: 'FLEXIBLE', label: '灵活（不满足需我确认）' },
  { value: 'IGNORE', label: '忽略学历要求' },
];

const WEEKEND_OPTIONS: { value: DecisionRules['weekendPreference']; label: string }[] = [
  { value: 'MUST_DOUBLE', label: '必须双休' },
  { value: 'PREFER_DOUBLE', label: '偏好双休' },
  { value: 'SINGLE_OK', label: '接受单休' },
];

export function DecisionRulesForm() {
  const toast = useToast();
  const [draft, setDraft] = useState<DecisionRules | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.api
      .getDecisionRules()
      .then((rules) => setDraft(rules))
      .catch(() => setDraft(createDefaultDecisionRules()));
  }, []);

  if (!draft) {
    return <div className="small muted">正在读取求职规则…</div>;
  }

  const patch = (p: Partial<DecisionRules>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const save = async () => {
    setSaving(true);
    try {
      await window.api.saveDecisionRules(draft);
      toast('求职规则已保存');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">目标岗位方向</span>
        <TagInput
          value={draft.targetJobs}
          onChange={(targetJobs) => patch({ targetJobs })}
          placeholder="如 网络测试工程师，前端开发"
          addLabel="添加"
        />
        <span className="hint">岗位方向与这些关键词明显不符时不会自动通过。留空则不限制。</span>
      </div>

      <div className="field">
        <span className="field__label">接受的城市</span>
        <TagInput
          value={draft.targetCities}
          onChange={(targetCities) => patch({ targetCities })}
          placeholder="如 无锡，苏州"
          addLabel="添加"
        />
        <span className="hint">岗位城市不在此列表时直接跳过。留空则不限制。</span>
      </div>

      <div className="field">
        <span className="field__label">最低可接受月薪（元）</span>
        <Input
          type="number"
          min={0}
          step={1000}
          placeholder="如 8000"
          value={draft.minSalary === null ? '' : String(draft.minSalary)}
          onChange={(e) => {
            const n = Number(e.target.value);
            patch({ minSalary: e.target.value === '' ? null : Number.isFinite(n) ? n : null });
          }}
        />
        <span className="hint">岗位明确低于此薪资时直接跳过；薪资未标注时会标记为待确认。留空则不限制。</span>
      </div>

      <div className="field">
        <span className="field__label">是否接受外包 / 劳务派遣</span>
        <Switch
          checked={draft.acceptOutsourcing}
          onChange={(acceptOutsourcing) => patch({ acceptOutsourcing })}
          label={draft.acceptOutsourcing ? '接受外包岗位' : '不接受外包岗位'}
        />
        <span className="hint">关闭时，明确标注外包的岗位会直接跳过。</span>
      </div>

      <div className="field">
        <span className="field__label">单双休</span>
        <SegmentedControl
          options={WEEKEND_OPTIONS}
          value={draft.weekendPreference}
          onChange={(weekendPreference) => patch({ weekendPreference })}
        />
      </div>

      <div className="field">
        <span className="field__label">学历要求容忍度</span>
        <SegmentedControl
          options={TOLERANCE_OPTIONS}
          value={draft.degreeTolerance}
          onChange={(degreeTolerance) => patch({ degreeTolerance })}
        />
        <span className="hint">严格：学历不满足直接跳过；灵活：不满足时交给你确认。</span>
      </div>

      <div className="field">
        <span className="field__label">工作经验要求容忍度</span>
        <SegmentedControl
          options={[
            { value: 'STRICT', label: '严格（不满足直接跳过）' },
            { value: 'FLEXIBLE', label: '灵活（不满足需我确认）' },
            { value: 'IGNORE', label: '忽略经验要求' },
          ]}
          value={draft.experienceTolerance}
          onChange={(experienceTolerance) => patch({ experienceTolerance })}
        />
      </div>

      <div className="field">
        <span className="field__label">明确不能接受的条件</span>
        <TagInput
          value={draft.excludedKeywords}
          onChange={(excludedKeywords) => patch({ excludedKeywords })}
          placeholder="如 销售，保险，地推，贷款"
          addLabel="添加"
        />
        <span className="hint">JD 中出现任一关键词时直接跳过（你的硬性排除条件）。</span>
      </div>

      <div className="settings__save">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存规则'}
        </Button>
      </div>
    </div>
  );
}
