import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import type { JobDecision, JobDecisionView, Verdict } from '../../core/decision';
import { Badge, Button, useToast } from './ui';

const VERDICT_META: Record<Verdict, { label: string; tone: 'agent' | 'attention' | 'neutral'; desc: string }> = {
  AUTO_APPLY: { label: '适合自动投递', tone: 'agent', desc: '岗位明显符合你的目标和规则，可进入自动投递流程。' },
  REVIEW: { label: '需要确认', tone: 'attention', desc: '存在重要不确定项或风险，需要你决定。' },
  SKIP: { label: '跳过', tone: 'neutral', desc: '明显不适合，不建议继续浪费时间。' },
};

/**
 * V0.4-B 单岗位决策模块（Jobs 详情区）。
 * - 未分析：显示分析按钮
 * - 已分析：直接显示已有结果（不重复分析），支持重新分析
 * - 资料 / 规则 / JD 变化 → 明确提示旧结果可能已过期
 */
export function JobDecisionPanel({
  platform,
  platformJobId,
  disabledReason,
}: {
  platform: string;
  platformJobId: string;
  /** 前置条件不满足时显示的提示（如无简历 / 无 JD）。 */
  disabledReason?: string;
}) {
  const toast = useToast();
  const [view, setView] = useState<JobDecisionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    try {
      setView(await window.api.getJobDecision(platform, platformJobId));
    } catch (err) {
      toast(err instanceof Error ? err.message : '读取决策失败', 'error');
    }
  };

  useEffect(() => {
    setView(null);
    setExpanded(false);
    void load();
  }, [platform, platformJobId]);

  const analyze = async () => {
    setLoading(true);
    try {
      const next = await window.api.analyzeJobDecision(platform, platformJobId);
      setView(next);
      setExpanded(false);
      toast('JobPilot 决策完成');
    } catch (err) {
      toast(err instanceof Error ? err.message : '分析失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (disabledReason) {
    return (
      <div className="decision">
        <div className="decision__head">
          <Sparkles size={15} strokeWidth={1.8} />
          JobPilot 决策
        </div>
        <div className="small muted">{disabledReason}</div>
      </div>
    );
  }

  const decision: JobDecision | null = view?.decision ?? null;

  return (
    <div className="decision">
      <div className="decision__head">
        <Sparkles size={15} strokeWidth={1.8} />
        JobPilot 决策
        {view?.stale && decision ? (
          <Badge variant="attention">可能已过期</Badge>
        ) : null}
      </div>

      {!decision ? (
        <div className="small muted">根据你的简历、求职规则与完整 JD 给出第一层岗位判断。</div>
      ) : null}

      {!decision ? (
        <div className="mt-8">
          <Button size="sm" disabled={loading} onClick={() => void analyze()}>
            {loading ? '分析中…' : '分析该岗位'}
          </Button>
        </div>
      ) : (
        <div className={`decision__result decision__result--${decision.verdict.toLowerCase()}`}>
          <div className="decision__verdict">
            <Badge variant={VERDICT_META[decision.verdict].tone}>{VERDICT_META[decision.verdict].label}</Badge>
            <span className="decision__reason">{decision.reason}</span>
          </div>

          {view?.stale ? (
            <div className="decision__stale">
              {view.staleReasons.join('；')}。建议重新分析。
            </div>
          ) : null}

          <div className="decision__actions">
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => void analyze()}>
              {loading ? '分析中…' : '重新分析'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {expanded ? '收起详细理由' : '详细理由'}
            </Button>
          </div>

          {expanded ? (
            <div className="decision__detail">
              {decision.matches.length > 0 ? (
                <DecisionSection title="主要匹配点" items={decision.matches} tone="ok" />
              ) : null}
              {decision.risks.length > 0 ? (
                <DecisionSection title="主要风险" items={decision.risks} tone="warn" />
              ) : null}
              {decision.unknowns.length > 0 ? (
                <DecisionSection title="关键不确定项" items={decision.unknowns} tone="warn" />
              ) : null}
              {decision.ruleViolations.length > 0 ? (
                <DecisionSection title="违反的规则" items={decision.ruleViolations} tone="bad" />
              ) : null}
              <div className="small muted">
                {VERDICT_META[decision.verdict].desc}（内部参考分 {decision.score}，置信度{' '}
                {decision.confidence === 'HIGH' ? '高' : decision.confidence === 'MEDIUM' ? '中' : '低'}）
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DecisionSection({ title, items, tone }: { title: string; items: string[]; tone: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="decision__section">
      <div className={`decision__section-title decision__section-title--${tone}`}>{title}</div>
      <ul className="decision__list">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
