/**
 * C4 JD 排版测试（纯 Node，不触碰 Electron/Chrome）。
 * 验证 formatJdText 只做格式整理：换行统一、行尾空白清理、段落空行、小节标题分段，
 * 且绝不改写/增删原文内容。
 */
const { formatJdText } = require('../dist-electron/core/jdFormat.js');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
  if (!cond) failures += 1;
};

/** 去掉全部空白后比较：内容字符必须完全一致（不允许增删改写）。 */
function contentEquals(a, b) {
  return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

// 1. 空输入
check('空输入 → 空字符串', formatJdText('') === '' && formatJdText(null) === '');

// 2. 换行符统一（CRLF / CR → LF）
{
  const out = formatJdText('第一行\r\n第二行\r第三行');
  check('CRLF/CR 统一为 LF', out === '第一行\n第二行\n第三行', JSON.stringify(out));
}

// 3. 连续空行压缩为段落空行
{
  const out = formatJdText('第一段\n\n\n\n第二段');
  check('3+ 空行 → 1 空行', out === '第一段\n\n第二段', JSON.stringify(out));
}

// 4. 行尾空白清理
{
  const out = formatJdText('职责一   \n职责二\t\n');
  check('行尾空白清除', out === '职责一\n职责二', JSON.stringify(out));
}

// 5. 小节标题独立成段（前后补空行），原文不变
{
  const input = '公司负责网络产品。\n岗位职责：\n1、负责测试\n2、输出报告\n任职要求：\n本科及以上';
  const out = formatJdText(input);
  check(
    '标题行前后有段落空行',
    out.includes('公司负责网络产品。\n\n岗位职责：\n\n1、负责测试') &&
      out.includes('2、输出报告\n\n任职要求：\n\n本科及以上'),
    JSON.stringify(out),
  );
  check('标题分段不改写原文', contentEquals(out, input));
}

// 6. 原文内容完整保留（无 AI 摘要/改写）
{
  const input =
    '岗位职责：\n1、负责网络设备测试。\n2、编写测试用例。\n任职要求：\n1、本科及以上学历。\n2、熟悉网络协议。';
  const out = formatJdText(input);
  check('内容字符与原文完全一致', contentEquals(out, input));
  check('数字编号保留', out.includes('1、负责网络设备测试。') && out.includes('2、编写测试用例。'));
}

// 7. 无小节标题时仅做空白整理
{
  const input = '普通描述。\n\n\n下一段。  \n';
  const out = formatJdText(input);
  check('无标题文本仅整理空白', out === '普通描述。\n\n下一段。', JSON.stringify(out));
}

// 8. 首尾空行清理
{
  const out = formatJdText('\n\n内容开头\n\n');
  check('首尾空行清理', out === '内容开头', JSON.stringify(out));
}

// 9. 冒号变体标题也识别（"任职要求:"）
{
  const out = formatJdText('第一条\n任职要求:\n本科\n');
  check('冒号变体标题分段', out.includes('第一条\n\n任职要求:\n\n本科'), JSON.stringify(out));
}

console.log(failures === 0 ? 'JD FORMAT TEST: ALL PASS' : `JD FORMAT TEST: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
