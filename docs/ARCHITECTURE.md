# Architecture

WOW Miner contains no hosted service. The application has three local layers:

1. The sandboxed renderer draws the interface. It has no Node.js or network
   access.
2. The isolated preload exposes a small allowlisted API for node status,
   settings, mining, and safe shell actions.
3. The Electron main process starts the official Wownero daemon and talks to
   its HTTP RPC endpoint at `127.0.0.1:34568`.

The daemon alone connects to Wownero's peer-to-peer network. RPC is always
loopback-only. The interface uses these upstream endpoints:

- `/get_info`
- `/mining_status`
- `/start_mining`
- `/stop_mining`
- `/stop_daemon`

The app starts `wownerod.exe` without a shell and records whether it owns the
process. On exit it stops mining and gracefully shuts down only a daemon it
started. A daemon already running on the standard local port is attached as an
external process and left untouched.

Settings are JSON stored beneath Electron's per-user application-data folder.
They contain only public configuration: mining address, thread selection,
blockchain directory, startup preferences, pruning preference, and theme. The
application has no wallet engine and never handles seeds or private keys.

## Miner backend extension point

`src/main/daemon-manager.js` owns mining lifecycle calls. A future backend can
implement the same `startMining`, `stopMining`, and `snapshot` contract without
granting renderer access to processes or networking. Version 1 intentionally
uses only Wownero's official built-in CPU miner.

