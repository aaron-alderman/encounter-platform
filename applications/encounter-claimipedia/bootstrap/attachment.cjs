'use strict';
// Mechanical transport for operator-mounted immutable application files.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function mountAttachments(root) {
  const mount = fs.realpathSync(root);
  if (!fs.statSync(mount).isDirectory()) throw Error('Attachment root must be a directory');
  return descriptor => {
    if (!descriptor) return null;
    const { path: relative, sha256, bytes } = descriptor;
    if (typeof relative !== 'string' || /[\\\u0000-\u001f\u007f-\u009f]/u.test(relative)
        || relative.split('/').some(part => part === '' || part === '.' || part === '..')
        || path.isAbsolute(relative) || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)
        || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > 16 * 1024 * 1024) return null;
    const file = path.join(mount, relative);
    try {
      if (fs.realpathSync(file) !== file) return null;
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const info = fs.fstatSync(fd);
        if (!info.isFile() || info.size !== bytes) return null;
        const data = Buffer.allocUnsafe(bytes + 1);
        let read = 0;
        while (read < data.length) {
          const count = fs.readSync(fd, data, read, data.length - read, null);
          if (count === 0) break;
          read += count;
        }
        if (read !== bytes) return null;
        const body = data.subarray(0, read);
        if (createHash('sha256').update(body).digest('hex') !== sha256) return null;
        const filename = encodeURIComponent(path.basename(relative))
          .replace(/[!'()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
        return { body, disposition: "attachment; filename*=UTF-8''" + filename };
      } finally { fs.closeSync(fd); }
    } catch {
      return null;
    }
  };
}
module.exports = { mountAttachments };
