'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeSettings } = require('./validation');

class SettingsStore {
  constructor(filePath, logicalCpuCount) {
    this.filePath = filePath;
    this.logicalCpuCount = logicalCpuCount;
  }

  read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return sanitizeSettings(JSON.parse(raw), this.logicalCpuCount);
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      return sanitizeSettings({}, this.logicalCpuCount);
    }
  }

  write(next) {
    const clean = sanitizeSettings(next, this.logicalCpuCount);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(clean, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    });
    fs.renameSync(temporaryPath, this.filePath);
    return clean;
  }
}

module.exports = { SettingsStore };

