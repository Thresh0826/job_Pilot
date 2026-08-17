import type { ReactNode } from 'react';
import { Bot } from 'lucide-react';

export function AIRecommendation({ children }: { children: ReactNode }) {
  return (
    <div className="ai-recommendation">
      <div className="ai-recommendation__label">
        <Bot size={13} strokeWidth={2} />
        JobPilot 建议
      </div>
      <div className="ai-recommendation__body">{children}</div>
    </div>
  );
}
