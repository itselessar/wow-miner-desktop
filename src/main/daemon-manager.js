'use strict';

const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { DaemonRpc } = require('./daemon-rpc');

const WAIT_STEP_MS = 500;
const WAIT_LIMIT_MS = 30_000;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class DaemonManager extends EventEmitter {
  constructor() {
    super();
    this.rpc = new DaemonRpc();
    this.child = null;
    this.owned = false;
    this.starting = false;
    this.sessionStartedAt = null;
    this.lastExit = null;
  }

  binaryPath() {
    const root = app.isPackaged
      ? process.resourcesPath
      : path.resolve(__dirname, '..', '..', 'resources');
    return path.join(root, 'wownero', 'wownerod.exe');
  }

  defaultDataDirectory() {
    return path.join(app.getPath('userData'), 'blockchain');
  }

  emitLog(level, message) {
    const clean = String(message || '').replace(/[\r\n]+$/g, '').slice(0, 2000);
    if (!clean) return;
    this.emit('log', { timestamp: Date.now(), level, message: clean });
  }

  async isReachable() {
    try {
      await this.rpc.getInfo();
      return true;
    } catch {
      return false;
    }
  }

  async start(settings) {
    if (this.starting) throw new Error('The node is already starting.');
    if (await this.isReachable()) {
      this.owned = false;
      this.emitLog('info', 'Attached to an existing local Wownero daemon.');
      return { attached: true };
    }

    const executable = this.binaryPath();
    if (!fs.existsSync(executable)) {
      throw new Error('Wownero runtime is missing. Run npm run vendor:fetch before starting the app.');
    }

    this.starting = true;
    this.lastExit = null;
    const dataDirectory = settings.dataDirectory || this.defaultDataDirectory();
    fs.mkdirSync(dataDirectory, { recursive: true });
    const logPath = path.join(app.getPath('userData'), 'wownerod.log');

    const args = [
      `--data-dir=${dataDirectory}`,
      '--rpc-bind-ip=127.0.0.1',
      '--rpc-bind-port=34568',
      '--no-zmq',
      '--no-igd',
      '--non-interactive',
      `--log-file=${logPath}`,
      '--log-level=0'
    ];
    if (settings.pruneBlockchain) args.push('--prune-blockchain');

    this.emitLog('info', `Starting local Wownero node in ${dataDirectory}`);
    this.child = spawn(executable, args, {
      cwd: path.dirname(executable),
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.owned = true;

    this.child.stdout.on('data', (chunk) => this.emitLog('daemon', chunk.toString('utf8')));
    this.child.stderr.on('data', (chunk) => this.emitLog('warning', chunk.toString('utf8')));
    this.child.once('error', (error) => {
      this.emitLog('error', `Daemon process error: ${error.message}`);
    });
    this.child.once('exit', (code, signal) => {
      this.lastExit = { code, signal, at: Date.now() };
      this.child = null;
      this.owned = false;
      this.sessionStartedAt = null;
      this.emitLog(code === 0 ? 'info' : 'error', `Wownero node stopped${code === null ? '' : ` (code ${code})`}.`);
    });

    try {
      const startedAt = Date.now();
      while (Date.now() - startedAt < WAIT_LIMIT_MS) {
        if (!this.child) throw new Error('Wownero node exited before RPC became ready.');
        if (await this.isReachable()) {
          this.starting = false;
          this.emitLog('success', 'Local RPC is ready. Blockchain synchronization is running.');
          return { attached: false };
        }
        await delay(WAIT_STEP_MS);
      }
      throw new Error('Wownero node did not become ready within 30 seconds. Check the node log.');
    } catch (error) {
      this.starting = false;
      await this.forceStop();
      throw error;
    }
  }

  async snapshot() {
    try {
      const [info, mining] = await Promise.all([this.rpc.getInfo(), this.rpc.miningStatus()]);
      return {
        reachable: true,
        owned: this.owned,
        starting: this.starting,
        info,
        mining,
        sessionStartedAt: this.sessionStartedAt,
        lastExit: this.lastExit,
        binaryPath: this.binaryPath(),
        defaultDataDirectory: this.defaultDataDirectory()
      };
    } catch (error) {
      return {
        reachable: false,
        owned: this.owned,
        starting: this.starting,
        error: error.message,
        lastExit: this.lastExit,
        binaryPath: this.binaryPath(),
        defaultDataDirectory: this.defaultDataDirectory()
      };
    }
  }

  async startMining(address, threads) {
    const response = await this.rpc.startMining(address, threads);
    this.sessionStartedAt = Date.now();
    this.emitLog('success', `Solo mining started on ${threads} CPU thread${threads === 1 ? '' : 's'}.`);
    return response;
  }

  async stopMining() {
    const response = await this.rpc.stopMining();
    this.sessionStartedAt = null;
    this.emitLog('info', 'Mining stopped.');
    return response;
  }

  async stopOwned() {
    if (!this.owned || !this.child) return { stopped: false, reason: 'not-owned' };
    try {
      const mining = await this.rpc.miningStatus();
      if (mining.active) await this.rpc.stopMining();
    } catch {
      // Continue shutdown even if mining status is temporarily unavailable.
    }
    try {
      await this.rpc.stopDaemon();
      const deadline = Date.now() + 8_000;
      while (this.child && Date.now() < deadline) await delay(200);
    } catch {
      // The fallback below terminates only the child process this app created.
    }
    if (this.child) await this.forceStop();
    return { stopped: true };
  }

  async forceStop() {
    if (!this.child) return;
    const processToStop = this.child;
    processToStop.kill();
    await Promise.race([
      new Promise((resolve) => processToStop.once('exit', resolve)),
      delay(3_000)
    ]);
    this.child = null;
    this.owned = false;
    this.sessionStartedAt = null;
  }
}

module.exports = { DaemonManager };

