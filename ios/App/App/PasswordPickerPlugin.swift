import Foundation
import Security
import UIKit
import Capacitor

// The "Choose a saved password to use" sheet you get from tapping the
// key/Passwords icon above the keyboard -- @capawesome/capacitor-password-autofill
// (see native-auth.ts's savePasswordToKeychain) only exposes a save, no way to
// proactively ASK for a saved credential, so this is a small standalone plugin
// for exactly that half. SecRequestSharedWebCredential reads from the same
// iCloud Keychain shared-web-credentials store savePassword already writes
// into (same webcredentials domain, same App.entitlements entry) -- this
// doesn't save anything new, it just surfaces what's already there without
// requiring the athlete to know the key icon exists.
//
// Deliberately NOT ASAuthorizationPasswordProvider (the newer, non-deprecated
// AuthenticationServices API for this) -- real on-device testing showed the
// system's own "you don't have any passwords saved for this app" fallback
// sheet for a domain that had genuinely already saved a Shared Web Credential
// (savePassword resolved successfully and the credential showed up under
// Settings > Passwords in earlier testing). That matches a well-known,
// still-open compatibility gap other developers have reported migrating off
// this same deprecated API (Apple Developer Forums threads 692844, 727642):
// ASAuthorizationPasswordProvider failing to find credentials that
// SecRequestSharedWebCredential -- its older counterpart -- finds correctly.
// Since savePassword already has to use the old SecAddSharedWebCredential API
// (there's no modern replacement for the save side), reading back with its
// exact counterpart keeps both halves of the round trip on the same, known-
// working API family instead of crossing into the one with the documented gap.
@objc(PasswordPickerPlugin)
public class PasswordPickerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PasswordPickerPlugin"
    public let jsName = "PasswordPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestSavedPassword", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePassword", returnType: CAPPluginReturnPromise)
    ]


    // The save half, moved here from @capawesome/capacitor-password-autofill.
    //
    // WHY OWN IT. That plugin calls the same SecAddSharedWebCredential this does, and reports a
    // failure as `localizedDescription` alone -- which for a Security-framework OSStatus is
    // usually the useless "The operation couldn't be completed." The save has been failing
    // silently on-device for weeks with no way to tell WHICH precondition was missing, and that
    // string is why. This reports the error domain and numeric code, so the next on-device run
    // produces something that can actually be looked up.
    //
    // IT PRESENTS SYSTEM UI. SecAddSharedWebCredential shows Apple's own "Do you want to save
    // this password?" alert. That has two consequences the old call site got wrong: it needs the
    // app to be FOREGROUND AND ACTIVE, and it needs a stable presentation context. It was being
    // fired the instant login succeeded, while the web layer was already tearing the login screen
    // down and navigating -- a prompt asked for mid-transition is exactly the kind iOS declines
    // to present. So this refuses up front when the app is not active, with a distinct message,
    // rather than letting that look like a keychain failure.
    //
    // THE API IS DEPRECATED (iOS 14) AND HAS NO REPLACEMENT for the save side. Apple's position
    // is that WebKit's own AutoFill should offer to save when a form is submitted -- which never
    // fires here, because the bundle is served from capacitor://localhost and AutoFill matches on
    // origin. If this turns out to be a no-op on current iOS rather than a fixable failure, the
    // remaining honest option is a native login screen, and the diagnostics below are what will
    // tell us which of those two we are in.
    @objc func savePassword(_ call: CAPPluginCall) {
        guard let domain = call.getString("domain"),
              let username = call.getString("username"),
              let password = call.getString("password") else {
            call.reject("domain, username and password are all required")
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else {
                // Named distinctly on purpose: "not active" and "the keychain refused" want
                // opposite fixes, and the old code could not tell them apart.
                call.reject("App wasn't active, so iOS wouldn't show the save prompt")
                return
            }
            SecAddSharedWebCredential(domain as CFString, username as CFString, password as CFString) { error in
                DispatchQueue.main.async {
                    guard let error = error else {
                        call.resolve()
                        return
                    }
                    // Read through the CoreFoundation accessors rather than bridging to
                    // NSError: this completion hands back a CFError, and `as NSError` does not
                    // compile against it ("'CFError' is not convertible to 'NSError'").
                    //
                    // Domain + code, not just the description. errSecItemNotFound, a failed
                    // associated-domain check and a user-declined prompt all produce the same
                    // useless description otherwise, which is the whole reason this moved here.
                    let code = CFErrorGetCode(error)
                    let domain = CFErrorGetDomain(error) as String? ?? "unknown"
                    let description = CFErrorCopyDescription(error) as String? ?? "no description"
                    call.reject("\(description) [\(domain) \(code)]", String(code), nil)
                }
            }
        }
    }

    @objc func requestSavedPassword(_ call: CAPPluginCall) {
        // nil/nil (not this app's specific domain/account) so the system picks up every
        // webcredentials domain declared in App.entitlements' associated-domains entry --
        // there's only the one (CREDENTIAL_DOMAIN in native-auth.ts) today, but this way
        // nothing here needs updating if a second one is ever added. Matches the same
        // "let the OS resolve it from Associated Domains" behavior the previous
        // ASAuthorizationPasswordProvider-based implementation had with zero domain
        // configuration of its own.
        SecRequestSharedWebCredential(nil, nil) { [weak self] credentials, error in
            DispatchQueue.main.async {
                guard self != nil else { return }
                // errSecItemNotFound (nothing saved yet) and the athlete dismissing the
                // system picker both surface here as a plain error -- same as this plugin's
                // own comment already established, both should look identical to the caller:
                // an ordinary "nothing to fill in," not a real failure worth surfacing.
                guard error == nil,
                    let first = (credentials as? [[String: Any]])?.first,
                    let username = first[kSecAttrAccount as String] as? String,
                    let password = first[kSecSharedPassword as String] as? String
                else {
                    call.reject("No saved credential")
                    return
                }
                call.resolve(["username": username, "password": password])
            }
        }
    }
}
