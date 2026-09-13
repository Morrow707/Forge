# Apple root certificate

`server/apple-iap.ts` needs `AppleRootCA-G3.cer` in this directory to verify
any real App Store transaction or Server Notification. It's a public,
non-secret file -- the same root certificate every browser and OS already
trusts, not an API key or credential -- so it's meant to be committed here,
not left in an env var or secret store.

This dev/CI environment's outbound network is policy-restricted and can't
reach apple.com to fetch it directly, so there are two ways to get the file
in:

**From CI, which is the easy one.** Run the "Fetch Apple root certificate"
workflow from the Actions tab (`.github/workflows/apple-root-cert.yml`). It
runs on a macOS runner, and it does not simply trust the download: it reads
the same certificate out of the runner's own Apple system trust store, fetches
the published copy from apple.com, and commits it only if those two
independent copies are byte-identical and the certificate is self-signed,
carries Apple's own distinguished name, and is inside its validity window. The
SHA-256 of whatever it commits goes in the log and the commit message. It
takes an optional `expected_sha256` input if you want to pin it against
Apple's published fingerprint as well.

**By hand,** from any machine with normal internet access:

```
curl -o server/apple-root-certs/AppleRootCA-G3.cer \
  https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
```

Then commit that file. Until it's present, `verifyAppleTransaction` and
`verifyAppleNotification` both fail closed (log one error, return null) --
nothing crashes, nothing is silently trusted, real IAP just stays inert the
same way it already is today.

Note that the certificate alone does not make purchases live: that also needs
`APPLE_IAP_LIVE=true` and the three subscription Products created in App Store
Connect under the ids in `shared/free-agent-tiers.ts`. What it removes is the
reason verification could never succeed regardless of either.
