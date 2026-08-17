import type { ReactNode } from 'react';

export function PageHeader({
  title,
  desc,
  trailing,
}: {
  title: ReactNode;
  desc?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="page__header">
      <div>
        <h1 className="page__title">{title}</h1>
        {desc ? <p className="page__desc">{desc}</p> : null}
      </div>
      {trailing ? <div>{trailing}</div> : null}
    </div>
  );
}
