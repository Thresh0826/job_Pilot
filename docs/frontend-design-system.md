# JobPilot Frontend Design System v1.0

## 1. 产品视觉定位

JobPilot 是一个运行于 Windows 的本地 AI 求职 Agent。

它不是：

* 招聘网站
* 企业 OA
* 数据分析后台
* AI 聊天网页
* 营销型 SaaS 官网

它应该给用户一种：

> 有一个安静、可靠的 AI Agent 正在电脑里持续替我处理求职工作。

整体视觉关键词：

**安静 / 智能 / 克制 / 精密 / 可信 / 轻盈 / 有生命感**

英文内部设计关键词：

```text
Quiet Intelligence
Personal Career Agent
Calm Workspace
Ambient Computing
Human-in-the-loop AI
```

---

# 2. 核心设计原则

## 2.1 欢迎页负责“情绪”

Welcome、Onboarding Complete、空状态等页面允许有更强视觉表现。

可以使用：

* 大字号排版
* 大面积留白
* 光晕
* 柔和渐变
* 模糊材质
* 轻量动态背景
* 极少量粒子或环境动画

目的是建立 JobPilot 的产品气质。

---

## 2.2 工作台负责“效率”

Dashboard、岗位列表、沟通、投递记录、设置等页面：

优先保证：

* 信息扫描效率
* 明确层级
* 状态识别
* 操作速度
* 可预测性

进入工作区后明显减少装饰。

禁止把 Dashboard 做成：

```text
十几个彩色卡片
+
大量渐变
+
四处阴影
+
各种圆角胶囊
```

---

# 3. JobPilot 品牌语言

JobPilot 的核心视觉概念：

# Pilot Signal

即：

> AI Agent 正在持续感知外界，并把真正重要的信息送到用户面前。

因此整个产品允许重复出现一种非常克制的“信号”语言。

例如：

```text
● Agent 正在运行

● BOSS 已连接

● 发现 23 个新岗位

● 3 条消息需要处理
```

小圆点、细线、状态光可以成为 JobPilot 的视觉识别元素。

但禁止做成：

* 霓虹灯
* RGB 发光
* 赛博朋克
* 大面积荧光色

应该始终保持安静。

---

# 4. 色彩系统

## 4.1 基础背景

主背景：

```css
--jp-bg: #f6f7f5;
```

次级背景：

```css
--jp-bg-soft: #f1f3f1;
```

纯白：

```css
--jp-surface: #ffffff;
```

工作区避免纯白铺满整个屏幕。

页面整体应该是非常浅的暖灰绿。

---

# 4.2 Welcome 背景

允许使用：

```css
background:
  radial-gradient(
    circle at 22% 18%,
    rgb(255 255 255 / 95%) 0,
    transparent 30rem
  ),
  radial-gradient(
    circle at 82% 78%,
    rgb(221 238 230 / 52%) 0,
    transparent 27rem
  ),
  linear-gradient(
    135deg,
    #f9faf8 0%,
    #f2f6f3 52%,
    #f8f5f2 100%
  );
```

禁止：

* 蓝紫大渐变
* 紫色 AI 风
* 高饱和科技蓝
* 五颜六色的光斑

---

# 4.3 文字颜色

主标题：

```css
--jp-text-primary: #17201d;
```

正文：

```css
--jp-text-secondary: #59635f;
```

辅助：

```css
--jp-text-muted: #828b87;
```

禁用：

```css
--jp-text-disabled: #aeb5b2;
```

---

# 4.4 品牌色

JobPilot 主品牌强调色：

```css
--jp-accent: #2563eb;
```

Hover：

```css
--jp-accent-hover: #1d4ed8;
```

浅背景：

```css
--jp-accent-soft: #eef4ff;
```

这个蓝色只用于：

* 当前选中
* 链接
* Focus
* 少量强调
* AI建议
* 关键交互状态

不要让整个页面变蓝。

---

# 4.5 Agent 状态色

