import { useState } from 'react';
import type { JobSearchResult } from '../../core/matching';
import { Button, Input } from '../components/ui';
import { PageHeader } from '../components/PageHeader';

export default function Jobs() {
  const [keyword, setKeyword] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JobSearchResult | null>(null);
  const [error, setError] = useState('');

  const canSearch = keyword.trim().length > 0 && city.trim().length > 0;

  const search = async () => {
    if (!canSearch) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await window.api.searchBossJobs({ keyword: keyword.trim(), city: city.trim() });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title="找工作" desc="真实搜索 BOSS 岗位（V0.3-A，需先连接 BOSS）。" />

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
                <th style={{ width: '22%' }}>岗位</th>
                <th>公司</th>
                <th>薪资</th>
                <th>地点</th>
                <th>经验</th>
                <th>学历</th>
                <th>公司规模</th>
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
                  <td>{job.companySize ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </div>
  );
}
