# JobPilot 项目架构

## 一、产品架构

JobPilot 是一个 Windows 本地桌面应用，整体采用本地优先架构。

主要分为：

```text
Renderer UI
    ↓
Preload / IPC
    ↓
Electron Main + Core Services
    ↓
本地数据 / 外部招聘平台
```

Renderer 负责页面展示和用户操作。

涉及系统权限、文件、数据库、浏览器自动化等能力统一放在 Renderer 之外。

---

## 二、当前技术栈

V0.1 已确定技术栈：

```text
桌面框架       Electron
前端           React
语言           TypeScript
构建           Vite
状态管理       Zustand
数据校验       Zod
数据库         SQLite
SQLite Driver  better-sqlite3
Windows 打包   electron-builder
图标           lucide-react
```

普通功能开发不得随意替换主要技术栈。

只有出现明确技术阻塞时，才考虑架构级变更。

---

## 三、Renderer

React Renderer 当前主要包含：

```text
Welcome
Onboarding
Dashboard
Jobs
Messages
Applications
Settings
```

Renderer 负责：

* 页面展示
* 导航
* 表单
* 展示状态
* 用户交互

Renderer 不负责：

* 文件系统
* SQLite
* Playwright
* Browser Profile
* 系统级权限操作
* 原始 Cookie / Session 管理

---

## 四、Electron 权限边界

高权限调用遵循：

```text
React Renderer
      ↓
Preload API
      ↓
IPC
      ↓
Electron Main
      ↓
Service / Repository / Automation
```

保持：

`contextIsolation = true`

Preload 只暴露完成业务所需的最小 API。

IPC 保持类型化。

必要输入继续使用现有 Zod / TypeScript 规则进行验证。

---

## 五、本地数据库

SQLite 是 JobPilot 当前主要结构化本地数据库。

现有数据主要包括：

```text
应用设置
用户档案
简历信息
求职偏好
AI 权限
通知偏好
招聘平台账号元数据
岗位历史（jobs：平台岗位唯一键 + NEW/SEEN + first_seen_at / last_seen_at）
求职目标（job_seek_target：目标岗位 / 相关关键词 / 目标城市，V0.3-C3）
```

React 页面不得直接执行 SQL。

数据访问方向：

```text
UI
↓
IPC / Service
↓
Repository
↓
SQLite
```

---

## 六、用户数据位置

正式环境用户数据统一位于：

```ts
app.getPath("userData")
```

概念结构：

```text
%APPDATA%\JobPilot\
├─ jobpilot.db
├─ resumes/
├─ browser/
├─ logs/
└─ config/
```

目录按实际需求创建，不要求一开始全部存在。

开发和测试数据必须与正式数据隔离。

---

## 七、TEST / PRODUCTION 隔离

JobPilot 支持：

```text
TEST
PRODUCTION
```

TEST 用于开发和安全测试。

未来涉及：

* 真正投递
* 真正发送 HR 消息
* 真实招聘平台操作

等行为时，TEST 默认不得执行真实外部动作。

登录和 Browser Profile 同样需要隔离。

例如：

```text
userData/
└─ browser/
   ├─ test/
   │  └─ boss/
   └─ production/
      └─ boss/
```

TEST 不得复用 PRODUCTION Profile。

---

## 八、简历存储

用户上传简历后，JobPilot 应维护自己的本地副本。

不得长期依赖用户原始文件位置。

正式简历文件应保存到应用 `userData` 目录下。

真实简历属于隐私数据，不得提交 Git。

---

## 九、招聘平台架构

招聘平台属于外部 Integration，不属于核心业务实现。

统一通过：

`PlatformAdapter`

进行抽象。

概念结构：

```text
PlatformAdapter
      │
      ├─ BossAdapter
      ├─ ZhilianAdapter
      ├─ Job51Adapter
      └─ LiepinAdapter
```

当前优先接入：

**BOSS直聘**

Core Service 应尽量依赖平台抽象，而不是直接依赖 BOSS 页面结构。

未来平台能力可能包括：

```ts
searchJobs()
getJobDetail()
apply()
getMessages()
sendMessage()
```

早期版本允许平台 Adapter 只实现部分能力。

尚未支持的方法必须明确标记为未实现，禁止伪造成功结果。

> V0.2 起，BOSS 的 Browser Driver 为「真实 Google Chrome + 独立 Profile + Raw CDP」，见「十一、浏览器自动化」。

---

## 十、BOSS 实现边界

以下 BOSS 专属内容统一放在 BOSS Integration / Adapter 中：

