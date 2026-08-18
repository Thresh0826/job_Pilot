# JobPilot

本地优先的 AI 求职 Agent（Windows 桌面应用）。

## 当前版本

**V0.2**（tag：`v0.2.0`）—— 桌面应用基础 + BOSS 登录连接（真实 Chrome + Raw CDP）。

## 仓库

https://github.com/Thresh0826/job_Pilot

> 注意：该仓库当前为 **Public**；如介意请到仓库 Settings 改为 Private。

## 当前实现

- "Quiet Intelligence" 前端设计系统（浅暖灰绿、Design Tokens、克制的 Agent 信号语言）
- Welcome 欢迎页（极简环境光晕、缓慢 ambient 动画）
- 首次配置 Onboarding 六步向导（基础资料 / 简历 / 求职目标 / 工作偏好 / AI 权限 / 招聘平台）
- Dashboard 首页（Agent 状态优先）+ 找工作 / 沟通 / 投递记录 / 设置 页面（V0.2 使用模拟数据）
- 核心设计组件：AgentStatus / AttentionItem / JobCard / JobMatchScore / AIRecommendation 等
- SQLite（better-sqlite3）本地持久化，规范化表结构
- 设置页面可随时修改所有首次配置内容
- 测试模式 / 正式模式隔离（开发默认测试模式，UI 显示测试模式）
- Electron 安全模型：contextIsolation + sandbox + preload IPC，渲染进程无 Node 能力
- 简历文件复制到应用数据目录（不依赖源文件原始位置）
- BOSS直聘登录连接（真实 Google Chrome + 独立 Profile + Raw CDP）
- 检查连接 / 断开连接 / Profile 清理
- Windows 安装包构建（electron-builder / NSIS）

## BOSS 连接

- JobPilot 为 **Windows-first** 桌面应用。
- BOSS 使用 **真实 Google Chrome + 独立持久化 Profile + Raw CDP**（**BOSS 正式链路不再使用 Playwright**；Playwright 仅保留为通用自动化能力）。
- 首次连接需要**用户本人**扫码 / 短信 / CAPTCHA 完成登录，JobPilot 不自动处理认证。
- 登录状态（Cookie / Session）保存在 JobPilot 独立 Chrome Profile：
  `<数据目录>/browser/{test|production}/boss/`
- TEST 与 PRODUCTION Profile 物理隔离，互不影响。
- Raw CDP 开发诊断工具位于 `scripts/boss-cdp-spike.mjs`（开发脚本，不进入正式业务调用链）。

## 尚未实现

- 自动投递
- AI 分析 / AI 聊天 / 消息监听
- 简历 AI 解析 / 评分
- 邮件 / 微信通知
- 自动更新
- GitHub Actions Release 流程

## 技术栈

Electron · React · TypeScript · Vite · Zustand · Zod · SQLite · better-sqlite3 · electron-builder

## 本地开发

```bash
npm install
npm run dev
```

> 首次 `npm install` 会通过 `postinstall` 自动下载与 Electron ABI 匹配的 better-sqlite3 预编译二进制，
> 无需本机安装 MSVC / Visual Studio 编译工具链。

## 检查

```bash
npm run lint
npm run typecheck
npm run build
```

数据层冒烟测试（在 Electron 运行时下验证持久化链路）：

```bash
npm run smoke
```

## Windows 打包

```bash
npm run dist
```

构建产物位于 `release/`，文件名为：

```
JobPilot-Setup-0.2.0.exe
```

安装到另一台 Windows 电脑后即可运行，**无需** Node.js / npm / 源码 / 开发环境。

## 数据保存位置

| 场景 | 位置 |
| ---- | ---- |
| 开发模式（未打包） | `<项目根目录>/dev-data/` |
| 正式安装（已打包） | `%APPDATA%\JobPilot\`（即 `app.getPath("userData")`） |

正式数据目录下包含：

```
jobpilot.db      # SQLite 用户数据库
resumes/         # 复制进来的简历文件
```

> 可通过环境变量 `JOBPILOT_DATA_DIR` 覆盖数据目录（用于自动化测试）。

## 运行模式

- **测试模式（TEST）**：当前默认。可用于**读取真实招聘平台数据进行开发和验证**，但**不得执行真实投递、发送 HR 消息等外部写操作**。
- **正式模式（PRODUCTION）**：未来版本才允许真实平台动作，当前仅预留状态结构。

## 目录结构

```
electron/          Electron 主进程 / preload / IPC
src/               React 渲染层（pages / components / stores / styles / router）
core/              领域类型与 Zod 校验（profile / strategy / resume / ai / ...）
platforms/         招聘平台适配器接口（base）与 BOSS 真实集成（boss：Raw CDP 登录 / 搜索）
database/          SQLite 连接、迁移与仓储层
automation/        Agent 状态定义（预留）
shared/            跨进程共享类型与 IPC 契约
scripts/           原生依赖准备与冒烟测试脚本
```

## 未来推荐发布流程

```
开发机
  ↓
Git commit
  ↓
GitHub 仓库（github.com/Thresh0826/job_Pilot）
  ↓
构建 Windows 安装程序
  ↓
GitHub Releases
  ↓
正式电脑下载安装
```

后续版本将增加 GitHub Actions 自动构建。
