# JobPilot

本地优先的 AI 求职 Agent（Windows 桌面应用）。

## 当前版本

**V0.1**（tag：`v0.1.0`）—— 可运行、可保存数据、可打包部署的桌面应用基础。

## 仓库

https://github.com/Thresh0826/job_Pilot

> 注意：该仓库当前为 **Public**；V0.1 规划中建议使用 Private，如介意请到仓库 Settings 改为 Private。

## 当前实现

- "Quiet Intelligence" 前端设计系统（浅暖灰绿、Design Tokens、克制的 Agent 信号语言）
- Welcome 欢迎页（极简环境光晕、缓慢 ambient 动画）
- 首次配置 Onboarding 六步向导（基础资料 / 简历 / 求职目标 / 工作偏好 / AI 权限 / 招聘平台）
- Dashboard 首页（Agent 状态优先）+ 找工作 / 沟通 / 投递记录 / 设置 页面（V0.1 使用模拟数据）
- 核心设计组件：AgentStatus / AttentionItem / JobCard / JobMatchScore / AIRecommendation 等
- SQLite（better-sqlite3）本地持久化，规范化表结构
- 设置页面可随时修改所有首次配置内容
- 测试模式 / 正式模式隔离（开发默认测试模式，UI 显示测试模式）
- Electron 安全模型：contextIsolation + sandbox + preload IPC，渲染进程无 Node 能力
- 简历文件复制到应用数据目录（不依赖源文件原始位置）
- Windows 安装包构建（electron-builder / NSIS）

## 尚未实现

- BOSS 直聘真实连接与登录
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
JobPilot-Setup-0.1.0.exe
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

- **测试模式（TEST）**：当前默认，仅本地模拟数据，禁止任何真实投递 / 发消息动作。
- **正式模式（PRODUCTION）**：未来版本才允许真实平台动作，当前仅预留状态结构。

## 目录结构

```
electron/          Electron 主进程 / preload / IPC
src/               React 渲染层（pages / components / stores / styles / router）
core/              领域类型与 Zod 校验（profile / strategy / resume / ai / ...）
platforms/         招聘平台适配器接口（base）与 BOSS 占位实现（boss）
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
