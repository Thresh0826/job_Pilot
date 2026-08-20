# Changelog

本项目的所有重要变更都会记录在此文件中。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-08-20

### Candidate Profile / 简历管理（V0.4-A）

- 简历上传 / 查看 / 更换 / 移除（PDF / DOCX，本地解析，不依赖第三方服务）
- 版面结构解析：PDF 先还原「内容块 + 视觉顺序」，再按 Section 语义识别；不依赖固定模板 / 左右布局 / 栏目名
- 教育经历：多段分别解析、多行版式合并、tab 字段行（学校|专业|学历|时间）识别、无法确定留空
- 工作 / 实习经历：每段独立记录（时间在左 / 在右、公司+右侧时间），公司 / 职位 / 时间 / 内容对应不串段
- 技能解析：从技能描述中识别技术实体 / 能力短语（Python、Pytest、Selenium、Java、Java单元测试、PO模式、CI/CD…），过滤垃圾词
- 「我的资料」页面：候选人资料只读视图 / 可编辑修正 / 保存确认 / 解析不完整提示
- 更换简历明确提示会重新生成资料；原始简历与结构化资料均持久化（TEST / PRODUCTION 隔离）

### 单岗位决策（V0.4-B）

- 求职规则设置：目标岗位方向 / 城市 / 最低薪资 / 外包 / 单双休 / 学历经验容忍 / 排除关键词，用户明确规则优先
- 本地可解释决策引擎：硬规则违反 → SKIP；明显符合 → AUTO_APPLY；存在关键风险 / 不确定 → REVIEW
- 「简历没写」≠「用户不会」：JD 要求但资料未体现 → REVIEW 而非臆断
- 决策结果持久化：同一岗位复用；资料 / 规则 / JD 变化后旧结果标记过期
- Jobs 详情区「JobPilot 决策」模块：单岗位分析 + 简短理由（可展开）

### 批量自动决策（V0.4-C）

- 「分析本次新岗位」：一次搜索运行 = 一个发现批次，自动读取 JD 并批量决策
- 已有完整 JD 直接决策不重复读取；缺 JD 有节制地顺序读取（节流），失败标记后不立即重试
- 读取结果不是有效详情（JD 过短）→ 不决策、标记失败；平台安全验证 / 登录异常 → 单岗位跳过继续
- REVIEW 队列：只列出需要用户决定的岗位，可「允许投递 / 跳过」，仅改变决策状态
- 统一状态模型：总岗位 = 待分析 + 适合自动投递 + 需要确认 + 已跳过 + 失败，统计与队列严格一致
- 可停止 / 继续分析，已完成结果保留；统计避免重复（platformJobId 去重）

### LLM 语义决策（V0.4-D）

- LLM Provider 抽象（输入输出契约与本地引擎一致，可替换实现）
- DeepSeek Provider（deepseek-chat，OpenAI 兼容 HTTP）：结构化提示词 → 严格 JSON 输出，zod 校验
- 决策流程：配置 API Key → LLM 语义判断；未配置或调用失败 → 自动回退本地规则引擎
- 硬规则护栏：用户明确规则优先级高于 LLM，LLM 结果若违反 → 强制 SKIP
- Settings「AI 模型」配置（Key 仅存本机，不入 Git）；真实 API 冒烟脚本（deepseek:smoke）

### 已知问题（登记，不阻塞发布）

- 简历自动解析并非 100% 准确：产品策略为自动解析初稿 + 用户人工确认修正
- JD formatting polish deferred：详情/JD 排版少量显示细节问题，登记为后续统一 UI/UX 优化项
- BOSS 批量详情读取可能触发平台风控，导致部分岗位进入 FAILED；当前不绕过平台验证，后续单独优化稳定性

## [0.3.0] - 2026-08-19

### BOSS 岗位发现（V0.3-A）

- 真实 BOSS 搜索页岗位发现：Network 被动捕获页面自身 joblist 响应（`/wapi/zpgeek/search/joblist.json`）
- 不主动调用 BOSS joblist API；只消费当前搜索 sessionId 的响应，requestId 单次消费，listener 自动清理
- BOSS joblist 响应分类：SUCCESS / SECURITY_RESTRICTED / LOGIN_EXPIRED / INVALID_RESPONSE
- 城市解析（BossCityResolver）与 BOSS→JobPilot 统一 Job Model 映射

### 岗位详情 / JD 后台读取（V0.3-B）

- 独立「详情 tab」后台读取真实岗位详情，不干扰用户当前搜索页
- JobDetail + BossJobDetail + Mapper + IPC / UI 全链路
- 详情 tab 复用（不随每次查看创建/关闭），断开连接清理

### 多批岗位发现（V0.3-C1）

- 无限滚动触发页面自身加载，捕获后续批次 joblist 响应（JoblistStream 队列式监听）
- 单次搜索按 platformJobId 去重；保守默认 maxJobs=50 / maxBatches=4
- 明确停止条件：hasMore=false / maxJobs / maxBatches / 滚动无新响应 / 总超时 / 安全限制 / 登录失效 / CDP 断开

### 岗位持久化（V0.3-C2）

- jobs 表：唯一键 platform + platformJobId，跨搜索 / 跨重启岗位历史
- 首次发现 NEW；再次发现更新可变字段与 last_seen_at，first_seen_at 不变，SEEN 不退回 NEW
- 详情读取成功后标记 SEEN 并保存 JD 文本；失败不标记
- TEST / PRODUCTION 数据物理隔离，migration 幂等

### 自动搜索计划（V0.3-C3）

- 求职目标持久化（目标岗位 / 相关岗位关键词 / 目标城市），重启保留
- 自动生成搜索任务并顺序执行，进度（正在搜索 X/N、已发现 总/新）与结果汇总
- 部分任务失败不中断；登录失效 / 安全验证 / 连接断开 / 未连接 → 停止并明确提示
- “新岗位”= 本次运行前历史中不存在的岗位；重跑相同计划不重复计新

### Jobs 工作台（V0.3-C4）

- 岗位列表 + 详情区域双栏布局；详情 Loading / Success / Error 明确反馈
- NEW→SEEN 即时反馈，新岗位计数同步；快速切换岗位时详情与选中岗位对应
- JD 基础格式整理（换行 / 段落 / 小节标题分段），不改写原文
- 页面状态（搜索条件 / 列表 / 选中岗位 / 详情 / 计划汇总）在应用运行期间保持

### 已知问题

- JD formatting polish deferred：详情/JD 排版仍存在少量显示细节问题，登记为后续统一 UI/UX 优化项，不影响读取与内容完整性

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
