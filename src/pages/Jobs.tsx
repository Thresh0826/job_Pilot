import { Badge, Card } from '../components/ui';
import { MOCK_JOBS } from '../mock/data';

export default function Jobs() {
  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">找工作</h1>
        <p className="page__desc">以下为模拟岗位数据，暂未接入 BOSS直聘。</p>
      </div>

      <Card>
        <div className="list">
          {MOCK_JOBS.map((job) => (
            <div className="list-item" key={job.id}>
              <div className="list-item__main">
                <div className="list-item__title">
                  {job.title} · {job.company}
                </div>
                <div className="list-item__sub">
                  {job.salary} · {job.location}
                  {job.industry ? ` · ${job.industry}` : ''}
                </div>
              </div>
              {job.matchScore ? <div className="match">{job.matchScore}%</div> : null}
              <Badge variant="accent">{job.platform}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
