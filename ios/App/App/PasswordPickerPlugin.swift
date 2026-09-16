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
        CAPPluginMethod(name: "savePassword", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentNativeLogin", returnType: CAPPluginReturnPromise)
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

    // A NATIVE sign-in sheet, which is the only thing on current iOS that makes Apple Passwords
    // both fill AND save.
    //
    // WHY THIS EXISTS. The evidence from build 415: savePasswordToKeychain() resolved with no
    // error, and 21 seconds later iOS's own picker said "You don't have any passwords saved for
    // this app". SecAddSharedWebCredential is deprecated since iOS 14 and is now a no-op that
    // reports success -- it does not prompt, does not store, and does not fail. No amount of
    // fixing the call site changes that, which is what the last two commits established.
    //
    // WHAT DOES WORK is what every native app does: real UITextFields carrying
    // textContentType .username and .password. AutoFill fills them from Apple Passwords on
    // focus, and iOS offers its own "Save Password?" prompt when the view controller is
    // dismissed after a sign-in. Both halves come from the OS; nothing here writes to the
    // keychain, because an app is not supposed to.
    //
    // The webview form cannot do this no matter how it is marked up: AutoFill matches on page
    // ORIGIN, and the bundle is served from capacitor://localhost, which matches no saved entry
    // for forge-ebhd.onrender.com. The Associated Domains entitlement is what ties THIS APP to
    // that domain, so a native field inside it resolves to the right credential.
    //
    // Deliberately only collects credentials. The actual login still goes through the same API
    // call the web form uses, so there is one authentication path, not two -- this replaces the
    // keyboard, not the login.
    @objc func presentNativeLogin(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let host = self?.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let vc = NativeLoginViewController(
                prefillUsername: call.getString("prefillUsername"),
                onSubmit: { username, password in
                    call.resolve(["username": username, "password": password])
                },
                onCancel: {
                    // Cancelling is ordinary: the athlete falls back to the web form, which still
                    // logs in fine, it just cannot offer to save.
                    call.reject("cancelled")
                }
            )
            vc.modalPresentationStyle = .formSheet
            host.present(vc, animated: true)
        }
    }

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

/// The native sign-in sheet behind `presentNativeLogin`.
///
/// Small on purpose. Everything here exists to satisfy AutoFill's requirements and nothing else:
/// two real UITextFields carrying `.username` and `.password` content types, inside a view
/// controller that is DISMISSED after the credentials are handed back. That dismissal is what
/// makes iOS offer "Save Password?" -- it is the OS's own heuristic for "a sign-in just happened",
/// and there is no API to ask for it directly.
///
/// It does not authenticate anything. The credentials go straight back to the web layer, which
/// calls the same login endpoint the web form calls, so there remains exactly one authentication
/// path in this app. This replaces the keyboard, not the login.
final class NativeLoginViewController: UIViewController {
    private let usernameField = UITextField()
    private let passwordField = UITextField()
    private let onSubmit: (String, String) -> Void
    private let onCancel: () -> Void
    private let prefillUsername: String?
    // Guards the two callbacks: presenting code holds a CAPPluginCall, and resolving OR rejecting
    // it twice is a crash. Dismissal can arrive from the button or from a swipe-down, and both
    // land here.
    private var finished = false

    init(prefillUsername: String?, onSubmit: @escaping (String, String) -> Void, onCancel: @escaping () -> Void) {
        self.prefillUsername = prefillUsername
        self.onSubmit = onSubmit
        self.onCancel = onCancel
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let title = UILabel()
        title.text = "Sign in to Forge"
        title.font = .preferredFont(forTextStyle: .title2)
        title.adjustsFontForContentSizeCategory = true

        // .username and .password are the whole point. Without them AutoFill does not recognise
        // this as a sign-in form, offers nothing on focus, and never proposes saving afterwards.
        usernameField.textContentType = .username
        usernameField.keyboardType = .emailAddress
        usernameField.autocapitalizationType = .none
        usernameField.autocorrectionType = .no
        usernameField.placeholder = "Email"
        usernameField.borderStyle = .roundedRect
        usernameField.text = prefillUsername
        usernameField.returnKeyType = .next
        usernameField.delegate = self

        passwordField.textContentType = .password
        passwordField.isSecureTextEntry = true
        passwordField.placeholder = "Password"
        passwordField.borderStyle = .roundedRect
        passwordField.returnKeyType = .go
        passwordField.delegate = self

        let signIn = UIButton(type: .system)
        signIn.setTitle("Sign In", for: .normal)
        signIn.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        signIn.addTarget(self, action: #selector(submit), for: .touchUpInside)

        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancel", for: .normal)
        cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, usernameField, passwordField, signIn, cancel])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Focus the field AutoFill keys off, so the Passwords suggestion appears above the
        // keyboard without the athlete having to know to tap anything.
        (prefillUsername?.isEmpty == false ? passwordField : usernameField).becomeFirstResponder()
    }

    @objc private func submit() {
        let username = usernameField.text ?? ""
        let password = passwordField.text ?? ""
        guard !username.isEmpty, !password.isEmpty else { return }
        guard !finished else { return }
        finished = true
        // Resign first so the fields commit their values, then dismiss: iOS evaluates whether to
        // offer "Save Password?" as this controller goes away.
        view.endEditing(true)
        dismiss(animated: true) { [onSubmit] in onSubmit(username, password) }
    }

    @objc private func cancelTapped() {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { [onCancel] in onCancel() }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Swiped away rather than answered. Treated as a cancel so the promise never dangles.
        guard !finished else { return }
        finished = true
        onCancel()
    }
}

extension NativeLoginViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        if textField === usernameField {
            passwordField.becomeFirstResponder()
        } else {
            submit()
        }
        return true
    }
}
