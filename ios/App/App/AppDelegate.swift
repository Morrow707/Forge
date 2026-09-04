import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Before anything else can make the app audible. See ForgeAudioSession.
        ForgeAudioSession.shared.startObserving()
        return true
    }

    // The app is portrait everywhere except one screen. Info.plist has to advertise landscape
    // for iPhone before iOS will ever consider rotating, but advertising it alone would let
    // EVERY screen rotate into a layout nothing here is designed for. This callback is what
    // keeps that from happening: implemented on the app delegate, it takes precedence over the
    // root view controller's own answer, so orientation is decided in exactly one place.
    //
    // The single exception is the sprint tracker. A sprint is the one capture where the athlete
    // travels tens of metres ACROSS the frame, and a portrait 16:9 readout puts the narrow axis
    // on precisely that travel -- roughly 240ft of standoff for a 60-yard run against roughly
    // 90ft in landscape. AvBodyTrackingPlugin flips this while that camera is open and flips it
    // back on stop, so the window is exactly as long as the sprint capture itself.
    //
    // In-memory and non-persisted on purpose: if the app is killed mid-capture, the next launch
    // starts portrait rather than reopening stuck sideways.
    static var landscapeCaptureActive = false

    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        // .landscape, not .allButUpsideDown: while the sprint camera is up, the interface
        // should ROTATE rather than merely be allowed to. Returning a mask that still contains
        // portrait would leave a phone lying flat on the ground to pick whichever way it
        // happened to settle.
        if AppDelegate.landscapeCaptureActive {
            return .landscape
        }
        // iPad has always been free to rotate (see Info.plist) and nothing about the sprint
        // change should take that away.
        return UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // Required by @capacitor/push-notifications -- these hand the APNs
    // device token (or registration error) off to the plugin via
    // NotificationCenter; the plugin itself listens for these exact names
    // and is what actually surfaces the token to JS via
    // PushNotifications.addListener('registration', ...).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}


/// Owns this app's AVAudioSession category, which nothing previously did.
///
/// AVAudioSession is a process-wide singleton with last-writer-wins semantics. The whole native
/// surface used to write to it exactly twice, in one place, once per camera start -- and by the
/// time an athlete's music was reported to stop, the plugin that made that write had already
/// been torn down. The value chosen there was right; the LIFETIME was the bug. A category is
/// only protective while it is the category actually in force.
///
/// Three things can move it afterwards. WebKit reconfigures the session as media elements in the
/// web view come and go. iOS resets media services under load, which invalidates the session
/// outright -- Apple's documentation is explicit that an app must reconfigure it when that
/// happens, and nothing here was listening. And an interruption (a call, another app) can leave
/// it deactivated.
///
/// So this sets the category at launch, before anything can make the app audible, and re-asserts
/// it whenever iOS says it moved. The default a process starts with is .soloAmbient, which
/// silences other apps the instant this one becomes audible -- so "do nothing" was never neutral.
final class ForgeAudioSession {
    static let shared = ForgeAudioSession()
    private init() {}

    /// Kept in memory and surfaced through the plugin's existing diagnostic log, so a field
    /// report can say what the session actually did rather than what it was asked to do.
    private(set) var log: [String] = []
    private let logLimit = 40

    private func note(_ message: String) {
        log.append(message)
        if log.count > logLimit { log.removeFirst(log.count - logLimit) }
    }

    func startObserving() {
        apply(reason: "launch")
        let center = NotificationCenter.default
        // The one Apple explicitly requires handling: the media server restarted and every
        // session on the device died with it. This is also what takes the athlete's music down,
        // so re-asserting here is what lets the app come back mixable rather than inheriting
        // the non-mixing default on whatever it does next.
        center.addObserver(
            self, selector: #selector(handleReset),
            name: AVAudioSession.mediaServicesWereResetNotification, object: nil
        )
        // Posted whenever ANYONE changes the category, WebKit included. That is what makes this
        // hold against the web view without needing to know which element did it.
        center.addObserver(
            self, selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification, object: nil
        )
        center.addObserver(
            self, selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification, object: nil
        )
        center.addObserver(
            self, selector: #selector(handleDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification, object: nil
        )
    }

    @objc private func handleReset() {
        note("mediaServicesWereReset -- reconfiguring")
        apply(reason: "media services reset")
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
        else { return }
        guard reason == .categoryChange else { return }
        // Only when it actually moved AWAY from what we want. Our own setCategory posts this
        // same notification, so re-asserting unconditionally would be an endless loop.
        reassertIfNeeded(reason: "category changed by another component")
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard
            let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw)
        else { return }
        if type == .ended { reassertIfNeeded(reason: "interruption ended") }
    }

    @objc private func handleDidBecomeActive() {
        reassertIfNeeded(reason: "app became active")
    }

    /// Cheap enough to call from anywhere in a capture flow: it reads the current category and
    /// writes only when it is not already what we want, so repeated calls cost a property read.
    func reassertIfNeeded(reason: String) {
        let session = AVAudioSession.sharedInstance()
        if session.category == .ambient && session.categoryOptions.contains(.mixWithOthers) {
            return
        }
        note("category was \(session.category.rawValue) -- restoring (\(reason))")
        apply(reason: reason)
    }

    private func apply(reason: String) {
        let session = AVAudioSession.sharedInstance()
        do {
            // .ambient never interrupts another app, and never resumes as the active audio
            // owner after an interruption -- which is what makes it right for an app whose own
            // recordings carry no audio track at all (the capture session takes no microphone
            // input, and every getUserMedia call on the web side asks for video only).
            try session.setCategory(.ambient, options: [.mixWithOthers])
            try session.setActive(true, options: [])
            note("category set to ambient/mixWithOthers (\(reason))")
        } catch {
            note("FAILED to set category (\(reason)): \(error.localizedDescription)")
        }
    }
}
