/**
 * 测试工具：生成一个最小可读的 .docx（store 方式 zip，仅含 word/document.xml）。
 * 供 candidate-profile-test 使用，避免测试依赖二进制 fixture 文件。
 */
const zlib = require('zlib');

function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // method: store
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(Buffer.concat([local, nameBuf, data]));
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(0, 10); // method: store
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    central.push(Buffer.concat([ch, nameBuf]));
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

function makeDocx(paragraphTexts) {
  const paras = paragraphTexts
    .map(
      (t) =>
        `<w:p><w:r><w:t>${t
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</w:t></w:r></w:p>`,
    )
    .join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`;
  return makeZip([{ name: 'word/document.xml', content: documentXml }]);
}

module.exports = { makeZip, makeDocx };
