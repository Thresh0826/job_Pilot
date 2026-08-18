# JobPilot Agent 工作规则

本文件适用于所有在 JobPilot 仓库中工作的 AI Coding Agent。

## 一、基本原则

* JobPilot 是一个 Windows 优先、本地优先的 AI 求职桌面应用。
* 当前已经正常工作的功能默认视为稳定功能，除非当前任务明确要求，否则不要修改。
* 遵循最小修改原则，不进行与当前任务无关的重构。
* 优先复用已有架构、组件、Store、Repository、IPC 和类型定义。
* 不得自行提前实现后续版本功能。

## 二、Token 使用效率

* 开始任务时先搜索定位相关文件，再读取必要内容。
* 只读取完成当前任务所需的文件和代码范围。
* 没有明确原因时，不递归扫描整个仓库。
* 同一个任务中，不要重复读取已经获取过的文件。
* 实施计划保持简短。
* 执行过程中避免输出冗长分析。
* 最终不要复述完整修改代码或大段文件内容。
* 除非任务明确需要，否则不要使用 subagent。
* 达到当前任务验收标准后立即停止，不继续扩展功能。

## 三、前端

任何涉及前端 UI、视觉样式或交互表现的修改，在开始之前必须阅读：

`docs/frontend-design-system.md`

该文件是 JobPilot 当前唯一有效的前端视觉规范。

UI 修改不得无故改变：

* 业务逻辑
* SQLite 数据结构
* IPC 契约
* 数据持久化行为

除非当前任务明确要求。

## 四、架构

涉及以下内容时：

* Electron
* IPC
* SQLite
* 本地存储
* Browser Automation
* Playwright
* PlatformAdapter
* Core Service
* 数据目录
* 应用架构

应按需阅读：

`docs/architecture.md`

不要在没有明确技术原因的情况下重新设计已有架构。

## 五、版本范围

涉及功能开发或版本规划时，应阅读：

`docs/roadmap.md`

只实现当前版本规定的内容。

禁止因为后续功能“顺手可以做”就提前实现下一版本。

## 六、Electron 安全

* Renderer 不得直接访问 Node.js、文件系统、SQLite、Playwright、Browser Profile 等高权限能力。
* 高权限操作应位于 Electron Main。
* Renderer 通过 preload + IPC 使用这些能力。
* 保持现有 `contextIsolation` 等 Electron 安全机制。
* IPC 输入继续遵守项目已有 TypeScript / Zod 校验规则。

## 七、本地数据与隐私

正式用户数据必须存储在 Electron：

`app.getPath("userData")`

对应的应用数据目录中。

开发 / 测试数据必须与正式数据隔离。

TEST 与 PRODUCTION 不得共用：

* 登录状态
* Cookie
* Session
* Browser Profile

以下内容禁止提交到 Git：

* 真实简历
* 用户数据库
* Cookie
* Session
* Browser Profile
* API Key
* `.env`
* 招聘聊天记录
* 用户个人资料
* 包含敏感信息的日志

## 八、TypeScript 与代码质量

* 保持 TypeScript strict。
* 不得使用 `any` 或不安全类型转换单纯绕过类型错误。
* 优先使用直接、清晰、可维护的实现。
* 不要为了未来假设需求提前创建大量抽象层或空架构。

## 九、验证

开发过程中优先运行与当前修改相关的定向检查，避免无意义重复构建。

版本级任务完成前，执行项目已有的最终检查：

```bash
npm run lint
npm run typecheck
npm run build
npm run dist
```

存在相关自动测试时，同时运行对应测试。

如果检查失败：

1. 判断真实原因。
2. 在当前任务范围内修复。
3. 重新执行必要检查。

未经验证或验证失败的内容，不得描述为“已完成”。

## 十、最终汇报

最终汇报保持简洁，只需要说明：

* 完成了什么
* 主要修改文件
* 验证结果
* 仍需人工验证的内容
* 真实存在的问题

不要输出冗长的开发过程复盘。
