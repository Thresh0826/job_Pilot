import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Badge, Button, Card, useToast } from '../components/ui';
import { MOCK_CONVERSATIONS, MOCK_MESSAGES, MOCK_PENDING_MESSAGES } from '../mock/data';

export default function Messages() {
  const [selectedId, setSelectedId] = useState<string>(MOCK_CONVERSATIONS[0]?.id ?? '');
  const toast = useToast();

  const conv = MOCK_CONVERSATIONS.find((c) => c.id === selectedId);
  const messages = MOCK_MESSAGES.filter((m) => m.conversationId === selectedId);
  const pending = MOCK_PENDING_MESSAGES.find((m) => m.company === conv?.company) ?? MOCK_PENDING_MESSAGES[0];

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="page__header">
        <h1 className="page__title">沟通</h1>
        <p className="page__desc">模拟聊天列表，V0.1 不支持真实发送。</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <div className="list">
            {MOCK_CONVERSATIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="list-item"
                style={{
                  background: c.id === selectedId ? 'var(--accent-soft)' : undefined,
                  border: '1px solid var(--border)',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <div className="list-item__main">
                  <div className="list-item__title">
                    {c.company} {c.unread ? <Badge variant="accent">新</Badge> : null}
                  </div>
                  <div className="list-item__sub">
                    {c.title} · {c.lastMessage}
                  </div>
                </div>
                <div className="small muted">{c.time}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          {conv ? (
            <div>
              <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
                <div className="list-item__title">
                  {conv.company} · {conv.title}
                </div>
                <div className="small muted">{conv.time}</div>
              </div>

              <div style={{ minHeight: 260 }}>
                {messages.length === 0 ? (
                  <div className="empty">暂无消息</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`msg-row ${m.from === 'AI' ? 'msg-row--ai' : ''}`}>
                      <div className="bubble">{m.content}</div>
                      <div className="bubble__meta">
                        {m.from === 'HR' ? 'HR' : 'AI'} · {m.time}
                      </div>
                    </div>
                  ))
                )}

                {pending ? (
                  <div className="msg-row msg-row--ai">
                    <div className="bubble">
                      <div className="small muted" style={{ marginBottom: 6 }}>
                        <Bot size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                        AI 建议回复
                      </div>
                      {pending.aiSuggestion}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="row" style={{ marginTop: 16, alignItems: 'center' }}>
                <input
                  className="input"
                  placeholder="V0.1 暂不支持真实发送消息"
                  disabled
                  style={{ flex: 1 }}
                />
                <Button variant="ghost" size="sm" onClick={() => toast('真实发送将在后续版本开放。')}>
                  发送
                </Button>
              </div>
            </div>
          ) : (
            <div className="empty">选择一个会话</div>
          )}
        </Card>
      </div>
    </div>
  );
}
