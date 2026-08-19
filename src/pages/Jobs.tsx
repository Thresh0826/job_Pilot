import { useEffect, useRef, useState } from 'react';
import type { Job } from '../../core/matching';
import type { JobTarget } from '../../core/searchPlan';
import { Button, Input } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { JobDecisionPanel } from '../components/JobDecisionPanel';
import { useJobsStore } from '../stores/useJobsStore';
import { formatJdText } from '../../core/jdFormat';

export default function Jobs() {
  const keyword = useJobsStore((s) => s.keyword);
  const city = useJobsStore((s) => s.city);
  const result = useJobsStore((s) => s.result);
  const setKeyword = useJobsStore((s) => s.setKeyword);
  const setCity = useJobsStore((s) => s.setCity);
  const setResult = useJobsStore((s) => s.setResult);
  const markJobSeen = useJobsStore((s) => s.markJobSeen);

  const planTasks = useJobsStore((s) => s.planTasks);
  const planProgress = useJobsStore((s) => s.planProgress);
  const planResult = useJobsStore((s) => s.planResult);
  const runningPlan = useJobsStore((s) => s.runningPlan);
  const setPlanTasks = useJobsStore((s) => s.setPlanTasks);
  const setPlanProgress = useJobsStore((s) => s.setPlanProgress);
  const setPlanResult = useJobsStore((s) => s.setPlanResult);
  const setRunningPlan = useJobsStore((s) => s.setRunningPlan);

  const selectedJobId = useJobsStore((s) => s.selectedJobId);
  const detailJob = useJobsStore((s) => s.detailJob);
  const detailResult = useJobsStore((s) => s.detailResult);
  const loadingDetail = useJobsStore((s) => s.loadingDetail);
  const setSelectedJobId = useJobsStore((s) => s.setSelectedJobId);
  const setDetailJob = useJobsStore((s) => s.setDetailJob);
  const setDetailResult = useJobsStore((s) => s.setDetailResult);
  const setLoadingDetail = useJobsStore((s) => s.setLoadingDetail);

  const [targetJob, setTargetJob] = useState('');
  const [relatedText, setRelatedText] = useState('');
  const [citiesText, setCitiesText] = useState('');
  const [targetMsg, setTargetMsg] = useState('');
  const [targetError, setTargetError] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 详情请求序号：快速连续点击岗位时，仅最新一次请求可更新详情 UI（详情内容与选中岗位对应）。
  const detailReqRef = useRef(0);

  const canSearch = keyword.trim().length > 0 && city.trim().length > 0;
  const newCount = result?.status === 'SUCCESS' ? result.jobs.filter((j) => j.status === 'NEW').length : 0;

  // C3：进入页面时回填已保存的求职目标、生成搜索计划并订阅进度。
  useEffect(() => {
    let alive = true;
    void window.api
      .getJobTarget()
      .then((t) => {
        if (!alive || !t) return;
        setTargetJob(t.targetJob);
        setRelatedText(t.relatedKeywords.join('，'));
        setCitiesText(t.targetCities.join('，'));
      })
      .catch(() => {});
    void window.api
      .getSearchPlan()
      .then((tasks) => {
        if (alive) setPlanTasks(tasks);
      })
      .catch(() => {});
    const off = window.api.onSearchPlanProgress((p) => setPlanProgress(p));
    return () => {
      alive = false;
      off();
    };
  }, [setPlanTasks, setPlanProgress]);

  const splitList = (text: string): string[] =>
    text
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  const saveTarget = async () => {
    setTargetMsg('');
    setTargetError('');
    const target: JobTarget = {
      targetJob: targetJob.trim(),
      relatedKeywords: splitList(relatedText),
      targetCities: splitList(citiesText),
    };
    try {
      await window.api.saveJobTarget(target);
      setPlanTasks(await window.api.getSearchPlan());
      setTargetMsg('求职目标已保存');
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const startPlan = async () => {
    if (planTasks.length === 0 || runningPlan) return;
    setRunningPlan(true);
    setPlanProgress(null);
    setPlanResult(null);
    try {
      setPlanResult(await window.api.runSearchPlan());
    } catch (err) {
      setPlanResult({
        status: 'STOPPED',
        total: planTasks.length,
        succeeded: 0,
        failed: 1,
        discovered: 0,
        newCount: 0,
        seenCount: 0,
        failures: [],
        stopReason: {
          task: planTasks[0] ?? { keyword: '', city: '' },
          status: 'INVALID_RESPONSE',
          message: err instanceof Error ? err.message : '自动搜索异常',
        },
      });
    } finally {
      setRunningPlan(false);
    }
  };

  const search = async () => {
    if (!canSearch) return;
    setLoading(true);
    setError('');
    setResult(null);
    setSelectedJobId(null);
    setDetailJob(null);
    setDetailResult(null);
    try {
      const res = await window.api.searchBossJobs({ keyword: keyword.trim(), city: city.trim() });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const viewDetail = async (job: Job) => {
    const reqId = ++detailReqRef.current;
    setSelectedJobId(job.id);
    setDetailJob(job);
    setLoadingDetail(true);
    setDetailResult(null);
    try {
      const res = await window.api.getBossJobDetail(job);
      // 详情已成功读取 → 无论是否过期都标记 SEEN（C2 语义：读取成功即 SEEN）。
      if (res.status === 'SUCCESS' && res.detail) {
        markJobSeen(job.id);
      }
      // 仅最新一次请求可更新详情 UI，避免连续点击时详情与选中岗位错位。
      if (reqId === detailReqRef.current) {
        setDetailResult(res);
      }
    } catch (err) {
      if (reqId === detailReqRef.current) {
        setDetailResult({
          status: 'DETAIL_PARSE_FAILED',
          detail: null,
          message: err instanceof Error ? err.message : '详情读取失败',
        });
      }
    } finally {
      if (reqId === detailReqRef.current) {
        setLoadingDetail(false);
      }
    }
  };

  const retryDetail = () => {
    if (detailJob) void viewDetail(detailJob);
  };

  const detail = detailResult?.detail ?? null;

  return (
    <div className="page">
      <PageHeader title="找工作" desc="设置求职目标 → 自动/手动搜索 → 浏览岗位与详情（需先连接 BOSS）。" />

      {/* 搜索区域：求职目标 + 搜索计划 */}
      <div className="jobs-top">
        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            求职目标
          </h3>
          <Input
            value={targetJob}
            placeholder="目标岗位，如 网络测试工程师"
            onChange={(e) => setTargetJob(e.target.value)}
          />
          <div className="mt-8">
            <Input
              value={relatedText}
              placeholder="相关岗位，逗号分隔，如 网卡测试工程师，网络工程师"
              onChange={(e) => setRelatedText(e.target.value)}
            />
          </div>
          <div className="mt-8">
            <Input
              value={citiesText}
              placeholder="目标城市，逗号分隔，如 无锡，苏州"
              onChange={(e) => setCitiesText(e.target.value)}
            />
          </div>
          <div className="row mt-8" style={{ justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={() => void saveTarget()}>
              保存求职目标
            </Button>
            {targetMsg ? <span className="small muted">{targetMsg}</span> : null}
          </div>
          {targetError ? (
            <div className="small" style={{ color: 'var(--jp-danger)', marginTop: 6 }}>
              {targetError}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            搜索计划
          </h3>
          {planTasks.length === 0 ? (
            <div className="empty__desc">保存求职目标后自动生成搜索任务。</div>
          ) : (
            <>
              <ol className="plan-list">
                {planTasks.map((t, i) => (
                  <li key={`${t.keyword}-${t.city}-${i}`}>
                    {t.keyword} · {t.city}
                  </li>
                ))}
              </ol>
              <div className="small muted mt-8">共 {planTasks.length} 个搜索任务</div>
              <div className="mt-16">
                <Button disabled={runningPlan || planTasks.length === 0} onClick={() => void startPlan()}>
                  {runningPlan ? '搜索中…' : '开始搜索'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 自动搜索进度 / 汇总 */}
      {planProgress ? (
        <div className="card mb-24 jobs-banner">
          <div className="jobs-banner__title">
            正在搜索 {planProgress.index} / {planProgress.total}
          </div>
          <div className="empty__desc">
            {planProgress.task.keyword} · {planProgress.task.city}
          </div>
          <div className="empty__desc mt-8">
            已发现：总岗位 {planProgress.discoveredTotal} · 新岗位 {planProgress.newCount}
          </div>
        </div>
      ) : null}

      {planResult ? (
        <div className="card mb-24 jobs-banner">
          <div className="jobs-banner__title">
            {planResult.status === 'STOPPED' ? '自动搜索已停止' : '本次自动搜索完成'}
          </div>
          <div className="empty__desc">
            执行任务：{planResult.total} · 成功：{planResult.succeeded} · 失败：{planResult.failed} · 发现岗位：
            {planResult.discovered} · 新岗位：{planResult.newCount} · 已见岗位：{planResult.seenCount}
          </div>
          {planResult.stopReason ? (
            <div className="empty__desc mt-8" style={{ color: 'var(--jp-danger)' }}>
              已停止：{planResult.stopReason.task.keyword} · {planResult.stopReason.task.city} —{' '}
              {planResult.stopReason.message ?? planResult.stopReason.status}
            </div>
          ) : null}
          {planResult.failures.length > 0 ? (
            <div className="empty__desc mt-8">
              失败任务：
              {planResult.failures.map((f, i) => (
                <div key={i}>
                  {f.task.keyword} · {f.task.city} — {f.message ?? f.status}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 手动搜索 */}
      <div className="card mb-24">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          手动搜索
        </h3>
        <div className="row">
          <Input
            value={keyword}
            placeholder="关键词，如 新媒体运营"
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
          />
          <Input
            value={city}
            placeholder="城市，如 无锡"
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
          />
          <div style={{ flex: 'none' }}>
            <Button disabled={!canSearch || loading} onClick={() => void search()}>
              {loading ? '搜索中…' : '搜索 BOSS'}
            </Button>
          </div>
        </div>
      </div>

      {/* 工作台：岗位列表 + 岗位详情 */}
      <div className="jobs-workbench">
        <div className="card jobs-list">
          <div className="jobs-list__head">
            <h3 className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>
              岗位列表
            </h3>
            <div className="small muted">
              {result === null
                ? '尚未搜索'
                : result.status === 'SUCCESS'
                  ? `搜索已完成 · 发现 ${result.jobs.length} 个岗位 · 新 ${newCount} 个`
                  : '搜索未完成'}
            </div>
          </div>

          <div className="jobs-list__body">
            {error ? (
              <div className="empty">
                <div className="empty__title">搜索失败</div>
                <div className="empty__desc">{error}</div>
              </div>
            ) : null}

            {!error && result === null ? (
              <div className="empty">
                <div className="empty__title">尚未搜索</div>
                <div className="empty__desc">使用上方手动搜索，或运行搜索计划。</div>
              </div>
            ) : null}

            {!error && result && result.status !== 'SUCCESS' ? (
              <div className="empty">
                <div className="empty__title">搜索未完成</div>
                <div className="empty__desc">{result.message ?? result.status}</div>
              </div>
            ) : null}

            {!error && result && result.status === 'SUCCESS' && result.jobs.length === 0 ? (
              <div className="empty">
                <div className="empty__title">没有找到相关岗位</div>
                <div className="empty__desc">试试其他关键词或城市。</div>
              </div>
            ) : null}

            {!error && result && result.status === 'SUCCESS' && result.jobs.length > 0 ? (
              <div className="job-rows">
                {result.jobs.map((job) => (
                  <div
                    key={job.id}
                    className={`job-row${selectedJobId === job.id ? ' job-row--selected' : ''}`}
                    onClick={() => void viewDetail(job)}
                  >
                    <div className="job-row__line1">
                      <span className="job-row__title">{job.title}</span>
                      {job.status ? (
                        <span
                          className={`tag tag--status ${job.status === 'NEW' ? 'tag--new' : 'tag--seen'}`}
                        >
                          {job.status}
                        </span>
                      ) : null}
                      <span className="job-row__salary">{job.salary ? `¥${job.salary}` : '面议'}</span>
                    </div>
                    <div className="job-row__line2">
                      {job.company}
                      {job.location ? ` · ${job.location}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card jobs-detail">
          <h3 className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>
            岗位详情
          </h3>
          <div className="jobs-detail__body">
            {loadingDetail ? (
              <div className="jobs-detail__loading">
                <div className="empty__title">读取中…</div>
                <div className="empty__desc">
                  {detailJob?.title ?? ''}
                  {detailJob?.company ? ` · ${detailJob.company}` : ''}
                </div>
              </div>
            ) : null}

            {!loadingDetail && detailResult && detailResult.status !== 'SUCCESS' ? (
              <div className="jobs-detail__error">
                <div className="empty__title">详情读取失败</div>
                <div className="empty__desc">{detailResult.message ?? detailResult.status}</div>
                <div className="mt-16">
                  <Button variant="ghost" size="sm" onClick={retryDetail}>
                    重新尝试
                  </Button>
                </div>
              </div>
            ) : null}

            {!loadingDetail && detail && detailResult?.status === 'SUCCESS' ? (
              <div className="jobs-detail__content">
                <div className="job-card__company">{detail.company}</div>
                <div className="job-card__title">{detail.title}</div>
                <div className="job-card__salary">{detail.salary ? `¥${detail.salary}` : '面议'}</div>
                <div className="job-card__meta mt-8">
                  {[detail.location, detail.experience, detail.degree].filter(Boolean).join(' · ')}
                </div>

                <h4 className="jd-section-title">职位描述</h4>
                <p className="jd-text">{formatJdText(detail.jdText ?? '（无职位描述）')}</p>

                {detail.platformJobId ? (
                  <JobDecisionPanel
                    platform={detail.platform}
                    platformJobId={detail.platformJobId}
                    disabledReason={detail.jdText ? undefined : '该岗位没有完整 JD，无法分析。'}
                  />
                ) : null}

                {detail.jobLabels && detail.jobLabels.length > 0 ? (
                  <>
                    <h4 className="jd-section-title">岗位标签</h4>
                    <div className="jd-tags">
                      {detail.jobLabels.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}

                {detail.skills && detail.skills.length > 0 ? (
                  <>
                    <h4 className="jd-section-title">技能</h4>
                    <div className="jd-tags">
                      {detail.skills.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}

                {detail.welfare && detail.welfare.length > 0 ? (
                  <>
                    <h4 className="jd-section-title">福利</h4>
                    <div className="jd-tags">
                      {detail.welfare.map((t) => (
                        <span className="tag" key={t}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}

                {detail.recruiterName ? (
                  <div className="small muted mt-16">
                    招聘者：{detail.recruiterName}
                    {detail.recruiterTitle ? ` · ${detail.recruiterTitle}` : ''}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!loadingDetail && !detailResult ? (
              <div className="empty">
                <div className="empty__title">尚未选择岗位</div>
                <div className="empty__desc">从左侧岗位列表选择岗位查看详情。</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
