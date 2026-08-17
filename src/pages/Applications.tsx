import { PageHeader } from '../components/PageHeader';
import { ApplicationStatus } from '../components/ApplicationStatus';
import { MOCK_APPLICATIONS } from '../mock/data';

export default function Applications() {
  return (
    <div className="page">
      <PageHeader title="投递记录" desc="模拟投递历史，暂未接入真实平台。" />

      <table className="table">
        <thead>
          <tr>
            <th>公司</th>
            <th>岗位</th>
            <th>薪资</th>
            <th>平台</th>
            <th>投递时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_APPLICATIONS.map((app) => (
            <tr key={app.id}>
              <td>{app.company}</td>
              <td>{app.title}</td>
              <td>¥{app.salary}</td>
              <td>{app.platform}</td>
              <td className="muted">{app.appliedAt}</td>
              <td>
                <ApplicationStatus status={app.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
