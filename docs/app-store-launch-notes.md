# App Store Launch Notes

What `.github/workflows/ios-testflight.yml` and `.github/workflows/android-release.yml`
actually need before they can produce a real, signed build instead of failing fast
with a "missing secrets" error (iOS) or stopping at a debug-only APK (Android).

Everything below is a **GitHub repository secret or variable**
(`Settings -> Secrets and variables -> Actions`), not a Render environment
variable. Render only ever serves the web app (see `render.yaml`) -- these
two workflows build and sign the native app shells, and are entirely
separate from it.

## iOS -- TestFlight

Prerequisite: an active **Apple Developer Program** enrollment ($99/year,
individual or organization). Confirm this first -- nothing below works
without it.

Required secrets:

| Secret | How to get it |
|---|---|
| `IOS_DIST_CERTIFICATE_BASE64` | Apple Developer portal -> Certificates -> create an **Apple Distribution** certificate, export it from Keychain Access as a `.p12` with a password, then `base64 -i distribution.p12 -o cert.txt` and paste the contents. |
| `IOS_DIST_CERTIFICATE_PASSWORD` | The password you set exporting the `.p12` above. |
| `IOS_PROVISIONING_PROFILE_BASE64` | Apple Developer portal -> Profiles -> new **App Store** distribution profile, matching the certificate above and an App ID for `com.foreperformancesystems.forge`. Then `base64 -i profile.mobileprovision -o profile.txt`. |
| `IOS_PROVISIONING_PROFILE_NAME` | The exact name given to that profile when creating it -- fastlane matches on this name, not a file path. |
| `APP_STORE_CONNECT_KEY_ID` | App Store Connect -> Users and Access -> Integrations -> App Store Connect API -> generate a key with **App Manager** access. |
| `APP_STORE_CONNECT_ISSUER_ID` | Shown on the same API Keys page -- one issuer ID covers every key on the account. |
| `APP_STORE_CONNECT_API_KEY_BASE64` | The `.p8` file downloaded when creating that API key, base64-encoded the same way as the certificate above. Apple only allows downloading this file once -- save the raw `.p8` somewhere durable in addition to encoding it. |
| `APPLE_TEAM_ID` | Apple Developer portal -> Membership -> the 10-character Team ID. |

Also worth setting (only needed if the Apple ID belongs to more than one
App Store Connect team -- otherwise same value as `APPLE_TEAM_ID`):

| Secret | Value |
|---|---|
| `APP_STORE_CONNECT_TEAM_ID` | Your App Store Connect team ID. |

Repo **variable**, not secret (defaults to `com.foreperformancesystems.forge`,
matching `capacitor.config.ts`'s `appId`, if left unset):

| Variable | Value |
|---|---|
| `IOS_BUNDLE_ID` | The app's bundle identifier, only if it ever changes from the default. |

Running it: Actions tab -> "iOS TestFlight" -> Run workflow. Choose
`verify_build` first -- it archives and signs on a real Xcode toolchain
without touching Apple's rate-limited TestFlight upload quota, so it's the
safe way to confirm signing actually works. Once that's clean, run `beta`
to upload for real.

## Android -- Play Console

No account needed for the base build -- the workflow always produces a
sideloadable, debug-signed APK with zero secrets configured. Everything
below is only for a real release build.

**Release signing** (a local keystore -- no Google account required for this part):

1. Generate one: `keytool -genkey -v -keystore release.keystore -alias forge -keyalg RSA -keysize 2048 -validity 10000`
2. Back up `release.keystore` and its passwords somewhere durable, outside
   GitHub. Losing this file means never being able to publish an update to
   the same Play Store listing again -- there is no recovery path.

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i release.keystore -o keystore.txt`, paste the contents. |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password from step 1. |
| `ANDROID_KEY_ALIAS` | The `-alias` value used above (`forge` in the example). |
| `ANDROID_KEY_PASSWORD` | The key password (often the same as the keystore password, unless set differently). |

**Play Console publishing** (needs a Google Play Developer account, $25 one-time):

| Secret | How to get it |
|---|---|
| `GOOGLE_PLAY_JSON_KEY` | Play Console -> Setup -> API access -> create/link a Google Cloud service account, grant it release-manager-level access to this app, download its JSON key, and paste the entire file contents as the secret value. |

Repo variable (defaults to `com.foreperformancesystems.forge` if unset):

| Variable | Value |
|---|---|
| `ANDROID_PACKAGE_NAME` | The app's package name, only if it ever changes from the default. |

Running it: Actions tab -> "Android Build" -> Run workflow. The debug APK
always builds; the signed release AAB/APK builds once the four keystore
secrets exist; the Play Console internal-testing upload happens only if
`GOOGLE_PLAY_JSON_KEY` is also set.

## What this doc does NOT cover

- **The actual App Store Connect / Play Console listings** -- description
  copy, keywords, screenshots, age rating, and (given the age-tier/health
  data this app handles) the App Store's privacy "nutrition label." All
  manual, done directly in each console, and separate from anything these
  two workflows touch. Ideally done once the legal review of the age-tier
  system is finished, since the privacy label has to reflect real,
  reviewed practices, not a guess.
- **Push notification production certs.** APNs needs the App ID's Push
  Notifications capability turned on in the Apple Developer portal, in
  addition to the three `APNS_*` secrets that live in Render (not here) --
  see `render.yaml`'s own comment on those.
