/**
 * 数据层冒烟测试（在 Electron 运行时下执行，验证 better-sqlite3 ABI 与持久化链路）。
 * 运行方式：npx electron scripts/smoke-test.cjs
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// 使用独立冒烟测试数据目录，避免污染开发数据。
process.env.JOBPILOT_DATA_DIR = path.resolve(__dirname, '..', 'dev-data', 'smoke');

app.whenReady().then(() => {
  let failures = 0;
  const check = (name, cond) => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}`);
    if (!cond) failures += 1;
  };

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });

    const dbMod = require('../dist-electron/database/database.js');
    dbMod.initDatabase();

    const settingsService = require('../dist-electron/database/services/settingsService.js');
    const resumeRepo = require('../dist-electron/database/repositories/resumeRepository.js');

    // 1. 首次配置标记默认为 false
    check('onboarding_completed 初始为 false', settingsService.getOnboardingCompleted() === false);

    // 2. 设置保存 / 读取回环
    const snapshot = settingsService.getSettingsSnapshot();
    snapshot.profile.name = '测试用户';
    snapshot.profile.currentCity = '无锡';
    snapshot.profile.targetCities = ['苏州', '无锡'];
    snapshot.jobTarget.positions = ['新媒体运营', '运营助理'];
    snapshot.jobTarget.minSalary = 6000;
    snapshot.jobTarget.idealSalary = 9000;
    snapshot.jobTarget.excludedKeywords = ['销售', '保险'];
    snapshot.jobPreferences.maxCommuteMinutes = 45;
    snapshot.jobPreferences.weekendPreference = 'MUST_DOUBLE';
    snapshot.aiPermissions.salary = 'AUTO';
    snapshot.notifications.offer = false;
    settingsService.saveSettingsSnapshot(snapshot);

    const loaded = settingsService.getSettingsSnapshot();
    check('姓名持久化', loaded.profile.name === '测试用户');
    check(
      '目标城市持久化',
      JSON.stringify(loaded.profile.targetCities) === JSON.stringify(['苏州', '无锡']),
    );
    check(
      '目标岗位持久化',
      JSON.stringify(loaded.jobTarget.positions) === JSON.stringify(['新媒体运营', '运营助理']),
    );
    check('薪资持久化', loaded.jobTarget.minSalary === 6000 && loaded.jobTarget.idealSalary === 9000);
    check('排除关键词持久化', loaded.jobTarget.excludedKeywords.length === 2);
    check('通勤时间持久化', loaded.jobPreferences.maxCommuteMinutes === 45);
    check('周末偏好持久化', loaded.jobPreferences.weekendPreference === 'MUST_DOUBLE');
    check('AI 权限持久化', loaded.aiPermissions.salary === 'AUTO');
    check('通知设置持久化', loaded.notifications.offer === false);

    // 3. 首次配置完成标记
    settingsService.setOnboardingCompleted(true);
    check('onboarding_completed 置为 true', settingsService.getOnboardingCompleted() === true);

    // 4. 简历记录写入 / 读取
    const dummyFile = path.join(dbMod.getResumesDir(), 'dummy.pdf');
    fs.writeFileSync(dummyFile, '%PDF-1.4 dummy');
    const rec = resumeRepo.insertResume({
      originalName: '简历.pdf',
      storedName: '1_简历.pdf',
      filePath: dummyFile,
      fileSize: 14,
      mimeType: 'application/pdf',
    });
    check('简历记录写入', rec.id > 0);
    const latest = resumeRepo.getLatestResume();
    check('简历记录读取', latest !== null && latest.originalName === '简历.pdf');

    dbMod.closeDatabase();
  } catch (err) {
    console.error('SMOKE ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'SMOKE RESULT: ALL PASS' : `SMOKE RESULT: ${failures} FAIL`);
  app.exit(failures === 0 ? 0 : 1);
});
