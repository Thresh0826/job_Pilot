import { useState } from 'react';
import type { Job, JobDetailResult, JobSearchResult } from '../../core/matching';
import { Button, Input } from '../components/ui';
import { PageHeader } from '../components/PageHeader';

export default function Jobs() {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState('');

  const [detailResult, setDetailResult] = useState<JobDetailResult | null>(null);
  const [detailJob, setDetailJob] = useState<Job | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const canSearch = keyword.trim().length > 0 && city.trim().length > 0;

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
      setDetailResult(await window.api.getBossJobDetail(job));
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
      <PageHeader title="找工作" desc="真实搜索 BOSS 岗位（V0.3-A/B，需先连接 BOSS）。" />

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
                  <td style={{ fontWeight: 600 }}>{job.title}</td>
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