Agent 正常工作：

```css
--jp-agent: #35a36f;
```

浅背景：

```css
--jp-agent-soft: #edf8f2;
```

代表：

* Agent运行
* 平台连接
* 成功
* 已处理

---

等待人工：

```css
--jp-attention: #d99432;
--jp-attention-soft: #fff7e9;
```

代表：

* AI需要用户确认
* 等待回复
* 面试时间待确定

---

危险：

```css
--jp-danger: #dc5a5a;
--jp-danger-soft: #fff1f1;
```

只用于：

* 登录失效
* Agent异常
* 操作失败
* 风险提示

---

# 5. 字体

Windows 优先。

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI Variable",
  "Segoe UI",
  "Microsoft YaHei",
  sans-serif;
```

禁止：

* 给中文页面使用装饰性英文字体
* 全站加宽字距
* 大量粗体

---

# 6. 字号层级

## Display

Welcome：

```text
44–52px
600
```

---

## Page Title

```text
28px
600
```

---

## Section Title

```text
18px
600
```

---

## Card / Item Title

```text
15–16px
600
```

---

## Body

```text
14px
400
line-height: 1.6
```

---

## Secondary

```text
13px
400
```

---

## Metadata

```text
12px
400
```

数字统计允许：

```text
26–32px
600
```

---

# 7. 间距系统

统一采用 4px 基础单位。

推荐：

```text
4
8
12
16
20
24
32
40
48
64
80
```

禁止页面中出现大量：

```text
17px
23px
29px
37px
```

等随意间距。

---

# 8. 圆角系统

JobPilot 不追求“超圆润 SaaS”。

建议：

```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
```

主要面板最大默认：

```text
12px
```

按钮：

```text
8px
```

输入框：

```text
8px
```

Tag：

可以使用完整胶囊。

禁止：

```text
所有东西 20px / 24px 圆角
```

---

# 9. 边框

优先使用非常浅的边界：

```css
--jp-border: #e5e9e6;
```

Hover：

```css
--jp-border-hover: #d5dbd7;
```

不要每一个区域都有边框。

使用顺序：

```text
留白
↓
背景变化
↓
边框
↓
阴影
```

阴影永远是最后手段。

---

# 10. 阴影

默认：

```css
box-shadow:
  0 1px 2px rgb(15 23 42 / 3%),
  0 8px 24px rgb(15 23 42 / 5%);
```

浮层：

```css
box-shadow:
  0 18px 50px rgb(15 23 42 / 10%);
```

禁止：

* 黑色重阴影
* 四周同时明显阴影
* 每张卡片都有阴影

---

# 11. Welcome 页面

这是 JobPilot 视觉品质最高的页面。

布局建议：

```text
┌─────────────────────────────────────────┐
│                                         │
│                                         │
│                JobPilot                 │
│                                         │
│          你的 AI 求职助手                │
│                                         │
│                                         │
│              点击开始                    │
│                                         │
│                                         │
│        Local · Private · Intelligent    │
│                                         │
└─────────────────────────────────────────┘
```

不要加：

* 功能介绍
* 三张卖点卡
* 产品截图
* 六个功能 Icon
* 营销文案

首屏只有一个任务：

> 开始。

---

## Welcome Logo

JobPilot 字样本身就是 Logo。

允许：

```text
JobPilot
```

旁边添加极小的 Agent Signal：

```text
●
```

但不要制造复杂 Logo 图标。

---

## 点击开始

不是普通矩形按钮。

建议：

```text
宽：170–210px
高：54–58px
```

深墨色：

```css
background: #17201d;
color: white;
```

Hover：

轻微提升亮度。

Mouse down：

```css
transform: scale(0.985);
```

禁止：

* 大幅弹跳
* 强发光
* 彩色渐变按钮

---

# 12. Welcome 动效

背景允许存在非常缓慢的环境变化。

周期：

```text
10–20 秒
```

幅度非常小。

用户不应该明确感受到：

> 背景正在运动。

而应该感觉：

> 页面不是完全静止的。

按钮进入：

```text
opacity
+
8–12px vertical movement
```

持续约：

```text
350–500ms
```

---

# 13. 应用主结构

Dashboard 以后采用：

```text
┌─────────┬────────────────────────────┐
│ Sidebar │ Top Context                │
│         ├────────────────────────────┤
│         │                            │
│         │ Main Workspace             │
│         │                            │
└─────────┴────────────────────────────┘
```

---

# 14. Sidebar

推荐宽度：

```text
220–236px
```

背景：

```css
#f2f4f2
```

或与页面背景融合。

顶部：

```text
JobPilot
```

下面：

```text
首页
找工作
沟通
投递记录

