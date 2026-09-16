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
                onOutcome: { outcome in
                    // One resolve per outcome, and the controller's own `finished` guard is what
                    // stops a second one -- resolving a CAPPluginCall twice is a crash, and
                    // submit, a link tap and a swipe-away all arrive here.
                    switch outcome {
                    case let .signIn(username, password):
                        call.resolve(["action": "signIn", "username": username, "password": password])
                    case let .navigate(path):
                        // The links on the screen are web routes; the web layer owns routing, so
                        // this reports where to go rather than trying to draw another screen.
                        call.resolve(["action": "navigate", "path": path])
                    case .dismissed:
                        // Ordinary, not a failure: the athlete falls back to the web form, which
                        // still logs in fine -- it just cannot be offered a save.
                        call.resolve(["action": "dismissed"])
                    }
                }
            )
            // The controller sets its own presentation style (.fullScreen, not dismissible):
            // it is the login screen, not a sheet over one.
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
/// Forge's login screen, drawn natively.
///
/// WHY IT IS NATIVE AT ALL, since this is otherwise a web app and duplicating a screen is a cost.
/// iOS AutoFill decides which saved password to offer by the PAGE ORIGIN, and the web bundle is
/// served from capacitor://localhost -- WKWebView reserves http and https, so a Capacitor app can
/// never serve its own files under forge-ebhd.onrender.com (see the iosScheme note in
/// @capacitor/cli's declarations). No Apple Passwords entry can match a page at that address, so
/// the web form is never filled and never offered a save, however it is marked up -- and its
/// autocomplete attributes were already correct.
///
/// A native UITextField is matched differently: the Associated Domains entitlement ties the APP to
/// the domain, so `.username` and `.password` content types resolve to the credential the webview
/// cannot reach. Those two lines are the entire reason this file exists. Everything else here is
/// making it look like the screen it replaces.
///
/// MATCHED TO client/src/pages/login.tsx AND client/src/index.css, not to a screenshot. The colour
/// values below are the same tokens the web screen resolves, converted from HSL, and the artwork
/// is the very same icon-192.png the web ForgeMark renders, read out of the bundled web assets --
/// one source of truth, so the two cannot drift apart silently.
///
/// It authenticates nothing. Credentials go back to the web layer, which calls the same
/// loginMutation the web form calls, so there is still exactly one auth path in this app.
final class NativeLoginViewController: UIViewController {

    // MARK: - Design tokens (client/src/index.css, dark theme)

    /// UIColor's own initialiser takes HSB; CSS gives HSL. Converting here rather than
    /// hand-picking approximate RGB keeps these honestly tied to the stylesheet.
    private static func hsl(_ h: CGFloat, _ s: CGFloat, _ l: CGFloat) -> UIColor {
        let hue = h / 360, sat = s / 100, lum = l / 100
        let c = (1 - abs(2 * lum - 1)) * sat
        let x = c * (1 - abs((hue * 6).truncatingRemainder(dividingBy: 2) - 1))
        let m = lum - c / 2
        let (r, g, b): (CGFloat, CGFloat, CGFloat)
        switch hue * 6 {
        case ..<1: (r, g, b) = (c, x, 0)
        case ..<2: (r, g, b) = (x, c, 0)
        case ..<3: (r, g, b) = (0, c, x)
        case ..<4: (r, g, b) = (0, x, c)
        case ..<5: (r, g, b) = (x, 0, c)
        default:   (r, g, b) = (c, 0, x)
        }
        return UIColor(red: r + m, green: g + m, blue: b + m, alpha: 1)
    }

    private static let neutralHue: CGFloat = 222                      // --neutral-hue
    private static let background = hsl(neutralHue, 20, 5)            // --background
    private static let card = hsl(neutralHue, 17, 16)                 // --card
    private static let cardForeground = hsl(0, 0, 97)                 // --card-foreground
    private static let foreground = hsl(0, 0, 96)                     // --foreground
    private static let primary = hsl(14, 85, 42)                      // --primary
    private static let mutedForeground = hsl(220, 9, 64)              // --muted-foreground
    private static let border = hsl(neutralHue, 17, 24)               // --border / --input
    private static let radius: CGFloat = 9.6                          // --radius: 0.6rem

    // MARK: - Callbacks

    enum Outcome {
        case signIn(username: String, password: String)
        /// A link on the screen -- the web layer navigates, since these are web routes.
        case navigate(path: String)
        case dismissed
    }

    private let onOutcome: (Outcome) -> Void
    private let prefillUsername: String?
    /// The presenting code holds a CAPPluginCall, and resolving or rejecting one twice is a crash.
    /// Submit, a link and a swipe-away all land here, so the guard is shared.
    private var finished = false

    private let usernameField = UITextField()
    private let passwordField = UITextField()
    private let scrollView = UIScrollView()
    private let signInButton = UIButton(type: .system)

