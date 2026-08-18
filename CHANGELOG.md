# Changelog

本项目的所有重要变更都会记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-08-18

### BOSS 连接

- BOSS直聘登录连接：真实 Google Chrome + 独立持久化 Profile + Raw CDP（RawCDPClient / ChromeCDPManager）
- 用户本人扫码 / 短信 / CAPTCHA 完成登录，JobPilot 不自动处理认证
- 登录状态（Cookie / Session）保存在 JobPilot 独立 Chrome Profile
- TEST / PRODUCTION Profile 物理隔离，互不影响
- 登录状态检查（只读：Target.getTargets URL 判断，不导航、不创建页面）
- 检查连接 / 重新连接 / 断开连接
- 断开连接：关闭专用 Chrome + 清理当前模式 Profile（带重试）
- 用户手动关闭 Chrome 后可自动恢复并重新连接
- 平台状态持久化：status / connected_at / last_checked_at（SQLite 仅存元数据）
- BOSS 正式链路不再使用 Playwright（Playwright BrowserManager 保留为通用能力）
- packaged Windows 支持：打包后定位 Chrome、spawn、Raw CDP WebSocket 正常

### 其它

- Raw CDP 开发诊断工具 `scripts/boss-cdp-spike.mjs`（开发脚本，不进入正式业务调用链）
- 冒烟测试扩展：Chrome 检测 / Profile 隔离 / RawCDP 收发 / 只读检测 / close 清理 / 复用逻辑

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
