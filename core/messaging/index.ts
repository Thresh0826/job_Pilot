/** 消息发送方。 */
export type MessageSender = 'HR' | 'AI' | 'USER';

/** 单条消息。 */
export interface Message {
  id: string;
  conversationId: string;
  from: MessageSender;
  content: string;
  time: string;
}

/** 会话（沟通列表项）。 */
export interface Conversation {
  id: string;
  company: string;
  title: string;
  lastMessage: string;
  time: string;
  unread: boolean;
  /** 是否需要人工关注。 */
  needsAttention: boolean;
}
