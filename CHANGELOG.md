# Changelog

本项目的所有重要变更都会记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-08-17

### 新增

- Welcome 欢迎页（"Quiet Intelligence" 极简环境光晕、缓慢 ambient 动画）
- 首次配置 Onboarding 六步向导（基础资料 / 简历 / 求职目标 / 工作偏好 / AI 权限 / 招聘平台）
- Dashboard 首页 + 找工作 / 沟通 / 投递记录 / 设置 页面（V0.1 使用模拟数据）
- SQLite（better-sqlite3）本地持久化与规范化表结构（16 张表）
- 设置页面可随时修改全部首次配置内容
- 测试模式 / 正式模式隔离（默认测试模式，UI 标识）
- Electron 安全模型：contextIsolation + sandbox + preload IPC，渲染进程无 Node 能力
- 简历文件复制到应用数据目录（不依赖源文件原始位置）
- 招聘平台适配器接口（PlatformAdapter）与 BOSS 占位实现
- Windows 安装包构建（electron-builder / NSIS）

### 前端设计

- "Quiet Intelligence" 设计系统与全局 Design Tokens（`--jp-*`）
- 核心设计组件：AgentStatus / AgentActivity / AttentionItem / JobCard / JobMatchScore / AIRecommendation / PlatformStatus / ApplicationStatus / EmptyState 等
- 浅暖灰绿主题、克制的 Agent 信号语言
- `prefers-reduced-motion` 与 `prefers-reduced-transparency` 支持

### 尚未实现（后续版本）

- BOSS 直聘真实连接与登录
- 自动投递
- AI 分析 / AI 聊天 / 消息监听
- 简历 AI 解析 / 评分
- 邮件 / 微信通知
- 自动更新
- GitHub Actions Release 流程
