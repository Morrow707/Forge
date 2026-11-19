import Foundation
import UIKit
import Capacitor

// A PROGRAM'S APP ICON COLOR (Scott, 2026-11-19, "pure personalization"). Apple lets an app
// switch only among icons built into it, so the colors are the AppIcon-<id> sets in
// Assets.xcassets (shared/brand-extras.ts BRAND_APP_ICONS names the same ids) and this switches
// between them. iOS shows its own "You have changed the icon" alert each time; the web layer only
// asks when the program's choice differs from the icon in use, so it appears once per change.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getIcon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setIcon", returnType: CAPPluginReturnPromise)
    ]

    @objc func getIcon(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "supported": UIApplication.shared.supportsAlternateIcons,
                "name": UIApplication.shared.alternateIconName ?? NSNull()
            ])
        }
    }

    // `name` is the asset set's name ("AppIcon-navy"), or null/absent for Forge's own icon.
    @objc func setIcon(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("This device doesn't support changing the app icon.")
                return
            }
            if UIApplication.shared.alternateIconName == name {
                call.resolve(["name": name ?? NSNull()])
                return
            }
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error as NSError? {
                    call.reject("Couldn't change the app icon: \(error.domain) \(error.code)")
                } else {
                    call.resolve(["name": name ?? NSNull()])
                }
            }
        }
    }
}
