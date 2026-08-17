import { useState } from 'react';
import { Badge, Button, useToast } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { AIRecommendation } from '../components/AIRecommendation';
import { MOCK_CONVERSATIONS, MOCK_MESSAGES, MOCK_PENDING_MESSAGES } from '../mock/data';

export default function Messages() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_CONVERSATIONS[0]?.id ?? '');
  const toast = useToast();

  const conv = MOCK_CONVERSATIONS.find((c) => c.id === selectedId);
  const messages = MOCK_MESSAGES.filter((m) => m.conversationId === selectedId);
  const pending = MOCK_PENDING_MESSAGES.find((m) => m.conversationId === selectedId);

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHeader title="沟通" desc="V0.1 为模拟数据，暂不支持真实发送。" />

      <div className="messages">
        <div className="card" style={{ padding: 12, overflowY: 'auto' }}>
          <div className="list" style={{ gap: 2 }}>
            {MOCK_CONVERSATIONS.map((c) => (
              <button
                key={c.id}
                className={`conversation ${c.id === selectedId ? 'conversation--active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="conversation__main">
                  <div className="conversation__title">
                    {c.company} {c.unread ? <Badge variant="accent">新</Badge> : null}
                  </div>
                  <div className="conversation__preview">
                    {c.title} · {c.lastMessage}
                  </div>
                </div>
                <span className="conversation__time">{c.time}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card chat">
          {conv ? (
            <>
              <div className="chat__head">
                <div className="list-item__title">
                  {conv.company} · {conv.title}
                </div>
                <div className="small muted">{conv.time}</div>
              </div>

              <div className="chat__body">
                {messages.length === 0 ? (
                  <div className="empty">暂无消息</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`msg ${m.from === 'USER' ? 'msg--user' : 'msg--hr'}`}>
                      <div>{m.content}</div>
                      <div className="msg__meta">
                        {m.from === 'HR' ? 'HR' : '你'} · {m.time}
                      </div>
                    </div>
                  ))
                )}

                {pending ? (
                  <div style={{ marginTop: 4 }}>
                    <AIRecommendation>{pending.aiSuggestion}</AIRecommendation>
                  </div>
                ) : null}
              </div>

              <div className="chat__composer">
                <input className="input" placeholder="V0.1 暂不支持真实发送消息" disabled />
                <Button variant="secondary" size="sm" onClick={() => toast('真实发送将在后续版本开放。')}>
                  发送
                </Button>
              </div>
            </>
          ) : (
            <div className="empty">选择一个会话</div>
          )}
        </div>
      </div>
    </div>
  );
}