* URL
* Selector
* 登录状态判断
* 岗位列表解析
* JD 解析
* 投递动作
* 消息解析

不得把 BOSS Selector 或平台规则散落到：

* React 页面
* 通用 Core
* 无关 Service

---

## 十一、浏览器自动化

BOSS（V0.2 起）使用：

```text
真实 Google Chrome
+ 独立持久化 Profile
+ Raw Chrome DevTools Protocol（Raw CDP）
```

Playwright 仍保留为通用自动化能力（`automation/browser/BrowserManager`），
但 **BOSS 正式路径不再调用 Playwright**。

Browser Automation 属于：

```text
Electron Main / Automation Service
```

不得直接在 Renderer 中运行。

每个招聘平台应使用 JobPilot 自己管理的 Browser Profile。

TEST / PRODUCTION 的 Profile、Cookie、LocalStorage、Session 必须物理隔离。

禁止操作用户日常使用的 Chrome / Edge 默认 Profile。

认证状态通过专属 Browser Profile 持久化。

不要把原始 Cookie 复制到 SQLite 作为主要认证方案。

JobPilot 不实现或尝试绕过：

* CAPTCHA
* 短信验证
* 扫码验证
* 招聘平台安全控制

需要人工认证时，由用户完成。

---

## 十二、Browser Manager

BOSS 浏览器生命周期由：

```text
automation/cdp/ChromeCDPManager
automation/cdp/RawCDPClient
```

管理。

ChromeCDPManager 负责：

* 定位系统 Google Chrome
* 独立 Profile（TEST / PRODUCTION 隔离）
* 可用 CDP port 选择与归属校验（不连接其它软件的 Chrome CDP）
* 启动 chrome.exe / 等待 CDP ready
* Raw CDP 连接（RawCDPClient）
* target/page session（已有 BOSS target 优先复用）
* close / profile clear

同一个 persistent profile 不得同时被多个浏览器实例占用。

应用退出时：

关闭 JobPilot 管理的专用 Chrome。

但不得删除需要长期保留的 Profile 数据。

---

## 十三、平台账号状态

SQLite 可以保存平台连接元数据，例如：

```text
platform
最近已知状态
最后连接时间
最后检查时间
```

但 SQLite 不作为真实登录状态的最终事实来源。

真实认证状态存在 Browser Profile 中。

例如数据库保存：

```text
CONNECTED
```

只能表示“最近一次检查为已连接”。

不能保证当前 Session 一定仍有效。

---

## 十四、AI 架构

V0.1 尚未正式实现 AI 能力。

后续 AI 应通过独立 Provider / Service 抽象接入。

不要把核心业务强绑定某一个模型提供商。

未来 AI 能力可能包括：

```text
简历理解
岗位匹配
JD 总结
招聘消息分类
回复建议
每日求职总结
```

AI 对用户经历、技能和背景的回答必须来源于真实：

* 用户档案
* 简历
* 配置数据

不得编造求职者不存在的经历或能力。

---

## 十五、前端设计

正式前端设计规范：

`docs/frontend-design-system.md`

当前设计方向：

```text
Quiet Intelligence
安静的智能
```

新增页面或组件应遵循现有视觉系统，不应自行创造另一套页面语言。

---

## 十六、Windows 打包

JobPilot 必须始终能够作为独立 Windows 软件发布。

主要产物：

```text
JobPilot-Setup-x.x.x.exe
```

正式使用电脑不得要求安装：

```text
Node.js
npm
Git
DeepSeek Harness
源码
开发环境
```

修改：

* Native Module
* Playwright
* Browser
* 文件路径

等功能时，必须同时考虑：

```text
npm run dev
```

和正式 Electron 打包环境。

不能只保证开发模式运行。

---

## 十七、Git 与隐私

Git 仓库只保存：

* 源代码
* 非敏感配置
* 项目文档
* 测试代码

禁止提交：

```text
.env
API Key
真实简历
用户数据库
Cookie
Session
Browser Profile
真实求职信息
私人聊天记录
敏感日志
```

安装包和运行数据默认不进入源码 Git 历史。

安装包可以在需要时通过 GitHub Release 单独发布。

---

## 十八、架构修改原则

本文件记录当前已经确定的架构，但不是永远不可修改。

如果未来确实需要调整架构：

1. 先说明当前方案的实际限制。
2. 优先寻找最小兼容修改。
3. 尽量保证已有用户数据兼容。
4. 修改完成并验证后更新本文件。

禁止仅为了“架构看起来更高级”而进行重构。
