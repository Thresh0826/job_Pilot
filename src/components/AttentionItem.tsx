import { ArrowRight } from 'lucide-react';
import { Button } from './ui';

export function AttentionItem({
  company,
  title,
  hrMessage,
  aiSuggestion,
  onOpen,
}: {
  company: string;
  title: string;
  hrMessage: string;
  aiSuggestion: string;
  onOpen: () => void;
}) {
  return (
    <div className="attention-item">
      <div className="attention-item__meta">
        {company} · {title}
      </div>

      <div className="attention-item__hr-label">HR</div>
      <div className="attention-item__hr">{hrMessage}</div>

      <div className="attention-item__ai">
        <div className="attention-item__ai-label">JobPilot 建议</div>
        {aiSuggestion}
      </div>

      <div className="attention-item__action">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          查看沟通 <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}
