export function JobMatchScore({ score }: { score: number }) {
  const tier = score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low';
  return (
    <div className={`match-score match-score--${tier}`} aria-label={`匹配度 ${score}`}>
      <div className="match-score__value">{score}</div>
      <div className="match-score__label">匹配</div>
    </div>
  );
}