    init(prefillUsername: String?, onOutcome: @escaping (Outcome) -> Void) {
        self.prefillUsername = prefillUsername
        self.onOutcome = onOutcome
        super.init(nibName: nil, bundle: nil)
        // Full screen and not dismissible by swipe: this IS the login screen, not a sheet over
        // one. A pull-to-dismiss here would drop the athlete onto a web form behind it.
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    // MARK: - Layout

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.background

        let mark = UIImageView(image: Self.forgeMark())
        mark.contentMode = .scaleAspectFill
        mark.clipsToBounds = true
        mark.layer.cornerRadius = 12
        mark.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            mark.widthAnchor.constraint(equalToConstant: 56),   // h-14 w-14
            mark.heightAnchor.constraint(equalToConstant: 56),
        ])

        let wordmark = UILabel()
        wordmark.text = "FORGE"
        wordmark.textColor = Self.foreground
        wordmark.font = .systemFont(ofSize: 34, weight: .heavy)
        // tracking-wider on the web mark.
        wordmark.attributedText = NSAttributedString(
            string: "FORGE",
            attributes: [
                .kern: 3.0,
                .font: UIFont.systemFont(ofSize: 34, weight: .heavy),
                .foregroundColor: Self.foreground,
            ]
        )

        let tagline = Self.label("Coach. Program. Perform.", size: 13, color: Self.mutedForeground)

        let header = UIStackView(arrangedSubviews: [mark, wordmark, tagline])
        header.axis = .vertical
        header.alignment = .center
        header.spacing = 12

        // ---- Card ----
        let cardTitle = Self.label("Log In", size: 20, color: Self.cardForeground, weight: .semibold)
        let cardDescription = Self.label(
            "Welcome back. Enter your credentials to continue.",
            size: 13,
            color: Self.mutedForeground
        )
        cardDescription.numberOfLines = 0

        let emailLabel = Self.label("Email", size: 13, color: Self.cardForeground, weight: .medium)
        Self.style(usernameField, placeholder: "you@example.com")
        usernameField.textContentType = .username
        usernameField.keyboardType = .emailAddress
        usernameField.autocapitalizationType = .none
        usernameField.autocorrectionType = .no
        usernameField.text = prefillUsername
        usernameField.returnKeyType = .next
        usernameField.delegate = self

        let passwordLabel = Self.label("Password", size: 13, color: Self.cardForeground, weight: .medium)
        let forgot = Self.linkButton("Forgot password?", size: 12)
        forgot.addTarget(self, action: #selector(forgotTapped), for: .touchUpInside)
        let passwordRow = UIStackView(arrangedSubviews: [passwordLabel, UIView(), forgot])
        passwordRow.axis = .horizontal
        passwordRow.alignment = .center

        Self.style(passwordField, placeholder: "••••••••")
        passwordField.textContentType = .password
        passwordField.isSecureTextEntry = true
        passwordField.returnKeyType = .go
        passwordField.delegate = self
        addRevealToggle(to: passwordField)

        signInButton.setTitle("Log In", for: .normal)
        signInButton.setTitleColor(.white, for: .normal)
        signInButton.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        signInButton.backgroundColor = Self.primary
        signInButton.layer.cornerRadius = Self.radius
        signInButton.addTarget(self, action: #selector(submit), for: .touchUpInside)
        signInButton.heightAnchor.constraint(equalToConstant: 48).isActive = true

        let signUp = Self.footerRow(
            "Don't have an account? ", link: "Sign up", target: self, action: #selector(signUpTapped)
        )
        let adminLogin = Self.footerRow(
            "Are you an admin? ", link: "Log in here", target: self, action: #selector(adminTapped)
        )

        let cardStack = UIStackView(arrangedSubviews: [
            cardTitle, cardDescription,
            emailLabel, usernameField,
            passwordRow, passwordField,
            signInButton, signUp, adminLogin,
        ])
        cardStack.axis = .vertical
        cardStack.spacing = 10
        cardStack.setCustomSpacing(20, after: cardDescription)
        cardStack.setCustomSpacing(16, after: usernameField)
        cardStack.setCustomSpacing(20, after: passwordField)
        cardStack.setCustomSpacing(18, after: signInButton)
        cardStack.translatesAutoresizingMaskIntoConstraints = false

        let cardView = UIView()
        cardView.backgroundColor = Self.card
        cardView.layer.cornerRadius = Self.radius
        cardView.layer.borderWidth = 1
        cardView.layer.borderColor = Self.border.cgColor
        cardView.addSubview(cardStack)
        NSLayoutConstraint.activate([
            cardStack.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 22),
            cardStack.bottomAnchor.constraint(equalTo: cardView.bottomAnchor, constant: -22),
            cardStack.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 20),
            cardStack.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -20),
        ])

        let page = UIStackView(arrangedSubviews: [header, cardView])
        page.axis = .vertical
        page.spacing = 32
        page.translatesAutoresizingMaskIntoConstraints = false

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.keyboardDismissMode = .interactive
        scrollView.addSubview(page)
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),

            page.topAnchor.constraint(greaterThanOrEqualTo: scrollView.contentLayoutGuide.topAnchor, constant: 48),
            page.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -48),
            page.centerXAnchor.constraint(equalTo: scrollView.contentLayoutGuide.centerXAnchor),
            page.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 16),
            page.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -16),
            // max-w-md on the web screen.
            page.widthAnchor.constraint(lessThanOrEqualToConstant: 448),
        ])

        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardChanged(_:)),
            name: UIResponder.keyboardWillChangeFrameNotification, object: nil
        )
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardHidden),
            name: UIResponder.keyboardWillHideNotification, object: nil
        )
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Focusing a field is what surfaces the Passwords suggestion above the keyboard, so the
        // athlete does not have to know the key icon exists.
        (prefillUsername?.isEmpty == false ? passwordField : usernameField).becomeFirstResponder()
    }

    // MARK: - Helpers

    /// The same artwork the web ForgeMark renders. Capacitor copies dist/public into the app
    /// bundle, so this is literally the same file rather than a second copy that can drift.
    private static func forgeMark() -> UIImage? {
        if let url = Bundle.main.url(forResource: "icon-192", withExtension: "png", subdirectory: "public"),
           let data = try? Data(contentsOf: url) {
            return UIImage(data: data)
        }
        return UIImage(named: "AppIcon")
    }

    private static func label(
        _ text: String, size: CGFloat, color: UIColor, weight: UIFont.Weight = .regular
    ) -> UILabel {
        let l = UILabel()
        l.text = text
        l.textColor = color
        l.font = .systemFont(ofSize: size, weight: weight)
        l.adjustsFontForContentSizeCategory = true
        return l
    }

    private static func linkButton(_ title: String, size: CGFloat) -> UIButton {
        let b = UIButton(type: .system)
        b.setTitle(title, for: .normal)
        b.setTitleColor(primary, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: size, weight: .semibold)
        return b
    }

    private static func footerRow(
        _ prefix: String, link: String, target: Any, action: Selector
    ) -> UIStackView {
        let text = label(prefix, size: 13, color: mutedForeground)
        let button = linkButton(link, size: 13)
        button.addTarget(target, action: action, for: .touchUpInside)
        let row = UIStackView(arrangedSubviews: [UIView(), text, button, UIView()])
        row.axis = .horizontal
        row.alignment = .center
        row.spacing = 4
        return row
    }

    private static func style(_ field: UITextField, placeholder: String) {
        field.backgroundColor = .clear
        field.textColor = foreground
        field.font = .systemFont(ofSize: 16)
        field.layer.cornerRadius = radius
        field.layer.borderWidth = 1
        field.layer.borderColor = border.cgColor
        field.attributedPlaceholder = NSAttributedString(
            string: placeholder,
            attributes: [.foregroundColor: mutedForeground]
        )
        // Inset the text so it does not sit against the border, matching the web input padding.
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        field.leftViewMode = .always
        field.heightAnchor.constraint(equalToConstant: 46).isActive = true
    }

    /// The eye toggle the web PasswordInput has.
    private func addRevealToggle(to field: UITextField) {
        let toggle = UIButton(type: .system)
        toggle.setImage(UIImage(systemName: "eye"), for: .normal)
        toggle.tintColor = Self.mutedForeground
        toggle.frame = CGRect(x: 0, y: 0, width: 40, height: 46)
        toggle.addTarget(self, action: #selector(toggleReveal(_:)), for: .touchUpInside)
        field.rightView = toggle
        field.rightViewMode = .always
    }

    @objc private func toggleReveal(_ sender: UIButton) {
        passwordField.isSecureTextEntry.toggle()
        sender.setImage(
            UIImage(systemName: passwordField.isSecureTextEntry ? "eye" : "eye.slash"),
            for: .normal
        )
    }

    @objc private func keyboardChanged(_ note: Notification) {
        guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let overlap = max(0, view.bounds.maxY - view.convert(frame, from: nil).minY)
        scrollView.contentInset.bottom = overlap
        scrollView.verticalScrollIndicatorInsets.bottom = overlap
    }

    @objc private func keyboardHidden() {
        scrollView.contentInset.bottom = 0
        scrollView.verticalScrollIndicatorInsets.bottom = 0
    }

    // MARK: - Outcomes

    @objc private func submit() {
        let username = usernameField.text?.trimmingCharacters(in: .whitespaces) ?? ""
        let password = passwordField.text ?? ""
        guard !username.isEmpty, !password.isEmpty, !finished else { return }
        finish(.signIn(username: username, password: password))
    }

    @objc private func forgotTapped() { finish(.navigate(path: "/forgot-password")) }
    @objc private func signUpTapped() { finish(.navigate(path: "/signup")) }
    @objc private func adminTapped() { finish(.navigate(path: "/admin/login")) }

    private func finish(_ outcome: Outcome) {
        guard !finished else { return }
        finished = true
        // Resign first so the fields commit, then dismiss: iOS evaluates whether to offer
        // "Save Password?" as this controller goes away, and that dismissal is the only signal
        // there is -- no API asks for the prompt directly.
        view.endEditing(true)
        dismiss(animated: true) { [onOutcome] in onOutcome(outcome) }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        guard !finished else { return }
        finished = true
        onOutcome(.dismissed)
    }

    deinit { NotificationCenter.default.removeObserver(self) }
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
