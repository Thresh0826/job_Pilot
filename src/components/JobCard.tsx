import type { Job } from '../../core/matching';
import { ArrowRight } from 'lucide-react';
import { Badge, Button } from './ui';
import { JobMatchScore } from './JobMatchScore';

export function JobCard({ job, onOpen }: { job: Job; onOpen?: () => void }) {
  const meta = [job.district ?? job.location, job.degree, job.experience].filter(Boolean).join(' · ');

  return (
    <div className="job-card">
      <div className="job-card__head">
        <div>
          <div className="job-card__company">{job.company}</div>
          <div className="job-card__title">{job.title}</div>
        </div>
        {job.matchScore != null ? <JobMatchScore score={job.matchScore} /> : null}
      </div>

      <div className="job-card__salary">¥{job.salary ?? '面议'}</div>
      <div className="job-card__meta">{meta}</div>

      {job.aiSummary ? <div className="job-card__summary">{job.aiSummary}</div> : null}

      <div className="job-card__footer">
        <Badge variant="neutral">{job.platform}</Badge>
        {onOpen ? (
          <Button variant="ghost" size="sm" onClick={onOpen}>
            查看 <ArrowRight size={14} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
