import Foundation
import AuthenticationServices
import Capacitor

// The "Choose a saved password to use" sheet you get from tapping the
// key/Passwords icon above the keyboard -- @capawesome/capacitor-password-autofill
// (see native-auth.ts's savePasswordToKeychain) only exposes a save, no way to
// proactively ASK for a saved credential, so this is a small standalone plugin
// for exactly that half. ASAuthorizationPasswordProvider reads from the same
// iCloud Keychain shared-web-credentials store savePassword already writes
// into (same webcredentials domain, same App.entitlements entry) -- this
// doesn't save anything new, it just surfaces what's already there without
// requiring the athlete to know the key icon exists.
@objc(PasswordPickerPlugin)
public class PasswordPickerPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    public let identifier = "PasswordPickerPlugin"
    public let jsName = "PasswordPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestSavedPassword", returnType: CAPPluginReturnPromise)
    ]

    // ASAuthorizationController's delegate callbacks are fire-and-forget with
    // no call-site reference of their own -- this is what ties a completion
    // back to the specific CAPPluginCall that started it. Only one request is
    // ever in flight at a time (the login screen only ever asks once), so a
    // single slot is enough.
    private var pendingCall: CAPPluginCall?

    @objc func requestSavedPassword(_ call: CAPPluginCall) {
        pendingCall = call
        let request = ASAuthorizationPasswordProvider().createRequest()
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        defer { pendingCall = nil }
        guard let credential = authorization.credential as? ASPasswordCredential else {
            pendingCall?.reject("No saved credential")
            return
        }
        pendingCall?.resolve(["username": credential.user, "password": credential.password])
    }

    // Covers both "the athlete tapped Cancel" and "there's nothing saved yet"
    // -- ASAuthorizationError.canceled either way. Neither is a real error
    // worth this ever surfacing as one; the JS side (native-auth.ts's
    // requestSavedPassword) just falls back to the athlete typing normally.
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { pendingCall = nil }
        pendingCall?.reject(error.localizedDescription)
    }
}
