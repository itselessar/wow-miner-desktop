# WOW Miner for Windows

A polished, local-first desktop interface for Wownero's built-in solo CPU
miner. No accounts, cloud backend, telemetry, pool, or wallet custody.

## What it does

- Starts and monitors the official `wownerod.exe` on the user's PC.
- Keeps RPC bound to `127.0.0.1` and never exposes it to the network.
- Syncs and validates a pruned local Wownero blockchain.
- Starts/stops native RandomWOW solo mining to a primary WOW address.
- Shows synchronization, peers, hash rate, difficulty, expected block time,
  session duration, daemon logs, and embedded tutorials.
- Never asks for a seed phrase or private spend key.

## Put your logo here

Replace `assets/wownero.png` with your circular PNG before building. Use a
square image, ideally 512x512 or 1024x1024 pixels. The same file is used inside
the interface, for the application window, and during Windows packaging.

## Run from source on Windows

Requirements: Windows 10/11 x64, Node.js 22+, npm, and enough free disk space
for the pruned chain.

```powershell
git clone https://github.com/YOUR-NAME/wow-miner-desktop.git
cd wow-miner-desktop
npm ci
npm run vendor:fetch
npm start
```

`vendor:fetch` downloads the pinned official Wownero Windows release, verifies
its published SHA-256 checksum, and extracts only the files needed at runtime.
The current pin is upstream `v0.11.4.0`; updates are deliberate and reviewable.

## Create installers

```powershell
npm run dist:win
```

Outputs are written to `dist/`:

- an installable NSIS `.exe`;
- a portable `.exe`.

Pushing a tag such as `v1.0.1` also runs the included GitHub Actions workflow
and publishes a release containing both builds and their checksums.

See `docs/RELEASING.md` to configure optional Windows code signing and publish
future versions safely.

## Trust and safety model

- Renderer process: sandboxed, no Node.js access, strict Content Security Policy.
- Main process: allowlisted IPC only, validated inputs, loopback-only RPC.
- Daemon: official pinned binary, checksum verified before packaging.
- Shutdown: mining is stopped and owned daemon processes receive a graceful
  shutdown request before the app exits.
- Existing daemon: the app may attach to a compatible daemon already listening
  on `127.0.0.1:34568`; it will never terminate a daemon it did not start.

See `docs/ARCHITECTURE.md` for the local process and RPC design.

## Important mining behavior

Wownero mining is CPU-based and solo-only. A reward is received only when your
computer finds a complete block. Mining cannot begin until the local daemon is
fully synchronized. Mining to a subaddress is not supported by upstream; use a
primary Wownero address.

## Upstream and license

WOW Miner is MIT licensed. Wownero remains under its own BSD/MIT notices. Keep
`THIRD_PARTY_NOTICES.md` and the included upstream license when redistributing
the application. Do not describe the app as officially endorsed unless the
upstream project explicitly authorizes that claim.
