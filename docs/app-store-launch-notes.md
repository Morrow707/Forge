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
`verify_build` first -- it archives and signs on a real Xcode toolchain and
then asks App Store Connect whether it would accept the resulting binary,
all without touching Apple's rate-limited upload quota. Once that's clean,
run `beta` to upload for real.

The validation step is there because archiving cleanly does not mean the
upload will be accepted. On 2026-09-06 an Info.plist change archived fine,
passed verify_build, and was then rejected at upload with error 90683
(missing purpose string). Everything altool checks -- purpose strings,
entitlements, bundle structure, SDK version -- was checked by nothing until
the upload itself. `--validate-app` is a separate operation from
`--upload-app`: it creates no build record and consumes none of the quota.

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

## Launch-day items only Scott can do

Kept here so they are not lost between sessions. None of these is code.

- **Register the DMCA agent** at dmca.copyright.gov: service provider Forge Performance
  Systems LLC, 5145 North 7th Street, D-237, Phoenix, Arizona 85014; agent contact
  forgeperformancesystems@outlook.com; $6, renew every three years. The signup Terms of
  Use (section 18, counsel's 2026-09-19 text) names that address as the designated agent,
  and the safe harbour is weaker until the registration exists. Scott, 2026-09-19: "ok file
  it".
- **Turn billing on**: `BILLING_LIVE=true` and the Apple IAP secrets on Render, and flip
  `isBetaAccount` off per account from the admin billing panel.
- **Delete the App Review demo accounts** and remove them from
  `DEVICE_VERIFICATION_EXEMPT_EMAILS`.
- **Confirm the Forge signer on the Service Agreement PDF**
  (`INSTITUTIONAL_AGREEMENT_SIGNER_NAME` / `_TITLE` on Render; defaults "Scott Morrow" /
  "Founder").
- **Send the remaining documents to the attorney** if any are still open in
  `docs/legal-open-questions.md`.

## What this doc does NOT cover

- **The actual App Store Connect / Play Console listings** -- description
  copy, keywords, screenshots, age rating, and (given the age-tier/health
  data this app handles) the App Store's privacy "nutrition label." All
  manual, done directly in each console, and separate from anything these
  two workflows touch. The copy for the camera-accuracy disclosure that has
  to go in the listing is written out in `docs/app-store-listing-copy.md`,
  since it is the one disclosure surface no code change can reach. Ideally done once the legal review of the age-tier
  system is finished, since the privacy label has to reflect real,
  reviewed practices, not a guess.
- **Push notification production certs.** APNs needs the App ID's Push
  Notifications capability turned on in the Apple Developer portal, in
  addition to the three `APNS_*` secrets that live in Render (not here) --
  see `render.yaml`'s own comment on those.
