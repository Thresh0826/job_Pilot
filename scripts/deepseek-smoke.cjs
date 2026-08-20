/**
 * V0.4-D DeepSeek 真实 API 冒烟脚本（Electron 运行时，可选）。
 * 用法：
 *   $env:JOBPILOT_DEEPSEEK_KEY = "sk-xxx"
 *   npx electron scripts/deepseek-smoke.cjs
 * 验证：API Key / 模型连通性 / 决策输出解析（不写库）。
 * 注意：简历与 JD 会发送给 DeepSeek；脚本仅用于验收，不进入常规测试。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const TEST_DIR = path.resolve(__dirname, '..', 'dev-data', `deepseek-smoke-${process.pid}`);
process.env.JOBPILOT_DATA_DIR = TEST_DIR;

app.whenReady().then(async () => {
  try {
    const key = process.env.JOBPILOT_DEEPSEEK_KEY || '';
    if (!key) {
      console.log('SKIP: 未设置 JOBPILOT_DEEPSEEK_KEY');
      app.exit(0);
      return;
    }
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    const dbMod = require('../dist-electron/database/database.js');
    dbMod.initDatabase();

    const { DeepSeekProvider } = require('../dist-electron/electron/main/services/llm/deepseekProvider.js');
    const provider = new DeepSeekProvider({ apiKey: key, model: process.env.JOBPILOT_DEEPSEEK_MODEL || 'deepseek-chat' });

    const input = {
      profile: {
        name: '测试候选人', phone: '', email: '', workYears: '3年', summary: '',
        education: [{ startDate: '2022', endDate: '2026', school: '示例大学', major: '软件工程', degree: '本科' }],
        workExperience: [], projectExperience: [],
        skills: ['Python', 'Pytest', 'Selenium', 'MySQL'],
        certificates: [], languages: [],
      },
      rules: {
        targetJobs: ['测试开发'], targetCities: ['无锡'], minSalary: 8000,
        acceptOutsourcing: false, weekendPreference: 'MUST_DOUBLE',
        degreeTolerance: 'FLEXIBLE', experienceTolerance: 'FLEXIBLE', excludedKeywords: ['销售'],
      },
      job: {
        platform: 'BOSS', platformJobId: 'smoke', title: '自动化测试工程师', company: '示例科技',
        city: '无锡', salary: '10-15K', degree: '本科', experience: '1-3年', jobLabels: ['双休'],
        jdText: '岗位职责：负责自动化测试开发与质量保障，包括测试用例设计、接口自动化与持续集成流水线维护。任职要求：熟练 Python、Pytest、Selenium，熟悉 MySQL 数据库，了解 Docker 容器化部署。福利：周末双休，五险一金。',
      },
    };

    console.log(`调用 DeepSeek ${provider.name} …`);
    const result = await provider.decide(input);
    console.log('SMOKE RESULT:', JSON.stringify(result, null, 2));
    console.log(result.verdict === 'AUTO_APPLY' || result.verdict === 'REVIEW' || result.verdict === 'SKIP'
      ? 'DEEPSEEK SMOKE: ALL PASS'
      : 'DEEPSEEK SMOKE: FAIL');
    dbMod.closeDatabase();
    app.exit(0);
  } catch (err) {
    console.error('DEEPSEEK SMOKE ERROR:', err);
    app.exit(1);
  } finally {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // 忽略
    }
  }
});
