import Foundation
import ARKit
import SceneKit
import AVFoundation
import ImageIO
import simd
import Capacitor

// The ARKit body-tracking swap, one tracker mode at a time (see
// bar-tracking.ts/bar-tracker-dialog.tsx for the MediaPipe pipeline this
// replaces, mode by mode, on iOS). getUserMedia and ARSession can't both
// own the camera at once, so once this is running for a given dialog the
// web-side <video> element goes dark for that view and this plugin renders
// ARKit's own passthrough feed as a native view instead -- positioned
// behind a transparent hole in the WebView at whatever screen rect the JS
// side reports its video container occupies (see native-ar-preview.ts).
//
// Body-tracking joints are read every frame and emitted (see
// session(_:didUpdate frame:) below) as the "bodyTracking" JS event -- see
// client/src/lib/native-ar-preview.ts's onBodyTracking. ar-body-landmarks.ts
// bridges these into the same shape pose-tracking.ts's MediaPipe-derived
// math already consumes, so jump mode (ar-jump-tracker-dialog.tsx) already
// runs on this unmodified. A live skeleton -- spheres at each joint,
// cylinders for bones, placed as real nodes at these same world positions
// -- renders on top of the passthrough feed every frame, independent of
// the ~30fps JS-emission throttle (see updateSkeletonVisual). Also running
// in this same session, never rendered: plane detection, purely for the
// tracking-accuracy benefit -- see the comment on configuration.planeDetection
// in start() below. (Scene reconstruction/LiDAR mesh was tried alongside it
// and reverted -- ARBodyTrackingConfiguration has no sceneReconstruction
// member on this SDK, confirmed by two separate CI failures, not just
// assumed from docs.)
//
// Implement (barbell/dumbbell/kettlebell) tracking -- start(trackImplement:
// true) only, for a bar-path/full mode dialog -- runs ArImplementTracker
// (see its own file comment) once per hand every frame, unthrottled same as
// the skeleton visual, with only the JS-facing leftImplement/rightImplement
// fields on "bodyTracking" gated by the emission throttle. Its search
// window centers on each hand joint projected into capturedImage's own
// pixel space (a DIFFERENT projection than hipScreenX/Y above -- that one
// targets the portrait display; this one targets the raw landscape sensor
// buffer capturedImage's bytes are laid out in).
@objc(ArCameraPreviewPlugin)
public class ArCameraPreviewPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "ArCameraPreviewPlugin"
    public let jsName = "ArCameraPreview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetImplementTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiagnosticLog", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCameraPermission", returnType: CAPPluginReturnPromise)
    ]

    // Buffered, not just live-broadcast -- a "diagnosticLog" JS event fired
    // and lost before native-ar-preview.ts's listener finished its own
    // async registration (addListener is itself a bridge round-trip) would
    // explain exactly what showed up on a real device: zero log lines, not
    // even "start() called" (logDiag's own first call, at the very top of
    // start() below). Polling this via getDiagnosticLog() instead of
    // relying on the live event can't lose anything that way -- whatever's
    // in here at poll time is everything logDiag has ever posted since the
    // buffer was last cleared (see start()'s first line).
    private var diagLogBuffer: [String] = []

    private var previewView: ARSCNView?
    // Throttles the "bodyTracking" JS event to ~30fps -- ARKit can deliver
    // frame updates faster than that on some devices, and the analytics
    // math this eventually feeds (see pose-tracking.ts's velocity/tempo
    // calculations) doesn't need more resolution than a typical
    // getUserMedia video already gave it.
    private var lastEmitTimestamp: TimeInterval = 0
    private let emitIntervalSeconds: TimeInterval = 1.0 / 30.0
    private var hadBody = false
    // Three straight on-device rounds (contentScaleFactor/render-scale,
    // video format, compositing order) were each individually confirmed
    // correct yet the camera background stayed blurry -- guessing a fourth
    // native-code change with no new evidence isn't the move. This instead
    // logs ARKit's OWN reported camera focus/exposure metadata plus a
    // measured sharpness number for the first frame of each session, once,
    // so the next report comes with real numbers instead of a screenshot.
    private var hasLoggedFrameDiagnostics = false

    // MARK: - Body-anchor plausibility gating
    //
    // ARKit reports *some* ARBodyAnchor in two situations this file
    // shouldn't draw or trust: (1) a brand-new anchor, on the very first
    // frame(s) it appears -- a one-frame spurious detection off a rack or
    // barbell looks identical to a real lock for a single frame, the same
    // reason ArImplementTracker doesn't trust a found implement until its
    // own lockStreak has held for a few frames; and (2) an anchor that WAS
    // a real, correctly-tracked person, but whose subject has since left
    // frame or gone fully occluded -- ARKit doesn't remove the anchor from
    // frame.anchors immediately in that case, it keeps reporting its last
    // known (now frozen) transform for a while first, and bodyAnchor
    // presence alone can't tell "real, live" from "stale, frozen" apart.
    //
    // Both cases share one signal a real, live human doesn't: no person
    // holds their root (hip) position within a few millimeters for a full
    // second, even standing "still" -- postural sway and breathing alone
    // move more than that. A static rack, or a real anchor ARKit is just
    // coasting on without fresh data, doesn't move at all. Requiring the
    // anchor's root to have moved a minimum amount over a trailing window,
    // on top of having held continuously for a short ramp-up, catches both
    // without this file needing to know which case it's looking at.
    //
    // Thresholds are a starting guess, not measured against a real device
    // -- same caveat as native-ar-preview.ts's framingHint distance
    // thresholds. Meant to be tightened (or loosened, if genuine tracking
    // ever gets wrongly rejected) once real-device testing shows what a
    // real hold vs. a false lock actually look like.
    private static let minHoldSecondsBeforeTrust: TimeInterval = 0.3
    private static let motionWindowSeconds: TimeInterval = 1.0
    private static let minPlausibleMotionMeters: Float = 0.006

    private var plausibilityAnchorId: UUID?
    private var plausibilityFirstSeenAt: TimeInterval = 0
    private var plausibilityHistory: [(t: TimeInterval, pos: SIMD3<Float>)] = []

    // Called once per didUpdate frame, before anything else trusts
    // bodyAnchor -- skeleton drawing, implement tracking, and the emitted
    // "bodyTracking" event all sit downstream of this returning true.
    private func isBodyAnchorPlausible(_ bodyAnchor: ARBodyAnchor, now: TimeInterval) -> Bool {
        let column = bodyAnchor.transform.columns.3
        let rootPos = SIMD3<Float>(column.x, column.y, column.z)

        if plausibilityAnchorId != bodyAnchor.identifier {
            plausibilityAnchorId = bodyAnchor.identifier
            plausibilityFirstSeenAt = now
            plausibilityHistory = []
        }

        plausibilityHistory.append((t: now, pos: rootPos))
        plausibilityHistory.removeAll { now - $0.t > Self.motionWindowSeconds }

        guard now - plausibilityFirstSeenAt >= Self.minHoldSecondsBeforeTrust else { return false }

        // Not enough history yet to judge motion (this anchor is younger
        // than half a window) -- fall back to trusting the hold-time ramp
        // alone rather than penalizing a genuinely fresh, real lock for not
        // yet having a full window of history.
        guard let oldest = plausibilityHistory.first, now - oldest.t >= Self.motionWindowSeconds * 0.5 else {
            return true
        }

        var maxSpread: Float = 0
        for sample in plausibilityHistory {
            maxSpread = max(maxSpread, simd_distance(sample.pos, rootPos))
        }
        return maxSpread >= Self.minPlausibleMotionMeters
    }

    // ARSkeletonDefinition.defaultBody3D.jointNames is index-matched to
    // ARSkeleton3D.jointModelTransforms -- read once and reused rather than
    // hardcoding ARKit's internal joint-name strings (which aren't exposed
    // as individual named constants the way .root/.head/.leftHand/
    // .rightHand are), so a wrong guessed string can't silently drop a
    // joint. The JS side maps these ARKit joint names to the specific ones
    // it needs by name, not index, once that mapping is worked out from a
    // real device's actual joint list.
    private let jointNames = ARSkeletonDefinition.defaultBody3D.jointNames
    // Index-matched to jointNames -- each joint's parent joint index in the
    // skeleton hierarchy (the root has no parent). This is exactly the
    // connectivity graph updateSkeletonVisual needs to draw bones, the same
    // way Apple's own "Capturing Body Motion in 3D" sample does it.
    private let parentIndices = ARSkeletonDefinition.defaultBody3D.parentIndices

    // MARK: - Skeleton visual (see updateSkeletonVisual's own comment)
    private static let skeletonColor = UIColor(red: 0.176, green: 0.831, blue: 0.686, alpha: 1.0) // #2dd4bf, matches the app's other tracker overlays
    private var skeletonNode: SCNNode?
    private var jointNodes: [String: SCNNode] = [:]
    private var boneNodes: [Int: SCNNode] = [:]

    // MARK: - Implement (barbell/dumbbell/kettlebell) tracking -- see
    // ArImplementTracker's own file comment for the algorithm. Off by
    // default (jump/sprint dialogs never set it) -- only a bar-path/full
    // mode dialog passes trackImplement:true to start(), since motion-diff
    // scanning capturedImage every frame is wasted work for a mode with
    // nothing held. One instance per hand, exactly mirroring
    // implement-tracking.ts's leftImplementTrackerRef/rightImplementTrackerRef
    // -- a two-handed grip (barbell) needs both sides independently tracked
    // for bar tilt to mean anything; a one-handed implement (dumbbell,
    // kettlebell) just leaves the other side's result unused, same as the
    // JS version.
    private var trackImplement = false
    private let leftImplementTracker = ArImplementTracker()
    private let rightImplementTracker = ArImplementTracker()

    // MARK: - Recording (see appendVideoFrame's own comment)
    private var isRecording = false
    private var recordingOutputURL: URL?
    private var assetWriter: AVAssetWriter?
    private var assetWriterInput: AVAssetWriterInput?
    private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var recordingStartTime: TimeInterval?

    // cameraPermission is real diagnostic data, not a guess -- reads
    // AVCaptureDevice's own authorization status (the same TCC-backed value
    // iOS uses to decide whether session.run() below will even be able to
    // prompt) directly onto the phone screen (see the tracker dialogs'
    // diagnostic strip), rather than inferring permission state indirectly
    // from whether a prompt appeared.
    @objc func isSupported(_ call: CAPPluginCall) {
        let status: String
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: status = "authorized"
        case .denied: status = "denied"
        case .restricted: status = "restricted"
        case .notDetermined: status = "notDetermined"
        @unknown default: status = "unknown"
        }
        call.resolve([
            "supported": ARBodyTrackingConfiguration.isSupported,
            "cameraPermission": status,
        ])
    }

    // A standalone, minimal isolation test -- does nothing but ask for
    // camera access, completely bypassing start()/continueStart()'s
    // ARSCNView setup, session configuration, and everything else that
    // could theoretically hang or crash silently before ever reaching
    // AVCaptureDevice.requestAccess. If this doesn't prompt either, the
    // problem is at the plugin-dispatch/bridge level itself, not buried in
    // start()'s own complexity -- logDiag calls on both sides of the
    // request make that unambiguous either way.
    @objc func requestCameraPermission(_ call: CAPPluginCall) {
        logDiag("requestCameraPermission() called")
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                self.logDiag("requestCameraPermission result: \(granted ? "granted" : "denied")")
                call.resolve(["granted": granted])
            }
        }
    }

    // A step-by-step execution trace, not a single one-time snapshot --
    // each call is one line appended to the on-screen diagnostic log (see
    // the tracker dialogs' diagLog state / onDiagnosticLog in
    // native-ar-preview.ts). Exists specifically to answer "does start()
    // even run to completion, and if not, exactly which line does it stop
    // at" without needing a Mac/Xcode console -- the isSupported()-based
    // strip alone couldn't show that, since it only ever reflects one
    // snapshot taken when the dialog opens, not what happens after.
    private func logDiag(_ message: String) {
        diagLogBuffer.append(message)
        notifyListeners("diagnosticLog", data: ["message": message])
    }

    @objc func getDiagnosticLog(_ call: CAPPluginCall) {
        call.resolve(["log": diagLogBuffer])
    }

    @objc func start(_ call: CAPPluginCall) {
        diagLogBuffer.removeAll()
        logDiag("start() called")
        guard ARBodyTrackingConfiguration.isSupported else {
            call.reject("ARBodyTrackingConfiguration is not supported on this device")
            return
        }
        logDiag("requesting camera permission...")
        // Explicit request rather than relying on session.run() below to
        // trigger the system permission prompt on its own -- requestAccess
        // is Apple's documented, reliable way to guarantee that prompt
        // actually fires the first time a call is made from this app;
        // relying on ARSession's own internal handling left open exactly
        // the failure mode this is fixing (session.run() failing silently
        // -- see didFailWithError above -- with no confirmation the OS
        // ever even asked). Calls back immediately with the cached answer
        // on every call after the first real decision, so this never
        // re-prompts once already granted or denied.
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                self.logDiag("permission result: \(granted ? "granted" : "denied")")
                guard granted else {
                    call.reject("Camera access denied -- enable it in Settings > Forge > Camera")
                    return
                }
                self.continueStart(call)
            }
        }
    }

    private func continueStart(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.logDiag("continueStart() running")
            guard let webView = self.bridge?.webView, let container = webView.superview else {
                self.logDiag("FAILED: bridge webView/superview not available")
                call.reject("Bridge WebView is not available")
                return
            }

            let rect = self.rectFromCall(call)
            self.logDiag("rect: \(rect)")

            if let existing = self.previewView {
                self.logDiag("reusing existing ARSCNView")
                existing.frame = rect
            } else {
                self.logDiag("creating ARSCNView, inserting behind webView")
                let scnView = ARSCNView(frame: rect)
                // Explicit, not left to inherit from the window -- a view
                // constructed with an explicit CGRect frame (as opposed to
                // Auto Layout against an already-attached superview) doesn't
                // reliably pick up the screen's native Retina scale before
                // its first render pass on every device, and SCNView bakes
                // contentScaleFactor into the actual pixel dimensions of its
                // Metal render target: silently defaulting to 1x here is the
                // single most common cause of "photo looks soft/blurry" bug
                // reports against a native SceneKit view layered under a
                // WebView, completely independent of anything the camera
                // itself is doing.
                scnView.contentScaleFactor = UIScreen.main.scale
                scnView.autoenablesDefaultLighting = true
                container.insertSubview(scnView, belowSubview: webView)
                self.previewView = scnView
                // Debugging the still-blurry report after the
                // contentScaleFactor fix above didn't resolve it on-device --
                // confirms whether the view actually landed at a real,
                // non-zero size with the intended scale, or whether the rect
                // the JS side measured (see rectFromCall above) was
                // degenerate at the moment this ran.
                self.logDiag("scnView.bounds=\(scnView.bounds) scale=\(scnView.contentScaleFactor) screenScale=\(UIScreen.main.scale)")

                let skeleton = SCNNode()
                scnView.scene.rootNode.addChildNode(skeleton)
                self.skeletonNode = skeleton

                // Only the one DOM container the JS side clears `background`
                // on actually shows anything through this -- Forge's body
                // element always paints its own opaque background (see
                // index.css), so the rest of the app is unaffected by the
                // WebView itself becoming transparent here.
                webView.isOpaque = false
                webView.backgroundColor = .clear
                webView.scrollView.backgroundColor = .clear
                self.logDiag("webView.isOpaque=\(webView.isOpaque)")
            }

            self.hadBody = false
            self.lastEmitTimestamp = 0
            self.hasLoggedFrameDiagnostics = false
            self.trackImplement = call.getBool("trackImplement") ?? false
            self.leftImplementTracker.reset()
            self.rightImplementTracker.reset()
            self.plausibilityAnchorId = nil
            self.plausibilityFirstSeenAt = 0
            self.plausibilityHistory = []
            let configuration = ARBodyTrackingConfiguration()
            // Runs in the SAME session as body tracking -- no separate
            // ARSession needed. Never rendered -- no grid, no mesh
            // visualization -- this is purely for the accuracy benefit: a
            // detected floor plane gives the tracker a stable real-world
            // reference. NOT paired with sceneReconstruction (LiDAR mesh) --
            // that was tried and reverted (CI caught it twice: unlike
            // ARWorldTrackingConfiguration, ARBodyTrackingConfiguration has
            // no sceneReconstruction member at all on this SDK, despite what
            // its docs page seemed to say -- the compiler is the actual
            // source of truth here, not the docs). LiDAR's accuracy benefit
            // for body tracking, if any, isn't available through this
            // configuration.
            configuration.planeDetection = [.horizontal]
            // Previously hand-picked whichever supported format had the
            // highest fps (tie-broken by resolution), on the theory that a
            // fast movement (a bar's concentric drive, a sprint stride)
            // would motion-blur less at a higher capture rate. On-device
            // testing (builds 131/132) showed a different, worse problem
            // instead: the picture was softly out of focus everywhere, all
            // the time -- confirmed against the same phone's stock Camera
            // app (sharp, same spot) and unresponsive to tap-to-focus in
            // Forge, i.e. specific to this AR session's capture pipeline,
            // not the lens/hardware. The fps override was the one thing
            // this session was doing differently from a normal ARKit body-
            // tracking session, which is consistent with it having landed
            // on a tracking-throughput-optimized capture mode instead of
            // Apple's own tuned default. Leaving videoFormat unset lets
            // ARKit pick that default; the actual resolution/fps it lands
            // on is logged below so a future regression has something to
            // compare against.
            self.logDiag("videoFormat (ARKit default): \(configuration.videoFormat.imageResolution.width)x\(configuration.videoFormat.imageResolution.height) @ \(configuration.videoFormat.framesPerSecond)fps")
            self.previewView?.session.delegate = self
            self.logDiag("calling session.run()")
            self.previewView?.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            self.logDiag("session.run() returned, resolving")
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // A recording nobody explicitly stopped (dialog closed/backgrounded
            // mid-capture) shouldn't leave a writer dangling -- cancelWriting
            // discards whatever was written rather than trying to finalize a
            // clip nothing asked for.
            if self.isRecording {
                self.isRecording = false
                self.assetWriter?.cancelWriting()
                self.assetWriter = nil
                self.assetWriterInput = nil
                self.pixelBufferAdaptor = nil
                self.recordingOutputURL = nil
            }
            self.previewView?.session.pause()
            self.previewView?.removeFromSuperview()
            self.previewView = nil
            // The scene (and every node in it, skeletonNode included) tears
            // down along with previewView above -- these dictionaries would
            // otherwise hold references to now-dead nodes.
            self.skeletonNode = nil
            self.jointNodes.removeAll()
            self.boneNodes.removeAll()
            self.trackImplement = false
            self.leftImplementTracker.reset()
            self.rightImplementTracker.reset()
            call.resolve()
        }
    }

    // Called at the start of each new tracked set (not each dialog open --
    // one AR session/dialog open covers multiple sets) so a lock held from
    // the previous set can't carry into the first frame of the next one.
    // Mirrors implement-tracking.ts's own ImplementTracker.reset(), called
    // the same way from bar-tracker-dialog.tsx's startTracking().
    @objc func resetImplementTracking(_ call: CAPPluginCall) {
        leftImplementTracker.reset()
        rightImplementTracker.reset()
        call.resolve()
    }

    // Video isn't recorded from a browser getUserMedia stream the way the
    // MediaPipe-tracked dialogs do (there is no browser stream once this
    // plugin owns the camera -- see the file-level comment) -- instead this
    // writes ARFrame.capturedImage straight to an MP4 as ARSession delivers
    // frames, via AVAssetWriter. startRecording only flips a flag; the
    // writer itself is created lazily on the first frame that actually
    // arrives afterward (see appendVideoFrame), since only then is the
    // captured image's real pixel dimensions known.
    @objc func startRecording(_ call: CAPPluginCall) {
        guard !isRecording else {
            call.reject("Already recording")
            return
        }
        recordingOutputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        recordingStartTime = nil
        isRecording = true
        call.resolve()
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        guard isRecording else {
            call.reject("Not recording")
            return
        }
        isRecording = false
        guard let writer = assetWriter, let outputURL = recordingOutputURL, writer.status == .writing else {
            // No frames ever actually landed (e.g. stopped an instant after
            // starting, before the next ARFrame arrived) -- nothing to
            // finalize.
            assetWriter = nil
            assetWriterInput = nil
            pixelBufferAdaptor = nil
            recordingOutputURL = nil
            call.reject("No frames were captured")
            return
        }
        assetWriterInput?.markAsFinished()
        writer.finishWriting { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if writer.status == .completed {
                    // .path (a bare POSIX path, no scheme) is what this used
                    // to send -- Capacitor's Filesystem.readFile (see
                    // native-ar-preview.ts's stopArRecording), called with no
                    // `directory` option, requires a real file:// URI to
                    // parse, not a bare path. .absoluteString is that URI.
                    // Never mattered before this fix landed because the
                    // camera never ran long enough to reach a completed
                    // recording in the first place -- this is a second, real
                    // bug the first one was hiding, not a guess.
                    call.resolve(["path": outputURL.absoluteString])
                } else {
                    call.reject(writer.error?.localizedDescription ?? "Recording failed")
                }
                self.assetWriter = nil
                self.assetWriterInput = nil
                self.pixelBufferAdaptor = nil
                self.recordingOutputURL = nil
            }
        }
    }

    // Runs on every ARFrame regardless of body-detection state or the
    // joint-emission throttle in session(_:didUpdate:) below -- a capture
    // with a moment of no body in frame (setting up, walking into position)
    // shouldn't have a gap in the video. ARKit's captured image is always
    // the sensor's native landscape orientation no matter how the phone is
    // held; the app records portrait everywhere else, so this tags the
    // output with a 90° rotation transform (metadata-level, not a re-encode)
    // the same way AVCaptureConnection.videoOrientation = .portrait would
    // for the equivalent getUserMedia-based capture.
    private func appendVideoFrame(_ frame: ARFrame) {
        guard isRecording, let outputURL = recordingOutputURL else { return }

        if assetWriter == nil {
            let resolution = frame.camera.imageResolution
            guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
                isRecording = false
                recordingOutputURL = nil
                return
            }
            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: Int(resolution.width),
                AVVideoHeightKey: Int(resolution.height),
                // No bitrate here left AVAssetWriter's own default
                // heuristic in charge, which scales aggressively with
                // resolution -- at ARKit's own capture resolution (well
                // above a typical getUserMedia preview stream) that
                // produced recordings easily reaching several hundred MB
                // for an ordinary multi-rep set, sized for nothing this
                // footage is actually used for (on-device/small-screen form
                // review, not archival or broadcast quality). 8 Mbps H.264
                // stays clearly legible for that at any resolution this
                // records at, at a fraction of the uncapped default's size.
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: 8_000_000
                ]
            ]
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
            input.expectsMediaDataInRealTime = true
            input.transform = CGAffineTransform(rotationAngle: .pi / 2)
            let adaptor = AVAssetWriterInputPixelBufferAdaptor(
                assetWriterInput: input,
                sourcePixelBufferAttributes: [
                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                ]
            )
            guard writer.canAdd(input) else { return }
            writer.add(input)
            writer.startWriting()
            writer.startSession(atSourceTime: .zero)
            assetWriter = writer
            assetWriterInput = input
            pixelBufferAdaptor = adaptor
            recordingStartTime = frame.timestamp
        }

        guard let writer = assetWriter, writer.status == .writing,
              let input = assetWriterInput, input.isReadyForMoreMediaData,
              let adaptor = pixelBufferAdaptor,
              let startTime = recordingStartTime else { return }
        let presentationTime = CMTime(seconds: frame.timestamp - startTime, preferredTimescale: 600)
        adaptor.append(frame.capturedImage, withPresentationTime: presentationTime)
    }

    // Live skeleton overlay -- small spheres at each joint, thin cylinders
    // for bones, placed as real nodes at ARKit's own world-space joint
    // positions directly in the AR scene. This needs no manual camera-
    // projection math: SceneKit is a real 3D renderer, so a node placed at
    // a world position already draws perspective-correct wherever the
    // camera is looking, the same as any other AR content. Runs every
    // frame regardless of the JS-emission throttle in
    // session(_:didUpdate:) -- native rendering should stay smooth even
    // though the JS side doesn't need more than ~30fps of joint data.
    private func updateSkeletonVisual(positions: [String: SIMD3<Float>]) {
        guard let root = skeletonNode else { return }
        root.isHidden = false

        for (index, name) in jointNames.enumerated() {
            guard let pos = positions[name] else { continue }
            let jointNode: SCNNode
            if let existing = jointNodes[name] {
                jointNode = existing
            } else {
                let sphere = SCNSphere(radius: 0.015)
                sphere.firstMaterial?.diffuse.contents = Self.skeletonColor
                sphere.firstMaterial?.lightingModel = .constant
                jointNode = SCNNode(geometry: sphere)
                root.addChildNode(jointNode)
                jointNodes[name] = jointNode
            }
            jointNode.simdPosition = pos

            guard index < parentIndices.count else { continue }
            // ARSkeletonDefinition.parentIndices is NSArray<NSNumber *> in
            // the raw Objective-C header (NS_REFINED_FOR_SWIFT) -- Apple's
            // Swift overlay exposes the refined version as a plain [Int],
            // not [NSNumber], so this reads it directly rather than via
            // .intValue.
            let parentIdx = parentIndices[index]
            guard parentIdx >= 0, parentIdx < jointNames.count else { continue }
            guard let parentPos = positions[jointNames[parentIdx]] else { continue }

            let boneNode: SCNNode
            if let existing = boneNodes[index] {
                boneNode = existing
            } else {
                let cylinder = SCNCylinder(radius: 0.008, height: 1)
                cylinder.firstMaterial?.diffuse.contents = Self.skeletonColor
                cylinder.firstMaterial?.lightingModel = .constant
                boneNode = SCNNode(geometry: cylinder)
                root.addChildNode(boneNode)
                boneNodes[index] = boneNode
            }
            orientBone(boneNode, from: parentPos, to: pos)
        }
    }

    // Standard "align a default-up-axis cylinder to point along an
    // arbitrary direction" quaternion: rotation axis is the cross product
    // of the cylinder's default up vector and the target direction,
    // rotation angle is the angle between them.
    private func orientBone(_ node: SCNNode, from: SIMD3<Float>, to: SIMD3<Float>) {
        let vector = to - from
        let distance = simd_length(vector)
        node.simdPosition = (from + to) * 0.5
        if let cylinder = node.geometry as? SCNCylinder {
            cylinder.height = CGFloat(max(distance, 0.001))
        }
        guard distance > 0.0001 else { return }
        let up = SIMD3<Float>(0, 1, 0)
        let dir = vector / distance
        let dot = simd_dot(up, dir)
        if dot > 0.9999 {
            node.simdOrientation = simd_quatf(angle: 0, axis: SIMD3<Float>(1, 0, 0))
        } else if dot < -0.9999 {
            node.simdOrientation = simd_quatf(angle: .pi, axis: SIMD3<Float>(1, 0, 0))
        } else {
            let axis = simd_normalize(simd_cross(up, dir))
            node.simdOrientation = simd_quatf(angle: acos(dot), axis: axis)
        }
    }

    @objc func updateRect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.previewView?.frame = self.rectFromCall(call)
            call.resolve()
        }
    }

    private func rectFromCall(_ call: CAPPluginCall) -> CGRect {
        let x = call.getDouble("x") ?? 0
        let y = call.getDouble("y") ?? 0
        let width = call.getDouble("width") ?? UIScreen.main.bounds.width
        let height = call.getDouble("height") ?? UIScreen.main.bounds.height
        return CGRect(x: x, y: y, width: width, height: height)
    }

    // MARK: - ARSessionDelegate

    // One ARBodyAnchor per session -- single-person tracking is what
    // ARBodyTrackingConfiguration is designed for -- read every frame and
    // forwarded to JS as real-world joint positions. jointModelTransforms
    // are relative to the body anchor's own root joint; composing with
    // bodyAnchor.transform (the root's own position/orientation in world
    // space) gives each joint's position in the same world coordinate
    // space ARKit reports everything else in, in meters.
    // start() above resolves its call the instant session.run() is called,
    // without waiting to see whether the session actually comes up --
    // ARSession failures (camera permission denied, camera already claimed
    // by something else, etc.) are only ever reported asynchronously
    // through this delegate method, not through run()'s call site. Without
    // this, that failure had nowhere to go: no JS error, no "not
    // supported" banner either (isSupported() already returned true), just
    // a black view that silently never receives a single didUpdate frame
    // call. Forwarded as a dedicated "sessionError" event rather than
    // folded into "bodyTracking" so the JS-side BodyTrackingFrame contract
    // (tracked: true/false) doesn't have to grow a third shape -- see
    // native-ar-preview.ts's onSessionError.

    // Everything app code controls about this camera feed (render scale,
    // video format, layering) has now been checked and individually
    // confirmed correct against the same on-device blur report -- see the
    // comment on hasLoggedFrameDiagnostics above. What's left is what ARKit
    // itself is actually doing with focus/exposure on this frame, which
    // isn't visible from the app side at all unless it's explicitly read
    // and logged. exifData carries the same focus/exposure fields a photo
    // library image would (subject distance, focal length, aperture,
    // exposure time, ISO); camera.intrinsics gives the focal-length-in-
    // pixels/principal-point this frame was actually captured with, useful
    // for spotting an unexpected crop/zoom; and frameSharpnessScore turns
    // "looks blurry" into an actual number (variance of the luma Laplacian
    // -- low and flat means genuinely low-frequency/blurred content, not
    // just a subjective impression), so a future comparison doesn't have to
    // rely on eyeballing screenshots against each other.
    private func logFrameDiagnostics(_ frame: ARFrame) {
        // Not optional (Apple declares this as a plain, possibly-empty
        // dictionary) -- checking isEmpty rather than an if-let, which
        // would always succeed here and silently hide the "ARKit didn't
        // populate this at all" case behind a misleading success branch.
        let exif = frame.exifData
        if exif.isEmpty {
            logDiag("EXIF: frame.exifData was empty")
        } else {
            let subjectDistance = exif[kCGImagePropertyExifSubjectDistance as String]
            let focalLength = exif[kCGImagePropertyExifFocalLength as String]
            let aperture = exif[kCGImagePropertyExifApertureValue as String]
            let exposureTime = exif[kCGImagePropertyExifExposureTime as String]
            let iso = exif[kCGImagePropertyExifISOSpeedRatings as String]
            logDiag(
                "EXIF subjectDistance=\(String(describing: subjectDistance)) "
                    + "focalLength=\(String(describing: focalLength)) "
                    + "aperture=\(String(describing: aperture)) "
                    + "exposureTime=\(String(describing: exposureTime)) "
                    + "iso=\(String(describing: iso))"
            )
        }

        let intrinsics = frame.camera.intrinsics
        logDiag(
            "intrinsics fx=\(intrinsics.columns.0.x) fy=\(intrinsics.columns.1.y) "
                + "cx=\(intrinsics.columns.2.x) cy=\(intrinsics.columns.2.y)"
        )

        if #available(iOS 16.0, *) {
            logDiag(
                "exposureDuration=\(frame.camera.exposureDuration) "
                    + "exposureOffset=\(frame.camera.exposureOffset)"
            )
        }

        let sharpness = frameSharpnessScore(frame.capturedImage)
        logDiag("frameSharpness (variance of decimated luma Laplacian) = \(sharpness)")
    }

    // Cheap, single-shot approximation of the standard "variance of
    // Laplacian" blur metric (OpenCV's cv::Laplacian + cv::meanStdDev, done
    // by hand since this file has no OpenCV/Accelerate dependency) --
    // walks a decimated grid over the luma plane rather than every pixel,
    // since this only ever runs once per session (see
    // hasLoggedFrameDiagnostics), not per frame. Meaningful for
    // before/after comparison against itself (same scene, same distance,
    // different build), not as an absolute pass/fail number -- content
    // (a blank wall vs. a cluttered rack) changes the baseline regardless
    // of focus.
    private func frameSharpnessScore(_ pixelBuffer: CVPixelBuffer) -> Double {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return -1 }
        let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let luma = base.assumingMemoryBound(to: UInt8.self)

        let step = 4
        var laplacians: [Double] = []
        var y = step
        while y < height - step {
            var x = step
            while x < width - step {
                let center = Double(luma[y * bytesPerRow + x])
                let up = Double(luma[(y - step) * bytesPerRow + x])
                let down = Double(luma[(y + step) * bytesPerRow + x])
                let left = Double(luma[y * bytesPerRow + (x - step)])
                let right = Double(luma[y * bytesPerRow + (x + step)])
                laplacians.append(4 * center - up - down - left - right)
                x += step
            }
            y += step
        }
        guard !laplacians.isEmpty else { return -1 }
        let mean = laplacians.reduce(0, +) / Double(laplacians.count)
        let variance = laplacians.reduce(0) { $0 + ($1 - mean) * ($1 - mean) } / Double(laplacians.count)
        return variance
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        notifyListeners("sessionError", data: ["message": error.localizedDescription])
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        appendVideoFrame(frame)

        if !hasLoggedFrameDiagnostics {
            hasLoggedFrameDiagnostics = true
            logFrameDiagnostics(frame)
        }

        let bodyAnchor = frame.anchors.compactMap { $0 as? ARBodyAnchor }.first

        guard let bodyAnchor = bodyAnchor, isBodyAnchorPlausible(bodyAnchor, now: frame.timestamp) else {
            skeletonNode?.isHidden = true
            // A body-tracking dropout can span an arbitrary gap (the
            // athlete stepped out of frame, tracking got lost) -- a held
            // implement lock, or even just the stale previous-frame luma
            // buffer, isn't trustworthy to resume from once tracking picks
            // back up. Full reset, not just rejectLock, clears that stale
            // buffer too.
            if trackImplement {
                leftImplementTracker.reset()
                rightImplementTracker.reset()
            }
            if hadBody {
                hadBody = false
                notifyListeners("bodyTracking", data: ["tracked": false])
            }
            return
        }

        hadBody = true

        let rootTransform = bodyAnchor.transform
        let modelTransforms = bodyAnchor.skeleton.jointModelTransforms
        // Built once, fed to both the skeleton visual (below, every frame)
        // and the JS-facing joints array (below the emission throttle) --
        // positions is a name-keyed lookup the visual needs for bone
        // endpoints; joints preserves the original array shape/order JS
        // already expects, unchanged by adding the visual.
        var positions: [String: SIMD3<Float>] = [:]
        var joints: [[String: Any]] = []
        positions.reserveCapacity(jointNames.count)
        joints.reserveCapacity(jointNames.count)
        for (index, name) in jointNames.enumerated() where index < modelTransforms.count {
            let worldTransform = simd_mul(rootTransform, modelTransforms[index])
            let column = worldTransform.columns.3
            let pos = SIMD3<Float>(column.x, column.y, column.z)
            positions[name] = pos
            joints.append(["name": name, "x": Double(pos.x), "y": Double(pos.y), "z": Double(pos.z)])
        }
        updateSkeletonVisual(positions: positions)

        // Runs every frame, unthrottled, same reasoning as the skeleton
        // visual above -- ArImplementTracker's motion diff needs
        // frame-to-frame continuity, and only the JS-facing result below
        // (not the tracking itself) is throttled to emitIntervalSeconds.
        var leftImplementResult: ArImplementTracker.TrackResult?
        var rightImplementResult: ArImplementTracker.TrackResult?
        if trackImplement {
            let imageViewport = frame.camera.imageResolution
            if let leftWristWorld = findJointPosition(positions, exact: "left_hand_joint", keyword: "left_hand") {
                let screen = frame.camera.projectPoint(
                    leftWristWorld, orientation: .landscapeRight, viewportSize: imageViewport
                )
                leftImplementResult = leftImplementTracker.track(
                    frame: frame, wristImageX: Double(screen.x), wristImageY: Double(screen.y), wristWorld: leftWristWorld
                )
                leftImplementResult = plausibilityGated(leftImplementResult, against: leftWristWorld, tracker: leftImplementTracker)
            } else {
                leftImplementTracker.rejectLock()
            }
            if let rightWristWorld = findJointPosition(positions, exact: "right_hand_joint", keyword: "right_hand") {
                let screen = frame.camera.projectPoint(
                    rightWristWorld, orientation: .landscapeRight, viewportSize: imageViewport
                )
                rightImplementResult = rightImplementTracker.track(
                    frame: frame, wristImageX: Double(screen.x), wristImageY: Double(screen.y), wristWorld: rightWristWorld
                )
                rightImplementResult = plausibilityGated(rightImplementResult, against: rightWristWorld, tracker: rightImplementTracker)
            } else {
                rightImplementTracker.rejectLock()
            }
        }

        if frame.timestamp - lastEmitTimestamp < emitIntervalSeconds { return }
        lastEmitTimestamp = frame.timestamp

        // Straight-line distance from the camera to the body's root joint --
        // both transforms are in the same world space, so this is just the
        // distance between their translation components. Lets the JS side
        // warn "step back" / "come closer" before a set even starts instead
        // of only finding out tracking was unreliable after the fact.
        let cameraPosition = frame.camera.transform.columns.3
        let rootPosition = rootTransform.columns.3
        let distanceMeters = Double(simd_distance(cameraPosition, rootPosition))

        // Hip root projected into normalized (0-1) on-screen space -- the
        // one piece sprint-tracking.ts's checkpoint-crossing model needs
        // that world-space joints alone can't give it: a start/finish
        // checkpoint is a screen position the coach taps, so the tracked
        // reference point needs to be comparable in that same screen space,
        // not real-world meters. projectPoint does the same 3D-to-2D
        // projection SceneKit already does implicitly to render the
        // skeleton on screen, just handed back as a point instead of drawn.
        // .portrait matches this plugin's one fixed orientation (see
        // appendVideoFrame's own rotation-transform comment -- there's no
        // dynamic orientation handling anywhere else in this file either).
        let viewportSize = previewView?.bounds.size ?? UIScreen.main.bounds.size
        let hipScreen = frame.camera.projectPoint(
            SIMD3<Float>(rootPosition.x, rootPosition.y, rootPosition.z),
            orientation: .portrait,
            viewportSize: viewportSize
        )
        let hipScreenX = viewportSize.width > 0 ? Double(hipScreen.x / viewportSize.width) : 0
        let hipScreenY = viewportSize.height > 0 ? Double(hipScreen.y / viewportSize.height) : 0

        var data: [String: Any] = [
            "tracked": true,
            "timestamp": frame.timestamp * 1000,
            "estimatedScaleFactor": Double(bodyAnchor.estimatedScaleFactor),
            "distanceMeters": distanceMeters,
            "hipScreenX": hipScreenX,
            "hipScreenY": hipScreenY,
            "joints": joints,
        ]
        if trackImplement {
            data["leftImplement"] = implementResultDict(leftImplementResult)
            data["rightImplement"] = implementResultDict(rightImplementResult)
        }
        notifyListeners("bodyTracking", data: data)
    }

    // Exact match first (ARKit's actual joint-name string, if this guess is
    // right), substring keyword second -- same two-tier matching
    // ar-body-landmarks.ts's findJoint already uses for these same guessed
    // names, kept in sync deliberately: there should only be ONE guess
    // about ARKit's hand-joint naming to verify against a real device, not
    // a second, possibly-different one living here.
    private func findJointPosition(_ positions: [String: SIMD3<Float>], exact: String, keyword: String) -> SIMD3<Float>? {
        if let pos = positions[exact] { return pos }
        for (name, pos) in positions where name.lowercased().contains(keyword) {
            return pos
        }
        return nil
    }

    // No real implement plausibly sits this far from the hand holding it --
    // same 0.35m ceiling and same reasoning as bar-tracker-dialog.tsx's own
    // MAX_PLAUSIBLE_GRIP_OFFSET_M check, just moved to where the tracked
    // result is actually produced instead of round-tripped through JS to
    // apply it there. A found "implement" this far from the wrist is
    // something else that happened to move nearby (a spotter's hand, a
    // reflection) -- reject the lock so the NEXT frame reacquires clean
    // rather than continuing to dead-reckon from a position just proven
    // wrong.
    private let maxPlausibleGripOffsetM: Float = 0.35

    private func plausibilityGated(
        _ result: ArImplementTracker.TrackResult?,
        against wristWorld: SIMD3<Float>,
        tracker: ArImplementTracker
    ) -> ArImplementTracker.TrackResult? {
        guard let result = result else { return nil }
        guard simd_distance(result.world, wristWorld) <= maxPlausibleGripOffsetM else {
            tracker.rejectLock()
            return nil
        }
        return result
    }

    private func implementResultDict(_ result: ArImplementTracker.TrackResult?) -> [String: Any]? {
        guard let result = result else { return nil }
        var dict: [String: Any] = [
            "x": Double(result.world.x),
            "y": Double(result.world.y),
            "z": Double(result.world.z),
            "confidence": result.confidence,
        ]
        if let color = result.color {
            dict["color"] = ["r": color.r, "g": color.g, "b": color.b]
        }
        return dict
    }
}
