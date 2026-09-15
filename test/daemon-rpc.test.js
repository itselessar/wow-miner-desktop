'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { DaemonRpc, RpcError } = require('../src/main/daemon-rpc');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('posts the exact upstream start_mining request', async () => {
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      assert.equal(request.url, '/start_mining');
      assert.deepEqual(JSON.parse(body), {
        miner_address: 'WoTest', threads_count: 4,
        do_background_mining: false, ignore_battery: false
      });
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ status: 'OK' }));
    });
  }, async (port) => {
    const rpc = new DaemonRpc(port);
    await assert.doesNotReject(() => rpc.startMining('WoTest', 4));
  });
});

test('surfaces daemon status errors', async () => {
  await withServer((_request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ status: 'Failed, wrong address' }));
  }, async (port) => {
    await assert.rejects(() => new DaemonRpc(port).startMining('bad', 2), RpcError);
  });
});

test('blocks arbitrary RPC paths', async () => {
  const rpc = new DaemonRpc(1);
  await assert.rejects(() => rpc.request('/not-allowed'), /not allowlisted/);
});

