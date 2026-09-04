import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
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
