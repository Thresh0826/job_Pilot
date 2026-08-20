import { useEffect, useState } from 'react';
import { Check, Inbox, Sparkles, X } from 'lucide-react';
import type { ReviewQueueItem } from '../../core/decision';
import { useJobsStore } from '../stores/useJobsStore';
import { Badge, Button, useToast } from './ui';

/**
 * V0.4-C 批量岗位决策面板（Jobs 页面）：
 * - 「分析本次新岗位（N）」：只处理最近一次搜索运行发现的岗位
 * - 实时进度与汇总：总岗位 / 已完成 / 待处理 / 适合自动投递 / 需要确认 / 已跳过 / 失败
 * - 触发平台安全验证 → PAUSED：提示去 BOSS 人工处理后「继续分析」（从剩余岗位继续）
 * - REVIEW 队列：可「允许投递 / 跳过」；可中途停止，已完成结果保留
 */
export function BatchDecisionPanel() {
  const toast = useToast();
  const progress = useJobsStore((s) => s.batchProgress);
  const result = useJobsStore((s) => s.batchResult);
  const running = useJobsStore((s) => s.runningBatch);
  const setProgress = useJobsStore((s) => s.setBatchProgress);
  const setResult = useJobsStore((s) => s.setBatchResult);
  const setRunning = useJobsStore((s) => s.setRunningBatch);

  const [stats, setStats] = useState<{ total: number; pending: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewQueueItem[] | null>(null);
  const [handling, setHandling] = useState(false);

  const refreshStats = async () => {
    try {
      setStats(await window.api.getBatchStats('BOSS'));
    } catch {
      // 忽略统计读取失败
    }
  };

  useEffect(() => {
    void refreshStats();
    const off = window.api.onBatchAnalysisProgress((p) => setProgress(p));
    return off;
  }, [setProgress]);

  const start = async () => {
    setRunning(true);
    setResult(null);
    setProgress(null);
    setReviewOpen(false);
    try {
      const r = await window.api.runBatchAnalysis('BOSS');
      setResult(r);
      await refreshStats();
      toast(r.status === 'COMPLETED' ? '批量分析完成' : '已停止批量分析');
    } catch (err) {
      setResult({
        status: 'CANCELLED',
        total: stats?.total ?? 0,
        done: 0,
        autoApply: 0,
        review: 0,
        skip: 0,
        failed: 0,
        pending: stats?.pending ?? 0,
      });
      toast(err instanceof Error ? err.message : '批量分析失败', 'error');
    } finally {
      setRunning(false);
    }
  };

  const stop = async () => {
    await window.api.cancelBatchAnalysis();
    toast('正在停止…');
  };

  const openReview = async () => {
    const next = !reviewOpen;
    setReviewOpen(next);
    if (next) {
      setReviewItems(null);
      try {
        setReviewItems(await window.api.getReviewQueue('BOSS'));
      } catch (err) {
        toast(err instanceof Error ? err.message : '读取待确认列表失败', 'error');
      }
    }
  };

  const act = async (item: ReviewQueueItem, action: 'ALLOW' | 'SKIP') => {
    setHandling(true);
    try {
      await window.api.updateJobDecisionAction('BOSS', item.platformJobId, action);
      setReviewItems((items) => items?.filter((it) => it.platformJobId !== item.platformJobId) ?? null);
      const current = useJobsStore.getState().batchResult;
      if (current) {
        setResult({
          ...current,
          review: Math.max(0, current.review - 1),
          done: Math.max(0, current.done - 1),
          pending: current.pending + 1,
        });
      }
      toast(action === 'ALLOW' ? '已标记为允许投递' : '已跳过该岗位');
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setHandling(false);
    }
  };

  const reviewCount = result?.review ?? 0;
  const totalCount = running ? (progress?.total ?? 0) : (result?.total ?? stats?.total ?? 0);
  const showIdle = !running && !result;

  return (
    <div className="card mb-24">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        批量决策
      </h3>

      {showIdle ? (
        <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="small secondary">
            自动搜索完成后，一键处理最近一次搜索运行发现的新岗位：自动读取完整 JD 并给出
            适合自动投递 / 需要确认 / 跳过 的判断。缺 JD 的岗位会节制地顺序读取，避免触发平台验证。
          </div>
          <div style={{ flex: 'none' }}>
            <Button onClick={() => void start()}>
              <Sparkles size={15} />
              分析本次新岗位{totalCount > 0 ? `（${totalCount}）` : ''}
            </Button>
          </div>
        </div>
      ) : null}

      {running ? (
        <div>
          <div className="jobs-banner__title">
            正在分析 {progress?.index ?? 0} / {progress?.todo ?? 0}
            {progress?.currentTitle ? ` · ${progress.currentTitle}` : ''}
          </div>
          <BatchCounts
            total={progress?.total ?? 0}
            done={progress?.done ?? 0}
            pending={progress?.pending ?? 0}
            autoApply={progress?.autoApply ?? 0}
            review={progress?.review ?? 0}
            skip={progress?.skip ?? 0}
            failed={progress?.failed ?? 0}
          />
          <div className="mt-16">
            <Button variant="secondary" size="sm" onClick={() => void stop()}>
              停止本次批量分析
            </Button>
          </div>
        </div>
      ) : null}

      {!running && result ? (
        <div className="jobs-banner">
          <div className="jobs-banner__title">
            {result.status === 'COMPLETED' ? '批量分析完成' : '已停止批量分析（已完成结果保留）'}
          </div>
          {result.status === 'CANCELLED' ? (
            <div className="small muted mt-8">已完成结果保留，可随时「继续分析」处理剩余岗位。</div>
          ) : null}
          <BatchCounts
            total={result.total}
            done={result.done}
            pending={result.pending}
            autoApply={result.autoApply}
            review={result.review}
            skip={result.skip}
            failed={result.failed}
          />
          <div className="row mt-16" style={{ justifyContent: 'flex-start' }}>
            {result.status === 'CANCELLED' ? (
              <Button onClick={() => void start()}>继续分析</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => void start()}>
                再次分析
              </Button>
            )}
            {reviewCount > 0 ? (
              <Button size="sm" onClick={() => void openReview()}>
                <Inbox size={14} /> 需要你确认 · {reviewCount}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {reviewOpen ? (
        <ReviewQueueList
          items={reviewItems}
          handling={handling}
          onAct={act}
          onClose={() => setReviewOpen(false)}
        />
      ) : null}
    </div>
  );
}

function BatchCounts({
  total,
  done,
  pending,
  autoApply,
  review,
  skip,
  failed,
}: {
  total: number;
  done: number;
  pending: number;
  autoApply: number;
  review: number;
  skip: number;
  failed: number;
}) {
  return (
    <div className="mt-8">
      <div className="batch-stats">
        <span>
          总岗位 <b>{total}</b>
        </span>
        <span>
          已完成 <b style={{ color: 'var(--jp-agent)' }}>{done}</b>
        </span>
        <span>
          待处理 <b style={{ color: 'var(--jp-attention)' }}>{pending}</b>
        </span>
      </div>
      <div className="batch-stats mt-8">
        <span>
          适合自动投递 <b style={{ color: 'var(--jp-agent)' }}>{autoApply}</b>
        </span>
        <span>
          需要确认 <b style={{ color: 'var(--jp-attention)' }}>{review}</b>
        </span>
        <span>
          已跳过 <b>{skip}</b>
        </span>
        {failed > 0 ? (
          <span>
            失败 <b style={{ color: 'var(--jp-danger)' }}>{failed}</b>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ReviewQueueList({
  items,
  handling,
  onAct,
  onClose,
}: {
  items: ReviewQueueItem[] | null;
  handling: boolean;
  onAct: (item: ReviewQueueItem, action: 'ALLOW' | 'SKIP') => void;
  onClose: () => void;
}) {
  return (
    <div className="review-queue mt-16">
      <div className="review-queue__head">
        <span className="review-queue__title">需要你确认的岗位</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X size={14} /> 收起
        </Button>
      </div>
      {items === null ? (
        <div className="small muted">读取中…</div>
      ) : items.length === 0 ? (
        <div className="small muted">没有待确认的岗位，已全部处理。</div>
      ) : (
        <div className="review-queue__list">
          {items.map((item) => (
            <div className="review-queue__item" key={item.platformJobId}>
              <div className="review-queue__main">
                <div className="review-queue__title-line">
                  <b>{item.title}</b>
                  <span className="small muted"> {item.company}</span>
                </div>
                <div className="small muted">
                  {[item.city, item.salary ? `¥${item.salary}` : '面议'].filter(Boolean).join(' · ')}
                </div>
                <div className="review-queue__reason">{item.decision.reason}</div>
              </div>
              <div className="review-queue__actions">
                <Button size="sm" disabled={handling} onClick={() => onAct(item, 'ALLOW')}>
                  <Check size={14} /> 允许投递
                </Button>
                <Button variant="secondary" size="sm" disabled={handling} onClick={() => onAct(item, 'SKIP')}>
                  跳过
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="small muted mt-8">
        <Badge variant="attention">本阶段仅改变决策状态，不会真正投递</Badge>
      </div>
    </div>
  );
}
