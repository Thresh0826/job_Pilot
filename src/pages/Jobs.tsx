import { Badge } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { JobMatchScore } from '../components/JobMatchScore';
import { MOCK_JOBS } from '../mock/data';

export default function Jobs() {
  return (
    <div className="page">
      <PageHeader title="找工作" desc="以下为模拟岗位数据，暂未接入 BOSS直聘。" />

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '30%' }}>岗位</th>
            <th>公司</th>
            <th>薪资</th>
            <th>地点</th>
            <th>匹配度</th>
            <th>平台</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_JOBS.map((job) => (
            <tr key={job.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{job.title}</div>
                {job.aiSummary ? <div className="small muted mt-4">{job.aiSummary}</div> : null}
              </td>
              <td>{job.company}</td>
              <td>¥{job.salary}</td>
              <td>{job.district ?? job.location}</td>
              <td>{job.matchScore != null ? <JobMatchScore score={job.matchScore} /> : '—'}</td>
              <td>
                <Badge variant="neutral">{job.platform}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