────────

设置
```

图标统一 Lucide。

推荐：

```text
首页       House
找工作     Search
沟通       MessagesSquare
投递记录   ClipboardList
设置       Settings
```

禁止 Emoji。

---

# 15. Sidebar 当前状态

当前选中项目不要做蓝色实底。

建议：

```css
background: rgb(23 32 29 / 6%);
color: #17201d;
```

左侧可以有：

```text
2px
```

非常克制的深色 Indicator。

---

# 16. Dashboard

Dashboard 的核心不是统计。

而是：

> 今天 JobPilot 做了什么，以及我现在需要做什么。

因此首页优先级应该是：

```text
1. Agent 状态
2. 待我处理
3. 今日运行结果
4. 推荐机会
5. 普通统计
```

---

# 17. Dashboard 顶部

例如：

```text
下午好，刘小姐

JobPilot 今天正在持续寻找合适的机会。
```

右侧：

```text
● Agent 正在运行
```

以及：

```text
测试模式
```

测试模式必须明显，但不要使用巨大红色 Banner。

---

# 18. Agent 状态模块

这是 JobPilot 最重要的品牌组件之一。

示例：

```text
┌───────────────────────────────────────┐
│ ● AI 求职 Agent             正在运行  │
│                                       │
│ 正在检查 BOSS 上的新岗位              │
│                                       │
│ 已发现 62   符合 24   已投递 18       │
│                                       │
│                             暂停      │
└───────────────────────────────────────┘
```

区别于普通 Card：

允许有极淡：

```text
green tint
```

但不要变成绿色大块。

---

# 19. Agent Activity

未来可以增加：

```text
17:21 发现 8 个新岗位
17:20 跳过 XX销售岗位
17:18 投递 XX科技
17:16 HR 回复了你
```

视觉类似系统 Activity Feed。

这会形成 JobPilot 很重要的：

> Agent 正在真实工作的感觉。

---

# 20. 数据统计

禁止四张巨大彩色 KPI 卡。

推荐简单横向排列：

```text
今日投递       HR回复       待处理

18            4            2
```

只通过字号建立层级。

最多加非常轻的背景或分隔。

---

# 21. 待处理

这是 Dashboard 视觉优先级最高的业务区之一。

例如：

```text
需要你处理                                     2

XX科技 · 新媒体运营

HR
明天下午方便过来面试吗？

JobPilot 建议
您好，可以的。请问具体面试地址在哪里？

查看沟通 →
```

AI建议区域使用非常浅的：

```css
#eef4ff
```

建立：

```text
HR说了什么
↓
AI怎么理解
↓
建议你怎么处理
```

的信息层级。

---

# 22. Job Card

岗位卡片不要像招聘网站。

主要信息：

```text
公司
岗位
薪资

匹配度

地点 · 经验 · 学历

AI判断摘要
```

例如：

```text
XX科技

新媒体运营                         91
¥6K–8K

无锡滨湖 · 本科 · 经验不限

与你的运营方向、薪资和通勤要求高度匹配。

