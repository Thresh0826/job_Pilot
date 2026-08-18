/**
 * 数据层冒烟测试（在 Electron 运行时下执行，验证 better-sqlite3 ABI 与持久化链路）。
 * 运行方式：npx electron scripts/smoke-test.cjs
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// 使用每次运行唯一的冒烟测试数据目录，避免上一次运行的进程残留文件锁导致清理失败。
process.env.JOBPILOT_DATA_DIR = path.resolve(__dirname, '..', 'dev-data', `smoke-${process.pid}`);

app.whenReady().then(async () => {
  let failures = 0;
  let cdpManager = null;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
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

    // 5. 平台状态持久化（V0.2）
    const settingsRepo = require('../dist-electron/database/repositories/settingsRepository.js');
    check('BOSS 初始状态 DISCONNECTED', settingsRepo.getBossPlatformStatus().status === 'DISCONNECTED');
    settingsRepo.saveBossPlatformStatus('CONNECTED');
    const connected = settingsRepo.getBossPlatformStatus();
    check(
      'BOSS 连接状态持久化',
      connected.status === 'CONNECTED' &&
        connected.lastConnectedAt !== null &&
        connected.lastCheckedAt !== null,
    );
    settingsRepo.saveBossPlatformStatus('EXPIRED');
    const expired = settingsRepo.getBossPlatformStatus();
    check('BOSS 登录失效保留 lastConnectedAt', expired.status === 'EXPIRED' && expired.lastConnectedAt !== null);
    settingsRepo.saveBossPlatformStatus('DISCONNECTED');
    const disconnected = settingsRepo.getBossPlatformStatus();
    check('BOSS 断开后 connected_at 清空', disconnected.status === 'DISCONNECTED' && disconnected.lastConnectedAt === null);

    // 6. BrowserManager 初始状态（V0.2，不实际启动浏览器）
    const BrowserManager = require('../dist-electron/automation/browser/BrowserManager.js');
    check('BrowserManager 初始未运行', BrowserManager.isRunning() === false);
    check('BrowserManager 初始无 context', BrowserManager.getContext() === null);

    // 7. Raw CDP 正式模块（真实 Chrome，不涉及 BOSS 登录）
    const { ChromeCDPManager, findBossTarget } = require('../dist-electron/automation/cdp/ChromeCDPManager.js');
    const { BossAdapter } = require('../dist-electron/platforms/boss/BossAdapter.js');
    cdpManager = new ChromeCDPManager();
    const cdpBoss = new BossAdapter(cdpManager);

    // 7.1 Chrome executable detection
    let chromePath = '';
    try {
      chromePath = cdpManager.findChrome();
    } catch {
      // 未安装
    }
    check('Chrome executable detection', chromePath.length > 0, chromePath);

    // 7.2 TEST / PRODUCTION profile 隔离
    const testProfile = cdpManager.getProfileDir('TEST');
    const prodProfile = cdpManager.getProfileDir('PRODUCTION');
    check(
      'TEST/PRODUCTION profile 不同',
      testProfile !== prodProfile && testProfile.includes('test') && prodProfile.includes('production'),
    );

    // 7.3 已有 zhipin target 优先复用（选择逻辑）
    const reuseSel = findBossTarget([
      { targetId: 'a', type: 'page', url: 'https://www.zhipin.com/web/geek/jobs' },
      { targetId: 'b', type: 'page', url: 'about:blank' },
    ]);
    check('已有 zhipin target 优先复用', reuseSel !== null && reuseSel.targetId === 'a');
    check(
      '无 zhipin target 时不覆盖（返回 null）',
      findBossTarget([{ targetId: 'x', type: 'page', url: 'about:blank' }]) === null,
    );

    // 7.4 CDP port 选择
    const cdpPort = await cdpManager.findAvailablePort();
    check('CDP port 选择（可用端口）', cdpPort >= 9223);

    // 7.5 启动专用 Chrome + RawCDP send/response
    await cdpManager.ensureChrome('TEST');
    const cdpClient = await cdpManager.connect('TEST');
    check('RawCDP websocket connected', !cdpClient.isClosed);
    const ver = await cdpClient.send('Browser.getVersion');
    check('RawCDP send/response id 匹配', !!ver && typeof ver.product === 'string', (ver && ver.product) || '');

    // 7.6 checkLoginStatus 只读（不创建 target、不导航）
    const targetsBefore = (await cdpManager.getPageTargets('TEST')).length;
    const statusNoTarget = await cdpBoss.checkLoginStatus('TEST');
    const targetsAfter = (await cdpManager.getPageTargets('TEST')).length;
    check(
      'checkLoginStatus 只读（无 BOSS target → UNKNOWN）',
      statusNoTarget === 'UNKNOWN' && targetsBefore === targetsAfter,
    );

    // 7.7 close 清理 + 手动关闭后可恢复
    await cdpManager.close('TEST');
    check('close 后 isRunning false', !cdpManager.isRunning('TEST'));
    await cdpManager.ensureChrome('TEST');
    check('重启后 isRunning true', cdpManager.isRunning('TEST'));
    await cdpManager.close('TEST');
    check('再次 close 后 isRunning false', !cdpManager.isRunning('TEST'));

    // 7.8 清理测试用 profile
    await cdpManager.clearProfile('TEST');

    dbMod.closeDatabase();
  } catch (err) {
    console.error('SMOKE ERROR:', err);
    failures += 1;
    if (cdpManager) {
      try {
        await cdpManager.close('TEST');
      } catch {
        // 忽略
      }
    }
  }

  console.log(failures === 0 ? 'SMOKE RESULT: ALL PASS' : `SMOKE RESULT: ${failures} FAIL`);

  // 清理本次运行产生的临时数据目录（best-effort）。
  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });
  } catch {
    // 忽略清理失败。
  }

  app.exit(failures === 0 ? 0 : 1);
});
