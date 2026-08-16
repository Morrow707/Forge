import Foundation
import ARKit
import Capacitor

// Real-world measurement via LiDAR scene reconstruction -- lets a coach
// point the camera at an athlete and tap two points (floor at their feet,
// top of their head, a rack upright, whatever) to read back the actual
// metric distance between them. Unlike the 2D Ruler tool in
// video-analysis-dialog.tsx, which needs the user to type in a known
// reference length to calibrate pixels-to-inches, ARKit's world tracking is
// already true-scale once fused with LiDAR depth -- no reference object
// needed.
//
// LiDAR-only: supportsSceneReconstruction(.mesh) is Apple's own documented
// gate for this, and reads false on every non-LiDAR device (everything
// except iPhone 12 Pro and later Pro/Pro Max models, and LiDAR-equipped iPad
// Pros).
//
// Live-camera only, not something that can run against an already-recorded
// video file -- real-world depth only exists while ARKit is actively fusing
// the live camera feed with LiDAR + motion data. See ArMeasureViewController
// for the actual capture UI this presents.
@objc(ArMeasurePlugin)
public class ArMeasurePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ArMeasurePlugin"
    public let jsName = "ArMeasure"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)])
    }

    @objc func present(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) else {
            call.reject("LiDAR is not available on this device")
            return
        }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No view controller to present from")
                return
            }
            let controller = ArMeasureViewController { meters in
                if let meters = meters {
                    call.resolve(["meters": meters])
                } else {
                    // Cancelled without a completed measurement -- resolve
                    // (not reject) with no "meters" key so the JS wrapper can
                    // treat this the same as any other "user backed out"
                    // flow rather than an error worth surfacing.
                    call.resolve([:])
                }
            }
            controller.modalPresentationStyle = .fullScreen
            presenter.present(controller, animated: true)
        }
    }
}