BOSS                                 查看 →
```

---

# 23. 匹配度

不要画巨大圆形进度条。

使用：

```text
91
匹配
```

或者细 Progress Bar。

评分颜色：

```text
85+     green
70–84   blue
<70     gray
```

不要红黄绿一大片。

---

# 24. AI Explanation

JobPilot 和普通招聘软件最大的区别：

> 它需要解释为什么推荐。

因此岗位详情应该有：

```text
JobPilot 判断

适合你的原因
• 薪资达到理想区间
• 工作地点符合要求
• 工作经验要求匹配

需要注意
• JD 提到偶尔出差
```

不要让 AI 输出大段散文。

必须结构化。

---

# 25. Messages

沟通页面推荐：

```text
┌──────────────┬───────────────────────┐
│ Conversation │ Chat                  │
│ List         │                       │
│              │                       │
└──────────────┴───────────────────────┘
```

类似成熟桌面 IM。

左侧：

```text
公司
岗位
最后一句话
时间
状态
```

右侧才是沟通。

---

# 26. AI 与人工区分

HR 消息：

普通白色。

用户消息：

浅灰。

JobPilot 建议：

不要模拟成人类聊天气泡。

应该单独设计为：

```text
JobPilot 建议
```

浅蓝辅助区域。

必须让用户清楚：

> 这是 AI 建议，不是 HR 发来的消息。

---

# 27. 投递记录

投递记录属于工具工作台。

推荐：

**Table / Structured List**

而不是每条一个巨大 Card。

列：

```text
公司
岗位
薪资
平台
投递时间
状态
```

状态：

```text
已投递
已读
沟通中
面试
结束
```

---

# 28. Onboarding

Onboarding 保持：

> 一页只解决一个问题。

不要右侧塞巨大 Illustration。

顶部：

```text
JobPilot
```

主体宽：

```text
600–720px
```

步骤显示：

```text
1 —— 2 —— 3 —— 4 —— 5 —— 6
```

但视觉必须轻。

---

# 29. Onboarding 文案

避免：

```text
Step 3
Job Preferences
```

优先中文自然语言：

```text
你想找什么工作？
```

```text
你对工作的基本要求是什么？
```

```text
哪些事情可以交给 JobPilot？
```

这是 JobPilot 品牌人格的一部分。

---

# 30. 设置

Settings 不要把所有配置塞进一个页面。

推荐：

```text
个人资料
求职目标
工作偏好
AI 权限
招聘平台
通知
应用设置
```

左侧二级导航。

右侧配置区域。

---

# 31. 表单

输入高度：

```text
44–48px
```

不要过高。

Focus：

```css
border-color: #2563eb;
box-shadow: 0 0 0 3px rgb(37 99 235 / 10%);
```

错误提示区域必须预留空间。

---

# 32. Toggle

Switch 只表示：

```text
开 / 关
```

不要拿 Switch 表示：

```text
接受 / 不接受 / 优先
```

这种多状态数据使用：

* Radio
* Segmented Control
* Select

---

# 33. Tag

Tag 适合：

```text
目标城市
岗位关键词
行业
技能
排除词
```

删除使用：

```text
X
```

不要用 Emoji。

---

# 34. Button

## Primary

深墨色：

```css
background: #17201d;
color: #ffffff;
```

---

## Secondary

浅背景：

```css
background: #eef0ee;
```

---

## Accent

蓝色只用于真正需要强调的动作。

---

## Danger

删除、断开平台等危险操作才使用红色。

---

# 35. 图标

统一：

**Lucide React**

禁止：

* Emoji
* Heroicons + Lucide 混用
* Unicode 字符模拟图标
* 随手写 SVG

---

# 36. 空状态

空状态不要使用巨大插画。

例如：

```text
还没有投递记录

JobPilot 开始工作后，
你的投递都会记录在这里。

