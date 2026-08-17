export interface ActivityEntry {
  time: string;
  text: string;
}

export function AgentActivity({ items }: { items: ActivityEntry[] }) {
  return (
    <div className="activity">
      {items.map((item, index) => (
        <div className="activity__item" key={`${item.time}-${index}`}>
          <span className="activity__time">{item.time}</span>
          <span className="activity__text">{item.text}</span>
        </div>
      ))}
    </div>
  );
}
