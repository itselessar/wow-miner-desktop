# Releasing WOW Miner

## 1. Replace the logo

Replace `assets/wownero.png` with a square circular-logo PNG, preferably
1024x1024. Run `npm run verify` locally.

## 2. Optional Windows signing

Unsigned builds work but Windows SmartScreen may warn users. For signed builds,
add these encrypted GitHub Actions repository secrets:

- `WINDOWS_CERTIFICATE`: a base64-encoded `.p12`/`.pfx` certificate or a secure
  link accepted by electron-builder;
- `WINDOWS_CERTIFICATE_PASSWORD`: the certificate password.

The workflow passes these values only to electron-builder. Forks without the
secrets continue to produce unsigned builds.

## 3. Tag the release

Update the version in `package.json`, commit the change, and create a matching
tag:

```powershell
git tag v1.0.1
git push origin main --tags
```

GitHub Actions builds the installer and portable executable, generates
`SHA256SUMS.txt`, and publishes the GitHub release. Test both files on a clean
Windows 11 VM before sharing the release publicly.

## 4. Upstream runtime updates

Runtime releases are intentionally pinned in `scripts/fetch-wownero.mjs`.
Never update only the URL. Confirm the release through official Wownero
channels, update the version/file/URL/checksum together, run
`npm run vendor:fetch`, then test synchronization and mining on mainnet.