开始找工作
```

搭配一个 Lucide Icon 即可。

---

# 37. Loading

禁止全屏巨大 Spinner。

优先：

* Skeleton
* inline spinner
* status text

例如：

```text
正在读取你的求职设置…
```

---

# 38. Toast

Toast 只用于短暂反馈：

```text
设置已保存
简历已更新
平台连接失败
```

重要事件不能只靠 Toast。

---

# 39. 动效

常规：

```text
150–220ms
```

页面进入：

```text
250–400ms
```

Welcome：

允许：

```text
400–700ms
```

禁止：

* 弹跳
* 大幅移动
* 旋转
* 无意义 hover 动画

---

# 40. Reduced Motion

必须支持：

```css
@media (prefers-reduced-motion: reduce)
```

关闭：

* 环境动画
* 页面位移
* 非必要 transition

---

# 41. Reduced Transparency

需要支持：

```css
@media (prefers-reduced-transparency: reduce)
```

透明材质自动变为：

```text
solid surface
```

---

# 42. 桌面窗口

JobPilot 是 Windows 软件。

优先设计：

```text
1280 × 800
```

并保证：

```text
1024 × 700
```

仍然可用。

主要布局最大宽度不要无限扩展。

推荐：

```text
1200–1440px
```

---

# 43. 响应式优先级

V1：

```text
Windows Desktop
```

优先。

不需要为了手机页面破坏桌面体验。

窗口较窄时：

Sidebar 可以缩成 Icon Rail。

---

# 44. 自定义标题栏

如果当前 Electron 架构允许且实现成本合理：

后续可以做轻量自定义 Title Bar。

但 V0.1 UI 重构阶段：

**不为了视觉强行修改 Electron Window 生命周期。**

稳定优先。

---

# 45. Design Tokens

建议建立：

```css
:root {
  --jp-bg: #f6f7f5;
  --jp-bg-soft: #f1f3f1;

  --jp-surface: #ffffff;

  --jp-text-primary: #17201d;
  --jp-text-secondary: #59635f;
  --jp-text-muted: #828b87;

  --jp-border: #e5e9e6;
  --jp-border-hover: #d5dbd7;

  --jp-accent: #2563eb;
  --jp-accent-soft: #eef4ff;

  --jp-agent: #35a36f;
  --jp-agent-soft: #edf8f2;

  --jp-attention: #d99432;
  --jp-attention-soft: #fff7e9;

  --jp-danger: #dc5a5a;
  --jp-danger-soft: #fff1f1;

  --jp-radius-sm: 6px;
  --jp-radius-md: 8px;
  --jp-radius-lg: 12px;
}
```

页面禁止自行创造几十套相似颜色。

---

# 46. 页面视觉层级

所有页面遵守：

```text
Page
    ↓
Primary Task
    ↓
Important State
    ↓
Secondary Information
    ↓
Metadata
```

不要出现：

```text
每块内容视觉权重完全相同
```

---

# 47. JobPilot 独有组件

建议逐渐建立以下设计组件：

```text
AgentStatus
AgentActivity
JobMatchScore
AIRecommendation
AttentionItem
PlatformStatus
ApplicationStatus
StrategyTag
EmptyState
```

这些组件将形成 JobPilot 自己的产品语言。

---

# 48. 禁止项

禁止：

### 视觉

* 蓝紫 AI 渐变
* 大量玻璃卡片
* 卡片套卡片
* 大面积高饱和蓝
* 大量阴影
* 到处 20px+ 圆角
* 巨型数字 KPI Dashboard
* 彩色图标背景方块
* Emoji
* 花哨科技线条
* 赛博朋克效果

### 产品

* 把 JobPilot 做成招聘网站
* 把 JobPilot 做成企业管理后台
* 把 AI 建议伪装成人类消息
* 让所有页面都有相同卡片布局

---

# 49. 最终目标

用户第一次打开应该感觉：

> 这个软件很漂亮，而且很安静。

进入 Dashboard 后应该感觉：

> 我很快就能知道 JobPilot 今天做了什么。

收到 HR 消息应该感觉：

> JobPilot 已经替我把重点整理好了。

使用几天之后应该感觉：

> 它像一个真的在替我处理求职事务的助手，而不是一个自动化脚本。
