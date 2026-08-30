# Apple root certificate

`server/apple-iap.ts` needs `AppleRootCA-G3.cer` in this directory to verify
any real App Store transaction or Server Notification. It's a public,
non-secret file -- the same root certificate every browser and OS already
trusts, not an API key or credential -- so it's meant to be committed here,
not left in an env var or secret store.

This dev/CI environment's outbound network is policy-restricted and can't
reach apple.com to fetch it directly. From a machine with normal internet
access:

```
curl -o server/apple-root-certs/AppleRootCA-G3.cer \
  https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
```

Then commit that file. Until it's present, `verifyAppleTransaction` and
`verifyAppleNotification` both fail closed (log one error, return null) --
nothing crashes, nothing is silently trusted, real IAP just stays inert the
same way it already is today.
