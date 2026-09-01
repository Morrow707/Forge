import Foundation
import Security
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
        CAPPluginMethod(name: "requestSavedPassword", returnType: CAPPluginReturnPromise)
    ]

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
