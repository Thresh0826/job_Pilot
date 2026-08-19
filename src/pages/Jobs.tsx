import { useEffect, useState } from 'react';
import type { Job, JobDetailResult } from '../../core/matching';
import type { JobTarget } from '../../core/searchPlan';
import { Button, Input } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { useJobsStore } from '../stores/useJobsStore';

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

  const [targetJob, setTargetJob] = useState('');
  const [relatedText, setRelatedText] = useState('');
  const [citiesText, setCitiesText] = useState('');
  const [targetMsg, setTargetMsg] = useState('');
  const [targetError, setTargetError] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [detailResult, setDetailResult] = useState<JobDetailResult | null>(null);
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const canSearch = keyword.trim().length > 0 && city.trim().length > 0;

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
    setDetailResult(null);
    setDetailJob(null);
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
    setLoadingDetail(true);
    setDetailResult(null);
    setDetailJob(job);
    try {
      const res = await window.api.getBossJobDetail(job);
      setDetailResult(res);
      // C2：详情读取成功后立即在当前页面标记 SEEN（失败不标记，保持 NEW）。
      if (res.status === 'SUCCESS' && res.detail) {
        markJobSeen(job.id);
      }
    } catch (err) {
      setDetailResult({
        status: 'DETAIL_PARSE_FAILED',
        detail: null,
        message: err instanceof Error ? err.message : '详情读取失败',
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="找工作" desc="自动搜索计划 + 手动搜索（V0.3-C3，需先连接 BOSS）。" />

      <div className="card mb-24">
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

      <div className="card mb-24">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          本次搜索计划
        </h3>
        {planTasks.length === 0 ? (
          <div className="empty__desc">先保存求职目标，将自动生成搜索计划。</div>
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
            <div className="mt-8">
              <Button disabled={runningPlan || planTasks.length === 0} onClick={() => void startPlan()}>
                {runningPlan ? '搜索中…' : '开始搜索'}
              </Button>
            </div>
          </>
        )}
      </div>

      {planProgress ? (
        <div className="card mb-24">
          <div className="empty__title" style={{ marginBottom: 6 }}>
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
        <div className="card mb-24">
          <div className="empty__title" style={{ marginBottom: 6 }}>
            {planResult.status === 'STOPPED' ? '自动搜索已停止' : '本次自动搜索完成'}
          </div>
          <div className="empty__desc">
            执行任务：{planResult.total} · 成功：{planResult.succeeded} · 失败：{planResult.failed}
            <br />
            发现岗位：{planResult.discovered} · 新岗位：{planResult.newCount} · 已见岗位：
            {planResult.seenCount}
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

      <div className="card mb-24">
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

      {error ? <div className="empty">{error}</div> : null}

      {result && result.status !== 'SUCCESS' ? (
        <div className="empty">
          <div className="empty__title">搜索未完成</div>
          <div className="empty__desc">{result.message ?? result.status}</div>
        </div>
      ) : null}

      {result && result.status === 'SUCCESS' ? (
        result.jobs.length === 0 ? (
          <div className="empty">
            <div className="empty__title">没有找到相关岗位</div>
            <div className="empty__desc">试试其他关键词或城市。</div>
          </div>
        ) : (
          <>
            <div className="empty__desc" style={{ marginBottom: 8 }}>
              已获取 {result.jobs.length} 个岗位
              {typeof result.batchesLoaded === 'number' ? ` · 加载 ${result.batchesLoaded} 批` : ''}
              {result.jobs.filter((j) => j.status === 'NEW').length > 0
                ? ` · 新 ${result.jobs.filter((j) => j.status === 'NEW').length} 个`
                : ''}
              {result.hasMore === false ? ' · 已无更多岗位' : ''}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '20%' }}>岗位</th>
                  <th>公司</th>
                  <th>薪资</th>
                  <th>地点</th>
                  <th>经验</th>
                  <th>学历</th>
                  <th style={{ width: '88px' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.jobs.map((job) => (
                  <tr key={job.id}>
                    <td style={{ fontWeight: 600 }}>
                      {job.title}
                      {job.status ? (
                        <span className={`tag tag--status ${job.status === 'NEW' ? 'tag--new' : 'tag--seen'}`}>
                          {job.status}
                        </span>
                      ) : null}
                    </td>
                    <td>{job.company}</td>
                    <td>{job.salary ? `¥${job.salary}` : '面议'}</td>
                    <td>{job.location}</td>
                    <td>{job.experience ?? '—'}</td>
                    <td>{job.degree ?? '—'}</td>
                    <td>
                      <Button
                        variant="ghost"
                      size="sm"
                      disabled={loadingDetail}
                      onClick={() => void viewDetail(job)}
                    >
                      {loadingDetail && detailJob?.id === job.id ? '读取中…' : '查看详情'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )
      ) : null}

      {detailResult ? (
        detailResult.status !== 'SUCCESS' ? (
          <div className="card mt-24">
            <div className="empty__title" style={{ marginBottom: 6 }}>
              详情读取失败
            </div>
            <div className="empty__desc">{detailResult.message ?? detailResult.status}</div>
          </div>
        ) : detailResult.detail ? (
          <div className="card mt-24">
            <div className="job-card__head">
              <div>
                <div className="job-card__company">{detailResult.detail.company}</div>
                <div className="job-card__title">{detailResult.detail.title}</div>
              </div>
              <div className="job-card__salary" style={{ marginTop: 0 }}>
                {detailResult.detail.salary ? `¥${detailResult.detail.salary}` : '面议'}
              </div>
            </div>
            <div className="job-card__meta mt-8">
              {[detailResult.detail.location, detailResult.detail.experience, detailResult.detail.degree]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <h3 className="section-title" style={{ marginTop: 16 }}>
              职位描述
            </h3>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'var(--jp-text-primary)' }}>
              {detailResult.detail.jdText ?? '（无职位描述）'}
            </p>
            {detailResult.detail.jobLabels && detailResult.detail.jobLabels.length > 0 ? (
              <div className="tag-input__items mt-16">
                {detailResult.detail.jobLabels.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {detailResult.detail.recruiterName ? (
              <div className="small muted mt-16">
                招聘者：{detailResult.detail.recruiterName}
                {detailResult.detail.recruiterTitle ? ` · ${detailResult.detail.recruiterTitle}` : ''}
              </div>
            ) : null}
          </div>
        ) : null
      ) : null}
    </div>
  );
}
