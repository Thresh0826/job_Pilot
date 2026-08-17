import type { Job } from '../../core/matching';
import type { ApplicationRecord } from '../../core/application';
import type { Conversation, Message } from '../../core/messaging';

export const MOCK_TODAY_STATS = {
  applied: 12,
  hrReplies: 3,
  pending: 5,
};

export const MOCK_WORK_DATA = {
  discovered: 86,
  matched: 41,
  applied: 12,
  skipped: 29,
};

export const MOCK_RECOMMENDED_JOBS: Job[] = [
  {
    id: 'rec-1',
    title: '新媒体运营',
    company: '星澜科技',
    salary: '6-8K',
    salaryMin: 6000,
    salaryMax: 8000,
    location: '无锡',
    industry: '互联网',
    platform: 'BOSS',
    matchScore: 91,
    tags: ['双休', '五险一金'],
  },
  {
    id: 'rec-2',
    title: '内容运营',
    company: '青禾文化',
    salary: '7-9K',
    salaryMin: 7000,
    salaryMax: 9000,
    location: '苏州',
    industry: '文化传媒',
    platform: 'BOSS',
    matchScore: 87,
    tags: ['弹性工作'],
  },
  {
    id: 'rec-3',
    title: '运营助理',
    company: '云帆网络',
    salary: '5-7K',
    salaryMin: 5000,
    salaryMax: 7000,
    location: '无锡',
    industry: '互联网',
    platform: 'BOSS',
    matchScore: 84,
    tags: ['双休'],
  },
];

export const MOCK_JOBS: Job[] = [
  ...MOCK_RECOMMENDED_JOBS,
  {
    id: 'job-4',
    title: '新媒体运营',
    company: '晨光信息',
    salary: '6-8K',
    location: '无锡',
    industry: '企业服务',
    platform: 'BOSS',
    matchScore: 82,
    tags: ['双休', '年终奖'],
  },
  {
    id: 'job-5',
    title: '电商运营',
    company: '极光电商',
    salary: '7-10K',
    location: '苏州',
    industry: '电子商务',
    platform: 'BOSS',
    matchScore: 78,
    tags: ['大小周'],
  },
  {
    id: 'job-6',
    title: '社区运营',
    company: '木棉互动',
    salary: '5-8K',
    location: '无锡',
    industry: '社交',
    platform: 'BOSS',
    matchScore: 76,
    tags: ['双休'],
  },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    company: '星澜科技',
    title: '新媒体运营',
    lastMessage: '明天下午方便面试吗？',
    time: '10:24',
    unread: true,
    needsAttention: true,
  },
  {
    id: 'conv-2',
    company: '青禾文化',
    title: '内容运营',
    lastMessage: '你好，请问你的期望薪资是？',
    time: '昨天',
    unread: true,
    needsAttention: true,
  },
  {
    id: 'conv-3',
    company: '云帆网络',
    title: '运营助理',
    lastMessage: '收到，稍后回复你。',
    time: '周一',
    unread: false,
    needsAttention: false,
  },
];

export const MOCK_MESSAGES: Message[] = [
  {
    id: 'msg-1',
    conversationId: 'conv-1',
    from: 'HR',
    content: '你好，看了你的简历，请问方便聊聊吗？',
    time: '09:41',
  },
  {
    id: 'msg-2',
    conversationId: 'conv-1',
    from: 'HR',
    content: '明天下午方便面试吗？',
    time: '10:24',
  },
];

export const MOCK_PENDING_MESSAGES = [
  {
    id: 'pending-1',
    company: '星澜科技',
    title: '新媒体运营',
    hrMessage: '明天下午方便面试吗？',
    aiSuggestion: '您好，可以的，请问具体面试地址在哪里？',
  },
  {
    id: 'pending-2',
    company: '青禾文化',
    title: '内容运营',
    hrMessage: '你好，请问你的期望薪资是？',
    aiSuggestion: '您好，我的期望薪资是 7-9K，具体可以进一步沟通。',
  },
];

export const MOCK_APPLICATIONS: ApplicationRecord[] = [
  {
    id: 'app-1',
    company: '星澜科技',
    title: '新媒体运营',
    salary: '6-8K',
    platform: 'BOSS',
    appliedAt: '2026-08-16 14:32',
    status: 'INTERVIEW',
  },
  {
    id: 'app-2',
    company: '青禾文化',
    title: '内容运营',
    salary: '7-9K',
    platform: 'BOSS',
    appliedAt: '2026-08-16 11:05',
    status: 'REVIEWED',
  },
  {
    id: 'app-3',
    company: '云帆网络',
    title: '运营助理',
    salary: '5-7K',
    platform: 'BOSS',
    appliedAt: '2026-08-15 16:48',
    status: 'PENDING',
  },
  {
    id: 'app-4',
    company: '晨光信息',
    title: '新媒体运营',
    salary: '6-8K',
    platform: 'BOSS',
    appliedAt: '2026-08-15 09:20',
    status: 'IGNORED',
  },
];
