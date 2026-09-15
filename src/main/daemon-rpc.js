'use strict';

const DEFAULT_RPC_PORT = 34568;
const ALLOWED_PATHS = new Set([
  '/get_info',
  '/mining_status',
  '/start_mining',
  '/stop_mining',
  '/stop_daemon'
]);

class RpcError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RpcError';
    this.details = details;
  }
}

class DaemonRpc {
  constructor(port = DEFAULT_RPC_PORT, timeoutMs = 5000) {
    this.port = port;
    this.timeoutMs = timeoutMs;
  }

  async request(rpcPath, body = {}) {
    if (!ALLOWED_PATHS.has(rpcPath)) throw new RpcError('RPC method is not allowlisted.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`http://127.0.0.1:${this.port}${rpcPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new RpcError(`Local daemon returned HTTP ${response.status}.`, { status: response.status });
      }
      const payload = await response.json();
      if (payload.status && payload.status !== 'OK') {
        throw new RpcError(String(payload.status), { payload });
      }
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new RpcError('Local daemon did not respond in time.');
      if (error instanceof RpcError) throw error;
      throw new RpcError('Cannot reach the local Wownero daemon.', { cause: error.message });
    } finally {
      clearTimeout(timeout);
    }
  }

  getInfo() {
    return this.request('/get_info');
  }

  miningStatus() {
    return this.request('/mining_status');
  }

  startMining(minerAddress, threadsCount) {
    return this.request('/start_mining', {
      miner_address: minerAddress,
      threads_count: threadsCount,
      do_background_mining: false,
      ignore_battery: false
    });
  }

  stopMining() {
    return this.request('/stop_mining');
  }

  stopDaemon() {
    return this.request('/stop_daemon');
  }
}

module.exports = { DaemonRpc, RpcError, DEFAULT_RPC_PORT };

