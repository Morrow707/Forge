import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
import CoreImage
import CoreML
import Vision
import UIKit
import Capacitor

// The AVFoundation + Vision tracking pipeline that replaced ARKit on iOS -- a long on-device
// investigation found ARKit's captured pixel data was genuinely, unfixably out of focus, with
// no public API to control focus/zoom/lens selection at all. ArCameraPreviewPlugin.swift, its
// ArImplementTracker.swift, and the ar-*-tracker-dialog.tsx/ar-*-capture-dialog.tsx files it
// powered have since been deleted outright, once this pipeline (and the AV/Vision-based
// goniometer and overhead-squat capture dialogs built on top of it afterward) covered
// everything they did -- not kept around as a fallback. Historical comments elsewhere in this
// file that still compare against "ArCameraPreviewPlugin.swift's own comment" are referring to
// that now-removed file's reasoning, not a file still present in this target.
//
// Phase 1 proved the camera side: a plain AVCaptureSession (the same foundation the stock
// Camera app uses) gives real zoom, real lens switching, and real autofocus/exposure that
// ARKit's ARSession never exposed a public API for. Phase 2 (analyzeRecording, below) adds
// Vision body-pose detection run OFFLINE against a recording already on disk -- not a live
// sample-buffer delegate -- see this file's own comment on record-first/analyze-later for why:
// running VNDetectHumanBodyPoseRequest live against a 60fps 4K feed would thermally throttle
// an older device the same way live ARKit inference risked.
//
// Positioned behind the WebView the same way ArCameraPreviewPlugin's ARSCNView used to be (see
// this file's own comment on webView.isOpaque / insertSubview(belowSubview:)) -- the JS side
// punches a transparent hole in its own DOM at whatever rect its video container occupies, and
// this plugin's AVCaptureVideoPreviewLayer renders behind that hole.
//
// Records to disk via AVCaptureMovieFileOutput -- AVFoundation's own native movie writer, not
// the hand-rolled AVAssetWriter-per-frame loop the old ARKit plugin had to build for
// ARFrame.capturedImage. Record-first, analyze-later: Vision processing against the recorded
// clip runs offline afterward (Phase 2+), not live against the capture session, to avoid
// thermally throttling an older device the way live 60fps ML inference against a 4K feed
// would (this app already has direct on-device proof thermal state is a real, measurable
// variable -- see the AR camera diagnostic work that motivated this whole rewrite).
@objc(AvBodyTrackingPlugin)
public class AvBodyTrackingPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureFileOutputRecordingDelegate {
    public let identifier = "AvBodyTrackingPlugin"
    public let jsName = "AvBodyTracking"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCameraPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listLenses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectLens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFocusPoint", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "analyzeRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAnalysis", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiagnosticLog", returnType: CAPPluginReturnPromise)
    ]

    // Same buffered-log pattern as ArCameraPreviewPlugin.swift's diagLogBuffer -- see its own
    // comment on why polling getDiagnosticLog() beats relying on a live event alone.
    private var diagLogBuffer: [String] = []
    private func logDiag(_ message: String) {
        diagLogBuffer.append(message)
        notifyListeners("diagnosticLog", data: ["message": message])
    }

    @objc func getDiagnosticLog(_ call: CAPPluginCall) {
        call.resolve(["log": diagLogBuffer])
    }

    // Fires every second while the session is running, logging what the physical camera is
    // actually doing right now -- lens focus position (0=closest, 1=infinity), whether AF/AE/AWB
    // are actively hunting or have settled, ISO, exposure duration, zoom. The one-shot
    // start-of-session log lines (activeFormat, focus mode) only ever say what was REQUESTED;
    // this is the only way to see whether the lens actually moved/settled somewhere reasonable
    // afterward, or is stuck -- exactly the "is it really stuck at macro" question no static log
    // line can answer. Started right after session.startRunning() resolves, invalidated in stop().
    private var telemetryTimer: Timer?
    private func startTelemetryTimer(for device: AVCaptureDevice) {
        telemetryTimer?.invalidate()
        telemetryTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let lensPos = String(format: "%.2f", device.lensPosition)
            let iso = String(format: "%.0f", device.iso)
            let expMs = String(format: "%.1f", CMTimeGetSeconds(device.exposureDuration) * 1000)
            self.logDiag(
                "cam: lens=\(lensPos) iso=\(iso) exp=\(expMs)ms zoom=\(String(format: "%.2f", device.videoZoomFactor)) "
                    + "adjustingFocus=\(device.isAdjustingFocus) adjustingExposure=\(device.isAdjustingExposure) "
                    + "adjustingWB=\(device.isAdjustingWhiteBalance)"
            )
        }
    }

    private var session: AVCaptureSession?
    private var previewLayerView: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var currentInput: AVCaptureDeviceInput?
    private var movieOutput: AVCaptureMovieFileOutput?
    private var recordingCall: CAPPluginCall?
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

    // Session configuration/startRunning happens off the main thread -- startRunning() in
    // particular is a blocking call Apple's own docs warn can take noticeable time, and
    // nothing here needs it to be synchronous with the UI work in continueStart.
    private static let sessionQueue = DispatchQueue(label: "com.forge.avbodytracking.session")
    // Separate from sessionQueue -- Phase 2's frame-by-frame Vision analysis can run at the
    // same time a new preview session is starting for the next set, and shouldn't contend
    // with (or block) camera setup. `var`, not `let`: see analyzeRecording's own watchdog
    // comment on why a permanently stuck call here can force this to be swapped out for a
    // fresh queue rather than jamming every future recording's analysis forever. Every read
    // or write of this property goes through analysisQueueLock.
    private static var analysisQueue = DispatchQueue(label: "com.forge.avbodytracking.analysis")
    private static let analysisQueueLock = NSLock()
    private var analysisBackgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    // Checked once per frame inside runPoseAnalysis's while loop -- real cancellation, not
    // just the JS side hiding its own spinner while the native loop keeps running to
    // completion regardless. Reset at the start of every new analyzeRecording call so a
    // stale cancellation from a previous (already-finished) analysis can't immediately
    // abort the next one. NOTE: this flag alone can't interrupt a hang that happens BEFORE
    // the loop starts (asset loading, AVAssetReader init/startReading) -- see
    // currentAnalysisCancelNow below for the mechanism that actually covers that case.
    private var analysisCancelled = false
    // Lets cancelAnalysis() force the CURRENTLY PENDING analyzeRecording call to fail
    // immediately, instead of only setting analysisCancelled above (which runPoseAnalysis
    // only checks once its read loop has already started) and otherwise leaving the JS side's
    // "Analyzing recording" spinner waiting on a promise that won't resolve until the
    // watchdog's own much longer timeout. Set at the start of every analyzeRecording call,
    // cleared (via settle's own guard, see there) the moment that call actually finishes one
    // way or another.
    private var currentAnalysisCancelNow: (() -> Void)?

    // Phase 5: object/implement tracking (bar path, thrown ball) -- see AvImplementTracker's
    // own comment for why this runs entirely in pixel space with no live meters conversion,
    // unlike ArImplementTracker.swift's ARKit port. One CIContext shared across the whole
    // analysis run (Apple's own guidance: expensive to create, cheap to reuse) rather than one
    // per frame. Left/right are independent instances, same one-tracker-per-hand pattern
    // ArCameraPreviewPlugin.swift's own leftImplementTracker/rightImplementTracker already
    // establish -- a caller tracking a single implement (a thrown medicine ball, not a
    // two-handed bar) just uses the left instance alone and ignores the right.
    private let implementCIContext = CIContext(options: [.useSoftwareRenderer: false])
    private var leftImplementTracker = AvImplementTracker()
    private var rightImplementTracker = AvImplementTracker()
    // Med-ball throws only (see analyzeRecording's trackingMode param) --
    // additive alongside the motion-diff trackers above, not a replacement.
    // See AvCoreMlImplementDetector's own header comment.
    private var coreMlImplementDetector = AvCoreMlImplementDetector()
    private var cameraStabilizer = AvCameraStabilizer()

    // The public, documented Vision joint names this plugin reports -- unlike ARKit's own
    // joint-name strings (which needed on-device discovery to nail down, per
    // ArCameraPreviewPlugin.swift's own comment), these are Apple's own documented
    // VNHumanBodyPoseObservation.JointName constants, mapped to plain camelCase strings for
    // the JS bridge. ~19 joints, no hands/face detail -- matches the plan's own accounting.
    private static let bodyPoseJoints: [(VNHumanBodyPoseObservation.JointName, String)] = [
        (.nose, "nose"), (.leftEye, "leftEye"), (.rightEye, "rightEye"),
        (.leftEar, "leftEar"), (.rightEar, "rightEar"), (.neck, "neck"),
        (.leftShoulder, "leftShoulder"), (.rightShoulder, "rightShoulder"),
        (.leftElbow, "leftElbow"), (.rightElbow, "rightElbow"),
        (.leftWrist, "leftWrist"), (.rightWrist, "rightWrist"),
        (.root, "root"), (.leftHip, "leftHip"), (.rightHip, "rightHip"),
        (.leftKnee, "leftKnee"), (.rightKnee, "rightKnee"),
        (.leftAnkle, "leftAnkle"), (.rightAnkle, "rightAnkle"),
    ]

    // Apple's own documented VNHumanHandPoseObservation.JointName constants -- 21 per hand
    // (wrist + 4 joints on each of 5 fingers), the direct Vision equivalent of MediaPipe's own
    // Hand Landmarker (see hand-tracking.ts on the Android/web side). Grip-point refinement is
    // the only consumer today (see vision-body-landmarks.ts's visionRefineGripSeed) -- this
    // table intentionally mirrors bodyPoseJoints' own shape/style rather than inventing a
    // different convention for a second joint set.
    private static let handPoseJoints: [(VNHumanHandPoseObservation.JointName, String)] = [
        (.wrist, "wrist"),
        (.thumbCMC, "thumbCMC"), (.thumbMP, "thumbMP"), (.thumbIP, "thumbIP"), (.thumbTip, "thumbTip"),
        (.indexMCP, "indexMCP"), (.indexPIP, "indexPIP"), (.indexDIP, "indexDIP"), (.indexTip, "indexTip"),
        (.middleMCP, "middleMCP"), (.middlePIP, "middlePIP"), (.middleDIP, "middleDIP"), (.middleTip, "middleTip"),
        (.ringMCP, "ringMCP"), (.ringPIP, "ringPIP"), (.ringDIP, "ringDIP"), (.ringTip, "ringTip"),
        (.littleMCP, "littleMCP"), (.littlePIP, "littlePIP"), (.littleDIP, "littleDIP"), (.littleTip, "littleTip"),
    ]

    // Phase B: VNHumanBodyPose3DObservation.JointName constants (iOS 17+), same mapped-to-plain-
    // camelCase-string shape as bodyPoseJoints/handPoseJoints above. 17 joints total -- 12 have a
    // direct bodyPoseJoints equivalent (both APIs share the same left/right shoulder/elbow/wrist/
    // hip/knee/ankle vocabulary -- confirmed against Apple's own published JointName case pages,
    // not guessed from the 2D table), plus root (also shared with the 2D table) and four
    // 3D-only joints with no 2D equivalent: centerHead, topHead, centerShoulder, spine.
    // #available-gated at the property itself (a computed static, evaluated once on first
    // access) rather than gating every call site individually -- runPoseAnalysis's own
    // body3DRequest local reads the SAME guard pattern to decide whether to build the request at
    // all, so a pre-iOS-17 device simply never touches this table.
    @available(iOS 17.0, *)
    private static let body3DPoseJoints: [(VNHumanBodyPose3DObservation.JointName, String)] = [
        (.centerHead, "centerHead"), (.topHead, "topHead"), (.centerShoulder, "centerShoulder"),
        (.spine, "spine"), (.root, "root"),
        (.leftShoulder, "leftShoulder"), (.rightShoulder, "rightShoulder"),
        (.leftElbow, "leftElbow"), (.rightElbow, "rightElbow"),
        (.leftWrist, "leftWrist"), (.rightWrist, "rightWrist"),
        (.leftHip, "leftHip"), (.rightHip, "rightHip"),
        (.leftKnee, "leftKnee"), (.rightKnee, "rightKnee"),
        (.leftAnkle, "leftAnkle"), (.rightAnkle, "rightAnkle"),
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        call.resolve([
            // Any built-in camera at all -- unlike ARBodyTrackingConfiguration.isSupported
            // (TrueDepth-front-camera-gated on some devices), a plain AVCaptureSession works
            // with any lens, so "supported" here just means "does this device have a camera."
            "supported": AVCaptureDevice.default(for: .video) != nil,
            "cameraPermission": authorizationStatusString(status),
        ])
    }

    private func authorizationStatusString(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    // Standalone isolation test, same purpose as ArCameraPreviewPlugin's own
    // requestCameraPermission -- proves the permission prompt itself fires, independent of
    // start()'s own session/view setup.
    @objc func requestCameraPermission(_ call: CAPPluginCall) {
        logDiag("requestCameraPermission() called")
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                self.logDiag("requestCameraPermission result: \(granted ? "granted" : "denied")")
                call.resolve(["granted": granted])
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        diagLogBuffer.removeAll()
        logDiag("start() called")
        purgeStaleRecordings()

        // Explicit authorizationStatus handling -- ARKit's ARSession absorbed this
        // complexity internally; a bare AVCaptureSession doesn't, so this plugin owns
        // telling the JS side clearly (a "sessionError" event, not a silently blank
        // preview) whenever access was already denied rather than merely undetermined.
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        logDiag("authorizationStatus=\(status.rawValue)")
        switch status {
        case .authorized:
            continueStart(call)
        case .notDetermined:
            logDiag("requesting camera permission...")
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    self.logDiag("permission result: \(granted ? "granted" : "denied")")
                    guard granted else {
                        self.notifyListeners("sessionError", data: ["message": "Camera access denied"])
                        call.reject("Camera access denied -- enable it in Settings > Forge > Camera")
                        return
                    }
                    self.continueStart(call)
                }
            }
        case .denied, .restricted:
            logDiag("FAILED: camera permission previously denied/restricted")
            let message = "Camera access denied -- enable it in Settings > Forge > Camera"
            notifyListeners("sessionError", data: ["message": message])
            call.reject(message)
        @unknown default:
            logDiag("FAILED: unknown authorization status")
            call.reject("Unknown camera authorization status")
        }
    }

    private func continueStart(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.logDiag("continueStart() running")
            let device = UIDevice.current
            self.logDiag("device model=\(device.model) systemVersion=\(device.systemVersion)")
            guard let webView = self.bridge?.webView, let container = webView.superview else {
                self.logDiag("FAILED: bridge webView/superview not available")
                call.reject("Bridge WebView is not available")
                return
            }

            let rect = self.rectFromCall(call)
            self.logDiag("rect: \(rect)")

            let lensPreference = call.getString("lens") ?? "wide"
            guard let captureDevice = self.pickCaptureDevice(preferring: lensPreference) else {
                self.logDiag("FAILED: no capture device available")
                call.reject("No camera device available")
                return
            }
            self.logDiag("using lens: \(self.lensId(for: captureDevice.deviceType))")

            // A fresh session every start() call, not a reuse branch -- unlike
            // ArCameraPreviewPlugin's ARSCNView (heavier, more stateful), an AVCaptureSession
            // is cheap to recreate, and stop() below always fully tears the previous one down.
            let session = AVCaptureSession()
            // This session only ever gets a video input (see addInput below) -- no
            // microphone, movieOutput records picture only. Left at its default of true,
            // AVFoundation still claims the shared AVAudioSession the moment the session
            // starts running (category .playAndRecord), which interrupts/stops whatever
            // audio the athlete had playing (e.g. their own music) even though this
            // session never touches audio. false tells it to leave the audio session alone.
            session.automaticallyConfiguresApplicationAudioSession = false
            // "Leave it alone" above turned out to be incomplete: it only stops THIS session
            // from actively grabbing .playAndRecord -- it does nothing about whatever category
            // the shared AVAudioSession is ALREADY sitting in, which for an app that has never
            // explicitly configured one is .soloAmbient, the one category that silences other
            // apps' audio the instant anything (this capture session starting, a Web Audio
            // AudioContext elsewhere in the WebView -- see audio-cues.ts's own comment on why
            // that goes through this exact same shared session) makes the app's audio active.
            // Reported still cutting out specifically at the save/upload step, after recording
            // itself had already been fixed -- consistent with .soloAmbient being the thing
            // that bites, not this session's own config, since nothing anywhere in this app had
            // ever explicitly asked for a mixable category. .ambient + .mixWithOthers is the
            // standard fix for "this app's audio (native or web) should coexist with whatever
            // else is already playing, never silence it" -- set once here, early, and left
            // active (never setActive(false)'d back off) so nothing later in the flow can fall
            // back to the default non-mixing category.
            do {
                try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
                try AVAudioSession.sharedInstance().setActive(true, options: [])
                self.logDiag("audio session set to .ambient/.mixWithOthers")
            } catch {
                self.logDiag("WARNING: failed to configure audio session: \(error.localizedDescription)")
            }
            session.beginConfiguration()
            if session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            }

            do {
                let input = try AVCaptureDeviceInput(device: captureDevice)
                guard session.canAddInput(input) else {
                    self.logDiag("FAILED: cannot add camera input")
                    session.commitConfiguration()
                    call.reject("Cannot add camera input")
                    return
                }
                session.addInput(input)
                self.currentInput = input
            } catch {
                self.logDiag("FAILED: AVCaptureDeviceInput error: \(error.localizedDescription)")
                session.commitConfiguration()
                call.reject("Failed to open camera: \(error.localizedDescription)")
                return
            }

            let movieOutput = AVCaptureMovieFileOutput()
            if session.canAddOutput(movieOutput) {
                session.addOutput(movieOutput)
                self.movieOutput = movieOutput
            } else {
                self.logDiag("WARNING: cannot add movie output -- recording unavailable")
            }

            session.commitConfiguration()
            self.session = session
            NotificationCenter.default.addObserver(
                self, selector: #selector(self.handleRuntimeError(_:)),
                name: .AVCaptureSessionRuntimeError, object: session
            )

            self.applyHighestFrameRate(to: captureDevice)
            self.applyContinuousFocusAndExposure(to: captureDevice)

            if self.previewLayerView != nil {
                self.logDiag("WARNING: previewLayerView already existed at start() -- removing stale view")
                self.previewLayerView?.removeFromSuperview()
                self.previewLayerView = nil
                self.previewLayer = nil
            }
            let layerView = UIView(frame: rect)
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = layerView.bounds
            if let connection = layer.connection, connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
            layerView.layer.addSublayer(layer)
            container.insertSubview(layerView, belowSubview: webView)
            self.previewLayerView = layerView
            self.previewLayer = layer
            self.logDiag("created preview layer, inserted behind webView")

            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear

            Self.sessionQueue.async {
                session.startRunning()
                DispatchQueue.main.async {
                    self.logDiag("session.startRunning() returned, resolving")
                    self.startTelemetryTimer(for: captureDevice)
                    call.resolve()
                }
            }
        }
    }

    @objc private func handleRuntimeError(_ notification: Notification) {
        let message = (notification.userInfo?[AVCaptureSessionErrorKey] as? NSError)?.localizedDescription
            ?? "Unknown capture session error"
        logDiag("AVCaptureSessionRuntimeError: \(message)")
        notifyListeners("sessionError", data: ["message": message])
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.telemetryTimer?.invalidate()
            self.telemetryTimer = nil
            if let movieOutput = self.movieOutput, movieOutput.isRecording {
                movieOutput.stopRecording()
            }
            self.recordingCall = nil
            if let session = self.session {
                NotificationCenter.default.removeObserver(self, name: .AVCaptureSessionRuntimeError, object: session)
                Self.sessionQueue.async {
                    session.stopRunning()
                }
            }
            self.previewLayerView?.removeFromSuperview()
            self.previewLayerView = nil
            self.previewLayer = nil
            self.session = nil
            self.currentInput = nil
            self.movieOutput = nil
            call.resolve()
        }
    }

    @objc func updateRect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let rect = self.rectFromCall(call)
            self.previewLayerView?.frame = rect
            self.previewLayer?.frame = self.previewLayerView?.bounds ?? rect
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

    // MARK: - Lens enumeration/selection

    private func availableCameraDevices() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInUltraWideCamera, .builtInWideAngleCamera, .builtInTelephotoCamera],
            mediaType: .video,
            position: .back
        ).devices
    }

    // Short, stable ids independent of AVCaptureDevice.DeviceType's raw string -- listLenses
    // and selectLens/start (lensPreference) both key on these, so the JS side never has to
    // know or care about Apple's actual device-type constant strings.
    private func lensId(for type: AVCaptureDevice.DeviceType) -> String {
        switch type {
        case .builtInUltraWideCamera: return "ultraWide"
        case .builtInTelephotoCamera: return "telephoto"
        default: return "wide"
        }
    }

    private func lensLabel(for type: AVCaptureDevice.DeviceType) -> String {
        switch type {
        case .builtInUltraWideCamera: return "Ultra Wide"
        case .builtInTelephotoCamera: return "Telephoto"
        default: return "Wide"
        }
    }

    @objc func listLenses(_ call: CAPPluginCall) {
        let lenses = availableCameraDevices().map { device -> [String: Any] in
            [
                "id": lensId(for: device.deviceType),
                "label": lensLabel(for: device.deviceType),
                "minZoom": Double(device.minAvailableVideoZoomFactor),
                "maxZoom": Double(device.maxAvailableVideoZoomFactor),
            ]
        }
        call.resolve(["lenses": lenses])
    }

    private func pickCaptureDevice(preferring lens: String) -> AVCaptureDevice? {
        let devices = availableCameraDevices()
        if let match = devices.first(where: { lensId(for: $0.deviceType) == lens }) {
            return match
        }
        // Fall back to whatever's actually available rather than failing outright -- e.g. an
        // iPhone with no telephoto lens should still be able to open the camera at all.
        return devices.first ?? AVCaptureDevice.default(for: .video)
    }

    @objc func selectLens(_ call: CAPPluginCall) {
        guard let session = self.session else {
            call.reject("Camera not started")
            return
        }
        guard let lens = call.getString("lens") else {
            call.reject("Missing lens")
            return
        }
        guard let newDevice = pickCaptureDevice(preferring: lens) else {
            call.reject("No matching camera device")
            return
        }
        DispatchQueue.main.async {
            session.beginConfiguration()
            if let oldInput = self.currentInput {
                session.removeInput(oldInput)
            }
            do {
                let newInput = try AVCaptureDeviceInput(device: newDevice)
                guard session.canAddInput(newInput) else {
                    session.commitConfiguration()
                    self.logDiag("FAILED: cannot switch to lens \(lens)")
                    call.reject("Cannot switch to that lens")
                    return
                }
                session.addInput(newInput)
                self.currentInput = newInput
                session.commitConfiguration()
                self.applyHighestFrameRate(to: newDevice)
                self.applyContinuousFocusAndExposure(to: newDevice)
                // The running timer closes over the old device -- restart it against newDevice
                // or the telemetry log would keep reporting the lens we just switched away from.
                self.startTelemetryTimer(for: newDevice)
                self.logDiag("switched lens to \(self.lensId(for: newDevice.deviceType))")
                call.resolve()
            } catch {
                session.commitConfiguration()
                self.logDiag("FAILED: lens switch error: \(error.localizedDescription)")
                call.reject("Failed to switch lens: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Zoom / focus ("their quality functions")

    @objc func setZoom(_ call: CAPPluginCall) {
        guard let device = currentInput?.device else {
            call.reject("Camera not started")
            return
        }
        guard let rawFactor = call.getDouble("factor") else {
            call.reject("Missing factor")
            return
        }
        let factor = CGFloat(rawFactor)
        let clamped = max(device.minAvailableVideoZoomFactor, min(factor, device.maxAvailableVideoZoomFactor))
        do {
            try device.lockForConfiguration()
            // Ramped, not snapped -- an instant jump reads as a jarring jump-cut on the
            // preview; a real camera app's zoom always eases toward the target.
            device.ramp(toVideoZoomFactor: clamped, withRate: 4.0)
            device.unlockForConfiguration()
            call.resolve(["appliedFactor": Double(clamped)])
        } catch {
            call.reject("Failed to set zoom: \(error.localizedDescription)")
        }
    }

    // Tap-to-focus/expose at a normalized (0-1, top-left origin) point -- the standard
    // AVFoundation pattern, one of the "quality functions" ARKit's own ARSession never
    // exposed control over at all.
    @objc func setFocusPoint(_ call: CAPPluginCall) {
        guard let device = currentInput?.device else {
            call.reject("Camera not started")
            return
        }
        guard let x = call.getDouble("x"), let y = call.getDouble("y") else {
            call.reject("Missing x/y")
            return
        }
        let point = CGPoint(x: x, y: y)
        do {
            try device.lockForConfiguration()
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = point
                if device.isFocusModeSupported(.autoFocus) {
                    device.focusMode = .autoFocus
                }
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = point
                if device.isExposureModeSupported(.autoExpose) {
                    device.exposureMode = .autoExpose
                }
            }
            device.unlockForConfiguration()
            logDiag("focus point set to (\(x), \(y))")
            call.resolve()
        } catch {
            call.reject("Failed to set focus point: \(error.localizedDescription)")
        }
    }

    // Formats above this are the slow-motion-oriented end of a device's range (240fps and
    // similar) -- continuous autofocus is well documented to struggle to converge, or stop
    // converging altogether, at those frame rates on iPhone hardware, and some of those formats
    // use a reduced-quality/binned sensor readout that looks soft even genuinely in focus. This
    // is exactly what testing hit: applyContinuousFocusAndExposure below correctly reported
    // focus/exposure both set to continuous mode, yet the picture stayed persistently blurred --
    // the mode was on, but not actually working at the 240fps format this function had greedily
    // picked. 120fps is still a large motion-blur improvement over a device's un-tuned default
    // (~30fps) while staying well inside the range every iPhone rear camera keeps full,
    // functional continuous AF/AE at.
    private let maxUsableFrameRate: Double = 120

    // The other half of the tradeoff maxUsableFrameRate's comment describes. On-device telemetry
    // (lens=0.78, adjustingFocus=false on every sample -- AF genuinely settled, not hunting or
    // stuck at macro) proved focus/exposure were never the cause of the persistent on-screen
    // blur -- the real cause sits upstream of AF entirely. Every iPhone format that clears
    // 120fps is capped at 1920x1080, and AVCaptureVideoPreviewLayer's resizeAspectFill then has
    // to upscale that buffer roughly 25-30% to cover a modern iPhone's actual portrait pixel
    // count -- a soft, uniform blur baked into every frame regardless of focus, exactly what was
    // reported. Requiring only 60fps (still double the ~30fps hardware default -- a real
    // motion-blur win) instead of maximizing fps outright is what unlocks a device's much
    // higher-resolution formats below.
    private let minAcceptableFrameRate: Double = 60

    // Explicit, not left to the session preset's default -- the exact lesson
    // ArCameraPreviewPlugin.swift's own comment already documents (a fast movement blurs
    // measurably worse at a conservative default capture rate). Restricted to formats at
    // least matching the 1080p session preset -- an unfiltered search can land on a tiny
    // low-res slow-motion format (some devices offer very high fps at a fraction of full
    // resolution), which would quietly undo the resolution pose detection actually needs.
    private func applyHighestFrameRate(to device: AVCaptureDevice) {
        let eligibleFormats = device.formats.filter { format in
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard dims.width >= 1920 && dims.height >= 1080 else { return false }
            // Needs a range whose own top speed lands inside [60, 120] -- not just >= 60. A
            // format whose only qualifying range tops out above maxUsableFrameRate (e.g. a
            // single 1-240fps range) would otherwise pass this check but then get excluded
            // entirely by the <= maxUsableFrameRate filter below, leaving activeFormat unset.
            return format.videoSupportedFrameRateRanges.contains {
                $0.maxFrameRate >= minAcceptableFrameRate && $0.maxFrameRate <= maxUsableFrameRate
            }
        }
        let candidates = eligibleFormats.isEmpty ? device.formats : eligibleFormats
        // "Best" now means highest RESOLUTION among formats that clear minAcceptableFrameRate --
        // see this function's and minAcceptableFrameRate's own comments for why resolution, not
        // fps, is the dimension actually worth maximizing here. usableMaxFps clamps each format's
        // own highest range to the ceiling, used only as a tiebreaker between two formats that
        // happen to offer the same pixel count.
        func usableMaxFps(_ format: AVCaptureDevice.Format) -> Double {
            format.videoSupportedFrameRateRanges
                .map { $0.maxFrameRate }
                .filter { $0 <= maxUsableFrameRate }
                .max() ?? 0
        }
        func pixelCount(_ format: AVCaptureDevice.Format) -> Int64 {
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return Int64(dims.width) * Int64(dims.height)
        }
        guard let bestFormat = candidates.max(by: { a, b in
            let pxA = pixelCount(a), pxB = pixelCount(b)
            if pxA != pxB { return pxA < pxB }
            return usableMaxFps(a) < usableMaxFps(b)
        }) else { return }
        guard
            let bestRange = bestFormat.videoSupportedFrameRateRanges
                .filter({ $0.maxFrameRate <= maxUsableFrameRate })
                .max(by: { $0.maxFrameRate < $1.maxFrameRate })
        else {
            return
        }
        do {
            try device.lockForConfiguration()
            device.activeFormat = bestFormat
            device.activeVideoMinFrameDuration = bestRange.minFrameDuration
            device.activeVideoMaxFrameDuration = bestRange.minFrameDuration
            device.unlockForConfiguration()
            let dims = CMVideoFormatDescriptionGetDimensions(bestFormat.formatDescription)
            logDiag("activeFormat set: \(dims.width)x\(dims.height) @ up to \(bestRange.maxFrameRate)fps")
        } catch {
            logDiag("WARNING: failed to set highest frame rate: \(error.localizedDescription)")
        }
    }

    // Never set anywhere else in this file -- setFocusPoint's .autoFocus/.autoExpose are a
    // one-shot tap-to-focus response, not the default running state, so without this call a
    // fresh AVCaptureDevice is left at whatever focus/exposure mode it happened to power on
    // with. That's usually continuous already, EXCEPT right after applyHighestFrameRate above
    // changes activeFormat: some formats (especially high-fps ones near the top of a device's
    // range) don't support continuous AF/AE at all, and switching activeFormat can silently drop
    // the device out of continuous mode even on formats that do -- exactly the persistent,
    // uniform out-of-focus blur reported in testing (present under the old ARKit pipeline too,
    // which independently hit the same "pick the fastest format, never re-affirm continuous
    // focus after" gap). Called AFTER applyHighestFrameRate, not before, since it's the format
    // change that can invalidate this -- setting it first would just get silently reset.
    private func applyContinuousFocusAndExposure(to device: AVCaptureDevice) {
        do {
            try device.lockForConfiguration()
            if device.isFocusModeSupported(.continuousAutoFocus) {
                device.focusMode = .continuousAutoFocus
            } else if device.isFocusModeSupported(.autoFocus) {
                // Some high-fps formats only support one-shot autofocus -- better to refocus
                // once at the current distance than stay locked wherever the device woke up.
                device.focusMode = .autoFocus
            }
            if device.isExposureModeSupported(.continuousAutoExposure) {
                device.exposureMode = .continuousAutoExposure
            }
            device.unlockForConfiguration()
            logDiag("focus/exposure mode set: focus=\(device.focusMode.rawValue) exposure=\(device.exposureMode.rawValue)")
        } catch {
            logDiag("WARNING: failed to set continuous focus/exposure: \(error.localizedDescription)")
        }
    }

    // MARK: - Recording (record-first, analyze-later -- see file comment)

    @objc func startRecording(_ call: CAPPluginCall) {
        guard let movieOutput = self.movieOutput else {
            call.reject("Recording not available")
            return
        }
        guard !movieOutput.isRecording else {
            call.reject("Already recording")
            return
        }
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("av-\(UUID().uuidString)")
            .appendingPathExtension("mov")
        DispatchQueue.main.async {
            movieOutput.startRecording(to: outputURL, recordingDelegate: self)
            self.logDiag("startRecording -> \(outputURL.lastPathComponent)")
            call.resolve()
        }
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        guard let movieOutput = self.movieOutput, movieOutput.isRecording else {
            call.reject("Not recording")
            return
        }
        // Resolved from fileOutput(_:didFinishRecordingTo:...) once the file is actually
        // finalized on disk -- AVCaptureMovieFileOutput writes/closes the container
        // asynchronously, so resolving immediately here could hand JS a path that isn't
        // readable yet.
        self.recordingCall = call
        // Background-execution edge case: a coach can lock the phone the instant after
        // tapping stop, and iOS suspends backgrounded apps within seconds -- wrapping this in
        // an explicit background task requests the OS time to actually finish finalizing the
        // movie container instead of dying mid-write.
        self.backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "AvBodyTrackingFinalize") { [weak self] in
            guard let self = self else { return }
            UIApplication.shared.endBackgroundTask(self.backgroundTaskID)
            self.backgroundTaskID = .invalid
        }
        movieOutput.stopRecording()
    }

    public func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        if backgroundTaskID != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskID)
            backgroundTaskID = .invalid
        }
        guard let call = recordingCall else { return }
        recordingCall = nil
        if let error = error {
            logDiag("recording finished with error: \(error.localizedDescription)")
            call.reject("Recording failed: \(error.localizedDescription)")
            return
        }
        logDiag("recording finished: \(outputFileURL.lastPathComponent)")
        call.resolve(["path": outputFileURL.path])
    }

    // Local-storage-bloat edge case: 60/120fps at 1080p+ writes large files fast enough that
    // a single team's testing day could fill a 64GB device. Called explicitly by the JS side
    // the moment it's read a clip into memory (mirrors ArCameraPreviewPlugin's
    // stopArRecording -> Filesystem.readFile flow in native-ar-preview.ts) -- deletion isn't
    // left to a background cleanup job that might not run in time.
    @objc func deleteRecording(_ call: CAPPluginCall) {
        guard let pathString = call.getString("path") else {
            call.reject("Missing path")
            return
        }
        try? FileManager.default.removeItem(atPath: pathString)
        logDiag("deleted recording at \(pathString)")
        call.resolve()
    }

    // MARK: - Phase 2: Vision body-pose detection (offline, against the recorded clip)

    // Reads the clip via AVAssetReader (not a live sample-buffer delegate -- see file
    // comment), runs VNDetectHumanBodyPoseRequest per frame, and emits one "poseFrame" event
    // per processed frame as it's produced -- a "simulated-realtime" stream the JS side
    // consumes the exact same way it would a live one, even though this runs entirely after
    // recording already stopped. sampleEveryNthFrame defaults to 1 (every frame) -- Phase 2's
    // own job is finding out, on real hardware, whether that's fast enough during a rest
    // period or needs downsampling; not assumed either way here.
    @objc func analyzeRecording(_ call: CAPPluginCall) {
        guard let pathString = call.getString("path") else {
            call.reject("Missing path")
            return
        }
        let sampleEveryNthFrame = max(1, call.getInt("sampleEveryNthFrame") ?? 1)
        // Box jump only (see this file's own comment on detectBoxTop below) -- every other AV
        // dialog omits this and pays nothing extra per frame.
        let detectBox = call.getBool("detectBox") ?? false
        // Gates the additive CoreML implement detector below -- one of
        // AvCoreMlImplementDetector.supportedTrackingModes (the object class the caller is
        // actually trying to track, e.g. "med_ball" from AvMedBallTrackerDialog or "barbell"/
        // "dumbbell"/"kettlebell" from AvBarTrackerDialog, mapped straight from that dialog's own
        // `equipment` prop) or nil/anything else, which just means "not enabled." See
        // AvCoreMlImplementDetector's own header comment.
        let trackingMode = call.getString("trackingMode")
        let url = URL(fileURLWithPath: pathString)
        logDiag(
            "analyzeRecording() called for \(url.lastPathComponent), sampleEveryNthFrame=\(sampleEveryNthFrame), "
                + "detectBox=\(detectBox), trackingMode=\(trackingMode ?? "none")"
        )
        analysisCancelled = false
        leftImplementTracker.reset()
        rightImplementTracker.reset()
        coreMlImplementDetector.reset()
        cameraStabilizer.reset()

        // Confirmed against a real field report: AVAssetReader/Vision setup can hang
        // indefinitely before runPoseAnalysis's read loop even starts (stuck at "0 frames
        // processed" forever) -- a point analysisCancelled can't reach (it's only checked
        // INSIDE that loop). Because analysisQueue is a single serial queue, that same hang
        // then silently blocked a completely fresh second recording's analysis too, since its
        // call just sat queued behind the still-stuck first one. settle(...) below is the one
        // place either a real result (from runPoseAnalysis), a user-initiated cancel (see
        // cancelAnalysis), or this watchdog resolves the call -- whichever gets there first
        // wins, guarded by a lock so only one of them actually fires.
        let settleLock = NSLock()
        var settled = false
        func settle(_ finish: @escaping () -> Void) {
            settleLock.lock()
            let alreadySettled = settled
            settled = true
            settleLock.unlock()
            guard !alreadySettled else { return }
            self.currentAnalysisCancelNow = nil
            finish()
        }
        currentAnalysisCancelNow = {
            settle { DispatchQueue.main.async { call.reject("Analysis cancelled") } }
        }

        Self.analysisQueueLock.lock()
        let queueForThisCall = Self.analysisQueue
        Self.analysisQueueLock.unlock()

        // Runs on a separate queue from analysisQueue on purpose -- if analysisQueue itself is
        // what's stuck, a watchdog scheduled on that same queue would never get a turn to run
        // either. On timeout, replaces analysisQueue with a fresh instance (only if nothing
        // else already has) so every future call stops queueing up behind whatever's still
        // wedged -- if that original call ever does finish on its own, it just finishes
        // uselessly on the now-abandoned queue; nothing is still listening for its result.
        //
        // Continuous stall detection, not two fixed checkpoints -- the original single 120s
        // timer (then a two-checkpoint 15s/60s version, see git history) both shared the same
        // real gap: neither could tell "stuck since the start" apart from "made some progress,
        // then stalled partway through" without either firing too early on a genuinely slow
        // clip or too late on a real hang. re-checking on a short interval for however long the
        // analysis runs answers the only question that actually matters -- has ANY progress
        // happened recently -- the same way regardless of whether that's frame 0 or frame 400.
        // This can't "nudge" a truly stuck native call into finishing (there's no safe way to
        // force a blocked system call to make progress from another thread) -- it can only
        // detect the stall faster and give up sooner, which is the most a watchdog can ever do.
        let stallTimeoutSeconds = 15.0
        let checkIntervalSeconds = 3.0
        let progress = AvAnalysisProgress()

        let fireWatchdog: (String) -> Void = { [weak self] reason in
            settle {
                self?.logDiag(
                    "analyzeRecording WATCHDOG fired (\(reason)) with \(progress.snapshot()) frames processed -- "
                        + "forcing failure and replacing analysisQueue so future calls aren't stuck behind this one"
                )
                self?.analysisCancelled = true
                Self.analysisQueueLock.lock()
                if Self.analysisQueue === queueForThisCall {
                    Self.analysisQueue = DispatchQueue(label: "com.forge.avbodytracking.analysis")
                }
                Self.analysisQueueLock.unlock()
                DispatchQueue.main.async { call.reject("Analysis timed out") }
            }
        }

        // DispatchQueue has no built-in repeating asyncAfter, so this reschedules itself --
        // stops as soon as `settled` is true (the call already resolved, whether by success, a
        // user cancel, or this same watchdog already having fired) rather than polling forever
        // for the lifetime of the app.
        func scheduleStallCheck() {
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + checkIntervalSeconds) {
                settleLock.lock()
                let alreadySettled = settled
                settleLock.unlock()
                if alreadySettled { return }
                let idleSeconds = progress.secondsSinceLastProgress()
                if idleSeconds >= stallTimeoutSeconds {
                    fireWatchdog("no progress for \(Int(idleSeconds))s")
                    return
                }
                scheduleStallCheck()
            }
        }
        scheduleStallCheck()

        queueForThisCall.async {
            self.runPoseAnalysis(
                url: url, sampleEveryNthFrame: sampleEveryNthFrame, detectBox: detectBox,
                trackingMode: trackingMode, call: call, progress: progress, settle: settle
            )
        }
    }

    // A slow take on an older device is exactly the case Phase 1's own record-first design
    // was meant to protect against thermally, but nothing protected the athlete/coach from
    // just having to wait on a stuck-feeling analysis with no way out -- this gives them one.
    // analysisCancelled covers the common case (the read loop is already running and checks it
    // every iteration); currentAnalysisCancelNow additionally covers a hang before that loop
    // even starts, forcing the pending call to fail right away instead of leaving the JS
    // side's spinner waiting up to analyzeRecording's own much longer watchdog timeout.
    @objc func cancelAnalysis(_ call: CAPPluginCall) {
        analysisCancelled = true
        logDiag("cancelAnalysis() called")
        currentAnalysisCancelNow?()
        currentAnalysisCancelNow = nil
        call.resolve()
    }

    // Runs on the queue analyzeRecording dispatched onto, NOT the main thread -- AVAssetReader's
    // copyNextSampleBuffer and Vision's synchronous perform() are both blocking calls,
    // potentially for seconds across a whole clip, and nothing here touches UI directly
    // (notifyListeners/call.resolve are dispatched to main explicitly where it matters). Every
    // exit point below goes through the passed-in settle(...) instead of calling
    // call.resolve/call.reject directly -- see analyzeRecording's own comment on why (a
    // watchdog or a user-initiated cancel might already have settled this call first).
    private func runPoseAnalysis(
        url: URL, sampleEveryNthFrame: Int, detectBox: Bool, trackingMode: String?, call: CAPPluginCall,
        progress: AvAnalysisProgress,
        settle: @escaping (@escaping () -> Void) -> Void
    ) {
        // (AvAnalysisProgress itself is defined near the bottom of this file, alongside
        // AvCoreMlImplementDetector and the other small per-call helper types.)
        let coreMlTargetLabel = AvCoreMlImplementDetector.targetLabel(forTrackingMode: trackingMode)
        let coreMlDetectionEnabled = coreMlTargetLabel != nil && coreMlImplementDetector.isAvailable
        // Background-execution edge case, same as stopRecording's finalize step -- a coach
        // backgrounding the app to check something mid-analysis shouldn't kill this partway
        // through a clip.
        let taskID = UIApplication.shared.beginBackgroundTask(withName: "AvBodyTrackingAnalyze") { [weak self] in
            guard let self = self else { return }
            UIApplication.shared.endBackgroundTask(self.analysisBackgroundTaskID)
            self.analysisBackgroundTaskID = .invalid
        }
        analysisBackgroundTaskID = taskID
        defer {
            if analysisBackgroundTaskID != .invalid {
                UIApplication.shared.endBackgroundTask(analysisBackgroundTaskID)
                analysisBackgroundTaskID = .invalid
            }
        }

        let asset = AVAsset(url: url)
        guard let track = asset.tracks(withMediaType: .video).first else {
            logDiag("analyzeRecording FAILED: no video track in \(url.lastPathComponent)")
            settle { DispatchQueue.main.async { call.reject("No video track in recording") } }
            return
        }
        // AVAssetReader hands back pixel buffers in their raw stored orientation -- it does
        // NOT apply the track's own preferredTransform for you (unlike AVPlayer, which does).
        // Deriving the correct CGImagePropertyOrientation from that transform directly is
        // robust regardless of what orientation the camera connection was actually recording
        // in, rather than assuming Phase 1's setup got it right.
        let orientation = cgOrientation(for: track.preferredTransform)

        // Diagnostic only, not used to drive anything below -- what the asset's own metadata
        // claims this clip's total length is, independent of how many frames the read loop
        // below actually gets through. Reported alongside frameCount/trackedFrameCount so a
        // clip where these two numbers disagree sharply (e.g. a 20s asset but the loop only
        // processes 2s worth of frames) is visible in the persisted diagnostics instead of
        // silently indistinguishable from "the athlete's take was genuinely short" -- exactly
        // the ambiguity real box-squat testing hit (a recording confirmed long in person, but
        // only ~2s/68 frames ever got analyzed, with nothing in the numbers alone to tell
        // "short recording" apart from "analysis loop stopped early").
        let assetDurationSeconds = CMTimeGetSeconds(asset.duration)

        guard let reader = try? AVAssetReader(asset: asset) else {
            logDiag("analyzeRecording FAILED: could not create AVAssetReader")
            settle { DispatchQueue.main.async { call.reject("Could not read recording") } }
            return
        }
        // AVAssetReaderTrackOutput decodes and buffers EVERY frame in the track at whatever
        // size outputSettings requests -- sampleEveryNthFrame's stride check (in the read loop
        // below) only decides which of those already-decoded frames get analyzed, not which
        // ones get decoded in the first place. On a 3840x2160@60fps clip run 25+ seconds, that's
        // well over a thousand full-resolution (~33MB each, uncompressed BGRA) frames pushed
        // through decode + buffer-pool churn even though only a small fraction are ever sampled
        // -- a plausible trigger for the AVFoundationErrorDomain -11819 "Cannot Complete Action"
        // (mediaServicesWereReset) failures real long-clip testing hit partway through analysis.
        // kCVPixelBufferWidthKey/HeightKey ask VideoToolbox to decode-and-scale in one hardware-
        // accelerated pass instead, which is far cheaper than decoding at native resolution and
        // scaling after the fact -- and unlike a per-sampled-frame Vision-side downscale (tried
        // first; made the failures worse, not better, likely by adding its own Core Image render
        // pass on top of a decode still happening at full 4K), this actually reduces the cost of
        // the bulk of the work: every frame the reader touches, not just the ones Vision sees.
        // Values are computed from the track's own naturalSize (its RAW, pre-preferredTransform
        // dimensions -- AVAssetReader hands back buffers in that same raw orientation, per this
        // function's own comment above) so this holds regardless of capture resolution/aspect
        // ratio; skipped entirely when the source is already at or under the budget (an older
        // device, a non-4K capture format) since downscaling up would be pure loss for no gain.
        // Doesn't touch the recorded video file at all -- this only changes what a SEPARATE
        // re-read of it for analysis decodes into memory.
        var outputSettings: [String: Any] = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        let naturalSize = track.naturalSize
        let decodeMaxDim: CGFloat = 1280
        if naturalSize.width > 0, naturalSize.height > 0, max(naturalSize.width, naturalSize.height) > decodeMaxDim {
            let scale = decodeMaxDim / max(naturalSize.width, naturalSize.height)
            outputSettings[kCVPixelBufferWidthKey as String] = Int((naturalSize.width * scale).rounded())
            outputSettings[kCVPixelBufferHeightKey as String] = Int((naturalSize.height * scale).rounded())
        }
        let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(trackOutput) else {
            logDiag("analyzeRecording FAILED: cannot add track output")
            settle { DispatchQueue.main.async { call.reject("Could not set up frame reader") } }
            return
        }
        reader.add(trackOutput)
        reader.startReading()

        let poseRequest = VNDetectHumanBodyPoseRequest()
        // Grip-point corroboration signal (see av-bar-tracker-dialog.tsx's own fuseSide comment
        // on why this only ever nudges an existing confidence value, never replaces the wrist
        // seed the way Android's MediaPipe HandLandmarker can) -- configured once, reused every
        // sampled frame, same "safe to reuse across perform() calls" reasoning as poseRequest.
        // maximumHandCount=2 matches hand-tracking.ts's own numHands:2 on the MediaPipe side.
        let handPoseRequest = VNDetectHumanHandPoseRequest()
        handPoseRequest.maximumHandCount = 2
        // Phase B: real depth, iOS 17+ only -- first #available gate in this file (deployment
        // target is iOS 15.0). Built inside the guard itself (not constructed unconditionally
        // and merely left unused pre-17) so the iOS-17-only initializer is never actually called
        // on an older device -- nil here reads downstream as "not available," the same
        // omit-rather-than-fail convention every other optional signal in this file already
        // uses. A genuinely new, heavier per-frame cost with no existing precedent to size
        // against, which is exactly why it's gated behind its own stride constant from day one
        // (see body3DDetectionStride below) rather than trusted to run every sampled frame like
        // poseRequest/handPoseRequest already are.
        // Typed as the pre-17-available VNRequest base class, not
        // VNDetectHumanBodyPose3DRequest itself -- verify_build caught that a stored
        // variable's static TYPE ANNOTATION is checked against the deployment target
        // (15.0) independent of the runtime #available guard inside the closure below;
        // only the guarded CONSTRUCTOR CALL was ever conditional, but the type name in
        // the annotation still needed to resolve on every deployment target. VNRequest
        // (the same common base every other request in this file already uses) sidesteps
        // that entirely -- .perform([body3DRequest]) and .results below both operate on
        // VNRequest's own pre-17 API surface, so nothing downstream needs to change.
        let body3DRequest: VNRequest? = {
            guard #available(iOS 17.0, *) else { return nil }
            return VNDetectHumanBodyPose3DRequest()
        }()
        // Placeholder, not a measured value -- see body3DElapsedSeconds/body3DFrameCount below,
        // the numbers this needs correcting from once real on-device timing exists.
        let body3DDetectionStride = 3
        // Box jump's own object-detection signal -- see this file's own comment on
        // detectBoxTopCandidate below for the full reasoning. Configured once, reused every
        // sampled frame (Vision requests are safe to reuse across perform() calls -- only
        // .results gets overwritten each time).
        let rectanglesRequest = VNDetectRectanglesRequest()
        rectanglesRequest.minimumConfidence = 0.5
        rectanglesRequest.minimumSize = 0.15
        rectanglesRequest.maximumObservations = 8
        var boxTopCandidates: [Double] = []
        // Every frame would be needless extra Vision work for a signal that's checking a
        // STATIONARY object -- the box doesn't move frame to frame the way an implement does,
        // so a sparse sample across the whole clip is exactly as informative as every frame,
        // for a fraction of the cost. See detectBoxTopCandidate's own comment for why sampling
        // across the whole clip (not just an early "calibration window") and taking the median
        // is the right shape here, same reasoning calibrateFromFrames already established for
        // height calibration in pose-tracking.ts.
        let boxDetectionStride = 5

        var frameIndex = 0
        var processedCount = 0
        var trackedCount = 0
        // Vision genuinely erroring on a frame (perform() throwing) is a different, worse
        // signal than Vision running cleanly and just not finding a body -- the latter is
        // normal (a rep's bottom position, the athlete stepping out of frame), the former means
        // something is wrong with the frame/buffer itself. Counted separately so a clip that's
        // mostly Vision *errors* isn't indistinguishable from one that's mostly clean "no body"
        // reads.
        var visionFailureCount = 0
        // Largest gap between two consecutively-PROCESSED (i.e. already past the
        // sampleEveryNthFrame stride) frames' own presentation timestamps -- a stall signal
        // distinct from readerStatus/assetDurationSeconds above. Those catch the reader giving
        // up outright; this catches the read loop staying alive but the underlying frames
        // themselves having a large timestamp discontinuity (e.g. the capture session dropping
        // frames under load), which reader status alone reads as "completed" and would
        // otherwise look identical to a clean, evenly-paced recording.
        var previousProcessedTimestamp: Double?
        var maxInterFrameGapSeconds: Double?
        let startTime = Date()
        // Measured as its own separate handler.perform() call (see below), not folded into the
        // existing poseRequest timing -- the whole point is isolating hand-pose's OWN
        // incremental per-frame cost, since that's what actually decides whether it's safe to
        // keep running on every sampled frame (see this file's own thermal-throttling history).
        var handPoseElapsedSeconds: Double = 0
        // Phase B diagnostics -- same reasoning as handPoseElapsedSeconds above, isolating this
        // genuinely new request's own cost so it's visible before deciding whether
        // body3DDetectionStride needs widening. body3DFrameCount counts frames that actually got
        // a gated perform() call (not every sampled frame -- see the stride check below), so
        // elapsed/count gives a real per-call average, not one diluted by skipped frames.
        var body3DElapsedSeconds: Double = 0
        var body3DFrameCount = 0

        while reader.status == .reading {
            if analysisCancelled {
                reader.cancelReading()
                logDiag("analyzeRecording cancelled after \(processedCount) frames")
                settle { DispatchQueue.main.async { call.reject("Analysis cancelled") } }
                return
            }
            guard let sampleBuffer = trackOutput.copyNextSampleBuffer() else { break }
            let thisFrameIndex = frameIndex
            frameIndex += 1
            guard thisFrameIndex % sampleEveryNthFrame == 0 else { continue }
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }
            let timestampSeconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
            if let previous = previousProcessedTimestamp {
                let gap = timestampSeconds - previous
                if gap > (maxInterFrameGapSeconds ?? 0) { maxInterFrameGapSeconds = gap }
            }
            previousProcessedTimestamp = timestampSeconds
            // Vision's normalized joint coordinates are relative to the UPRIGHT (oriented)
            // image, not the raw pixel buffer's own native layout -- CVPixelBufferGetWidth/
            // Height report the raw buffer (landscape sensor order for a 90-degree-rotated
            // recording), so width/height get swapped here to match what Vision actually
            // measured against. The JS bridge (vision-body-landmarks.ts) needs real pixel
            // dimensions, not just normalized 0-1 values, to undo the aspect-ratio distortion
            // pose-tracking.ts's own angle math is sensitive to on non-square (portrait) video
            // -- see that file's comment on why angle computations need proportionally-correct
            // coordinates, not independently-normalized-per-axis ones.
            let rawWidth = CVPixelBufferGetWidth(pixelBuffer)
            let rawHeight = CVPixelBufferGetHeight(pixelBuffer)
            let swapDimensions: Bool
            switch orientation {
            case .left, .right, .leftMirrored, .rightMirrored: swapDimensions = true
            default: swapDimensions = false
            }
            let frameWidth = swapDimensions ? rawHeight : rawWidth
            let frameHeight = swapDimensions ? rawWidth : rawHeight

            var joints: [[String: Any]] = []
            var tracked = false
            var leftWristJoint: (x: Double, y: Double)?
            var rightWristJoint: (x: Double, y: Double)?
            var leftAnkleJoint: (x: Double, y: Double)?
            var rightAnkleJoint: (x: Double, y: Double)?
            // pixelBuffer already comes back downscaled straight from the reader's own decode
            // (see outputSettings' own comment above, where the reader is set up) -- no
            // separate per-frame Vision-side downscale needed on top of that; a first attempt at
            // exactly that (rendering a scaled CIImage per sampled frame) made the "Cannot
            // Complete Action" failures below worse, not better, most likely by adding its own
            // Core Image render pass on top of a decode that was still happening at full 4K
            // regardless. Decoding smaller in the first place fixes the actual bulk of the cost
            // (every frame gets decoded, not just the sampled ones) instead of shaving cost off
            // only the fraction of frames Vision ever touches.
            let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
            do {
                try handler.perform([poseRequest])
                if let observation = poseRequest.results?.first as? VNHumanBodyPoseObservation {
                    tracked = true
                    trackedCount += 1
                    for (jointName, label) in Self.bodyPoseJoints {
                        guard let point = try? observation.recognizedPoint(jointName), point.confidence > 0.1 else {
                            continue
                        }
                        // Vision's own coordinate convention: normalized 0-1, origin at
                        // BOTTOM-left -- different from the top-left-origin image space most
                        // of the rest of this app assumes. Left as raw Vision coordinates
                        // here; Phase 3's vision-body-landmarks.ts bridge is where that
                        // Y-flip belongs (matching how ar-body-landmarks.ts's own comment
                        // handles ARKit's own coordinate quirks at the bridge layer, not
                        // here at the source).
                        joints.append([
                            "name": label,
                            "x": Double(point.location.x),
                            "y": Double(point.location.y),
                            "confidence": Double(point.confidence),
                        ])
                        if label == "leftWrist" {
                            leftWristJoint = (x: Double(point.location.x), y: Double(point.location.y))
                        } else if label == "rightWrist" {
                            rightWristJoint = (x: Double(point.location.x), y: Double(point.location.y))
                        } else if label == "leftAnkle" {
                            leftAnkleJoint = (x: Double(point.location.x), y: Double(point.location.y))
                        } else if label == "rightAnkle" {
                            rightAnkleJoint = (x: Double(point.location.x), y: Double(point.location.y))
                        }
                    }
                }
            } catch {
                visionFailureCount += 1
                logDiag("Vision request failed on frame \(thisFrameIndex): \(error.localizedDescription)")
            }

            // A separate perform() call reusing the same handler -- same precedent
            // detectBoxTopCandidate below already establishes for rectanglesRequest -- rather
            // than bundling into the poseRequest call above, specifically so
            // handPoseElapsedSeconds measures hand-pose's own cost in isolation, not a total
            // that conflates it with the already-accepted pose-only cost.
            var handJoints: [[String: Any]] = []
            let handPoseStart = Date()
            do {
                try handler.perform([handPoseRequest])
                if let handObservations = handPoseRequest.results as? [VNHumanHandPoseObservation] {
                    for (handIndex, observation) in handObservations.enumerated() {
                        // Chirality (.left/.right/.unknown) is available here but deliberately
                        // not read -- see vision-body-landmarks.ts's visionRefineGripSeed for
                        // why grip-seed matching goes by proximity to the Pose-derived wrist
                        // instead: its sense depends on camera mirroring this app doesn't
                        // consistently control. `hand` is just a stable per-frame index (0/1)
                        // so the JS bridge can group a frame's joints back into per-hand sets.
                        guard let points = try? observation.recognizedPoints(forGroupKey: .all) else { continue }
                        for (jointName, label) in Self.handPoseJoints {
                            // recognizedPoints(forGroupKey:) returns [VNRecognizedPointKey: VNRecognizedPoint] --
                            // JointName's own .rawValue is what actually indexes it, not the JointName enum
                            // case directly (real compiler error caught in CI: "cannot convert value of type
                            // 'VNHumanHandPoseObservation.JointName' to expected argument type
                            // 'VNRecognizedPointKey'").
                            guard let point = points[jointName.rawValue], point.confidence > 0.1 else { continue }
                            handJoints.append([
                                "hand": handIndex,
                                "name": label,
                                "x": Double(point.location.x),
                                "y": Double(point.location.y),
                                "confidence": Double(point.confidence),
                            ])
                        }
                    }
                }
            } catch {
                // Deliberately not folded into visionFailureCount -- that counter's whole
                // purpose (see its own comment above) is distinguishing "Vision errored" from
                // "Vision ran cleanly and found nothing," and conflating a brand-new, still-
                // unproven request's failures with the already-trusted pose request's would
                // hide exactly the signal Section A5's on-device validation needs to see.
                logDiag("Hand pose request failed on frame \(thisFrameIndex): \(error.localizedDescription)")
            }
            handPoseElapsedSeconds += Date().timeIntervalSince(handPoseStart)

            // Phase B: real depth, iOS 17+ only -- see body3DRequest's own comment above for why
            // this is nil (and this whole block a no-op) below that OS version. A separate
            // perform() call on the same handler, same "isolate this request's own timing"
            // reasoning as handPoseElapsedSeconds above, gated by its own stride (unlike hand
            // pose, this hasn't earned "every sampled frame" trust yet -- see
            // body3DDetectionStride's own comment).
            var body3DJoints: [[String: Any]] = []
            if let body3DRequest = body3DRequest, thisFrameIndex % body3DDetectionStride == 0 {
                let body3DStart = Date()
                do {
                    try handler.perform([body3DRequest])
                    if #available(iOS 17.0, *), let observation = body3DRequest.results?.first as? VNHumanBodyPose3DObservation {
                        for (jointName, label) in Self.body3DPoseJoints {
                            // Unlike the 2D VNRecognizedPoint this plugin's other requests use,
                            // VNHumanBodyRecognizedPoint3D has no confidence property at all (its
                            // real class hierarchy -- confirmed against Apple's own docs after
                            // verify_build caught the build assuming one -- is
                            // NSObject -> VNPoint3D(position) -> VNRecognizedPoint3D(identifier) ->
                            // VNHumanBodyRecognizedPoint3D(localPosition, parentJoint), nothing in
                            // that chain adds confidence). recognizedPoint(_:) itself is the
                            // availability gate: it throws for any joint Vision isn't reporting this
                            // frame, so a joint that reaches here at all is one Vision is already
                            // vouching for -- try? converts that throw into skip via continue, same
                            // effect the old confidence guard was reaching for.
                            guard let point = try? observation.recognizedPoint(jointName) else {
                                continue
                            }
                            // .position is a simd_float4x4 (Apple's own documented convention for
                            // every 3D point Vision reports, matching ARKit's own transform-matrix
                            // shape) -- real-world meters, relative to the skeleton's root joint
                            // (center of the hip), translation in the 4th column. NOT .localPosition
                            // (relative to the PARENT joint in the skeleton hierarchy) -- every other
                            // joint this plugin emits shares ONE coordinate space, and .position is
                            // the one that matches that convention.
                            let translation = point.position.columns.3
                            body3DJoints.append([
                                "name": label,
                                "x": Double(translation.x),
                                "y": Double(translation.y),
                                "z": Double(translation.z),
                                // No real per-joint confidence to report (see above) -- 1.0 for
                                // every joint that resolved, so the JS bridge's shared Landmark
                                // shape (visibility/confidence-gated like every other source) still
                                // treats these as fully trusted rather than reading a fabricated
                                // partial score.
                                "confidence": 1.0,
                            ])
                        }
                    }
                } catch {
                    // Deliberately not folded into visionFailureCount -- same reasoning as hand
                    // pose's own catch block above: this is a brand-new, still-unproven request,
                    // and conflating its failures with the already-trusted pose request's would
                    // hide exactly the signal on-device validation needs to see.
                    logDiag("3D body pose request failed on frame \(thisFrameIndex): \(error.localizedDescription)")
                }
                body3DFrameCount += 1
                body3DElapsedSeconds += Date().timeIntervalSince(body3DStart)
            }

            if detectBox, thisFrameIndex % boxDetectionStride == 0,
               let candidate = detectBoxTopCandidate(
                   handler: handler, request: rectanglesRequest,
                   leftAnkle: leftAnkleJoint, rightAnkle: rightAnkleJoint
               ) {
                boxTopCandidates.append(candidate)
            }

            // Phase 5: object/implement tracking -- only worth the extra downscale+render
            // work on a frame that actually has a wrist to anchor the search on, same
            // "skip when there's nothing to track from" precedent bar-tracker-dialog.tsx
            // and ar-bar-tracker-dialog.tsx both already establish for their own callers.
            var leftImplement: [String: Any]?
            var rightImplement: [String: Any]?
            if leftWristJoint != nil || rightWristJoint != nil,
               let working = extractWorkingFrame(
                   pixelBuffer: pixelBuffer, orientation: orientation, frameWidth: frameWidth, frameHeight: frameHeight
               ) {
                if let wrist = leftWristJoint {
                    let wristWorkingX = wrist.x * Double(working.width)
                    let wristWorkingY = (1.0 - wrist.y) * Double(working.height)
                    if let result = leftImplementTracker.track(
                        rgba: working.rgba, luma: working.luma, width: working.width, height: working.height,
                        wristX: wristWorkingX, wristY: wristWorkingY
                    ) {
                        leftImplement = implementResultDict(result)
                    }
                }
                if let wrist = rightWristJoint {
                    let wristWorkingX = wrist.x * Double(working.width)
                    let wristWorkingY = (1.0 - wrist.y) * Double(working.height)
                    if let result = rightImplementTracker.track(
                        rgba: working.rgba, luma: working.luma, width: working.width, height: working.height,
                        wristX: wristWorkingX, wristY: wristWorkingY
                    ) {
                        rightImplement = implementResultDict(result)
                    }
                }
            }

            // Additive signal -- see AvCoreMlImplementDetector's own header comment. Runs on the
            // full pixelBuffer (not the downscaled working frame the motion-diff trackers above
            // use), since Vision's own CoreML/tracking requests do their own internal scaling and
            // want real image data to track a visual appearance against, not a coarse 160px
            // proxy. coreMlTargetLabel picks which of the model's classes this call actually
            // cares about (see runPoseAnalysis's own comment) -- med-ball throws and now
            // barbell/dumbbell/kettlebell lifts share this exact detector and wiring, just
            // pointed at a different class. wristRegionOfInterest (nil when neither wrist was
            // found this frame) narrows the SEARCH area for a fresh detection to roughly where
            // the equipment already is -- see AvCoreMlImplementDetector.regionOfInterest's own
            // comment for why that's a meaningfully cheaper lever than downscaling the image
            // (already tried, made things worse -- see extractWorkingFrame's own comment above)
            // or running detection concurrently with capture (already tried, caused real
            // on-device thermal throttling -- see this file's header comment).
            var coreMlImplement: [String: Any]?
            if coreMlDetectionEnabled, let targetLabel = coreMlTargetLabel,
               let result = coreMlImplementDetector.track(
                   pixelBuffer: pixelBuffer, orientation: orientation, targetLabel: targetLabel,
                   regionOfInterest: AvCoreMlImplementDetector.regionOfInterest(leftWrist: leftWristJoint, rightWrist: rightWristJoint)
               ) {
                coreMlImplement = coreMlResultDict(result.box, confidence: result.confidence)
            }

            // Same gate as the CoreML detector above -- handheld camera shake is a real problem
            // for every tracking mode; this rides along on the same enable/disable decision
            // rather than a separate one, since a session worth enabling object detection for is
            // also worth stabilizing.
            var cameraDrift: [String: Any]?
            if coreMlDetectionEnabled,
               let drift = cameraStabilizer.drift(for: pixelBuffer, orientation: orientation, frameWidth: frameWidth, frameHeight: frameHeight) {
                cameraDrift = ["x": drift.x, "y": drift.y]
            }

            processedCount += 1
            // Mirrors processedCount into the thread-safe counter analyzeRecording's watchdog
            // reads from a different queue -- see AvAnalysisProgress's own comment. Kept as a
            // separate increment rather than replacing processedCount everywhere it's already
            // used below, so this stays a pure addition with no risk to the existing diagnostic
            // reporting this function already does.
            progress.increment()
            var eventData: [String: Any] = [
                "frameIndex": thisFrameIndex,
                "timestamp": timestampSeconds,
                "tracked": tracked,
                "joints": joints,
                "frameWidth": frameWidth,
                "frameHeight": frameHeight,
            ]
            // Omit-when-nil, matching ArCameraPreviewPlugin's own
            // implementResultDict pattern -- the JS bridge treats a missing key the
            // same as "no lock this frame," not a zeroed/default point.
            if let leftImplement = leftImplement { eventData["leftImplement"] = leftImplement }
            if let rightImplement = rightImplement { eventData["rightImplement"] = rightImplement }
            if let coreMlImplement = coreMlImplement { eventData["coreMlImplement"] = coreMlImplement }
            if let cameraDrift = cameraDrift { eventData["cameraDrift"] = cameraDrift }
            // Omit-when-empty, not always-present like joints above -- a hand out of frame is
            // genuinely "nothing to report this frame," the same semantics leftImplement/
            // cameraDrift already use, not core per-frame state every consumer depends on.
            if !handJoints.isEmpty { eventData["handJoints"] = handJoints }
            if !body3DJoints.isEmpty { eventData["body3DJoints"] = body3DJoints }
            DispatchQueue.main.async {
                self.notifyListeners("poseFrame", data: eventData)
            }
        }

        let elapsed = Date().timeIntervalSince(startTime)
        // What the read loop actually stopped on -- .completed is the only status meaning "we
        // genuinely reached the end of the track," so a mismatch against assetDurationSeconds
        // above (e.g. status completed, but processedCount's own timestamp coverage falls far
        // short of the asset's claimed duration) points at frame decoding/sampling, not the
        // reader itself; .failed/.cancelled with real elapsed processedCount>0 means the reader
        // itself gave up partway through -- exactly the "recording was long, only a fraction
        // got analyzed" case this is here to distinguish from a genuinely short take.
        let readerStatusString: String
        switch reader.status {
        case .completed: readerStatusString = "completed"
        case .failed: readerStatusString = "failed"
        case .cancelled: readerStatusString = "cancelled"
        case .reading: readerStatusString = "reading"
        case .unknown: readerStatusString = "unknown"
        @unknown default: readerStatusString = "unknown"
        }
        if let error = reader.error {
            logDiag("analyzeRecording finished with reader error: \(error.localizedDescription)")
        }
        logDiag(
            "analyzeRecording asset duration=\(String(format: "%.2f", assetDurationSeconds))s, "
                + "reader status=\(readerStatusString)"
        )
        // Read once, at the end of analysis rather than the start -- this loop is the CPU-heavy
        // part of the whole pipeline, so a phone that was fine when recording started but
        // throttled/emptied its own free space partway through analysis is exactly what these
        // are here to catch. See this file's own thermalStateDescription/
        // availableDiskSpaceBytes comments for why each is worth reading at all.
        let thermalState = thermalStateDescription(ProcessInfo.processInfo.thermalState)
        let lowPowerModeEnabled = ProcessInfo.processInfo.isLowPowerModeEnabled
        let freeDiskSpaceBytes = availableDiskSpaceBytes()
        logDiag(
            "analyzeRecording conditions: thermalState=\(thermalState) lowPowerMode=\(lowPowerModeEnabled) "
                + "freeDiskSpaceBytes=\(freeDiskSpaceBytes.map { String($0) } ?? "unknown") "
                + "visionFailureCount=\(visionFailureCount) "
                + "maxInterFrameGapSeconds=\(maxInterFrameGapSeconds.map { String(format: "%.2f", $0) } ?? "n/a") "
                + "handPoseElapsedSeconds=\(String(format: "%.2f", handPoseElapsedSeconds)) "
                + "(avg \(processedCount > 0 ? String(format: "%.4f", handPoseElapsedSeconds / Double(processedCount)) : "n/a")s/frame)"
        )
        // body3DAvailable reflects the #available(iOS 17.0, *) gate itself, independent of
        // whether any frame actually got a gated perform() call this clip -- confirms the OS
        // check fired correctly, not just that body3DJoints happened to come back empty.
        let body3DAvailable: Bool = {
            if #available(iOS 17.0, *) { return true }
            return false
        }()
        logDiag(
            "analyzeRecording body3D: available=\(body3DAvailable) framesAttempted=\(body3DFrameCount) "
                + "elapsedSeconds=\(String(format: "%.2f", body3DElapsedSeconds)) "
                + "(avg \(body3DFrameCount > 0 ? String(format: "%.4f", body3DElapsedSeconds / Double(body3DFrameCount)) : "n/a")s/frame)"
        )
        // Below MIN_BOX_TOP_SAMPLES, this isn't a confident read -- reporting a "detection"
        // off one or two lucky/unlucky frames would be worse than reporting nothing at all
        // (the JS side's own no-number-is-better-than-a-wrong-one philosophy, see
        // av-jump-tracker-dialog.tsx's file comment). Median, not mean, so the handful of
        // frames where the athlete's own body occludes the box mid-flight (a wildly wrong
        // candidate, not just a noisy one) can't drag the result toward themselves the way an
        // average would.
        let minBoxTopSamples = 5
        let boxTopNormalizedY: Double? = boxTopCandidates.count >= minBoxTopSamples
            ? Self.median(boxTopCandidates) : nil
        if detectBox {
            logDiag(
                "box detection: \(boxTopCandidates.count) candidate frames, "
                    + (boxTopNormalizedY.map { "boxTopNormalizedY=\(String(format: "%.4f", $0))" } ?? "no confident read")
            )
        }
        logDiag(
            "analyzeRecording finished: \(processedCount) frames processed, "
                + "\(trackedCount) tracked, \(String(format: "%.2f", elapsed))s elapsed"
        )
        settle {
            DispatchQueue.main.async {
                var result: [String: Any] = [
                    "frameCount": processedCount,
                    "trackedFrameCount": trackedCount,
                    "elapsedSeconds": elapsed,
                    "assetDurationSeconds": assetDurationSeconds,
                    "readerStatus": readerStatusString,
                    "visionFailureCount": visionFailureCount,
                    "thermalState": thermalState,
                    "lowPowerModeEnabled": lowPowerModeEnabled,
                    "handPoseElapsedSeconds": handPoseElapsedSeconds,
                    "body3DElapsedSeconds": body3DElapsedSeconds,
                    "body3DFrameCount": body3DFrameCount,
                    "body3DAvailable": body3DAvailable,
                ]
                if let error = reader.error {
                    result["readerErrorMessage"] = error.localizedDescription
                }
                // Omit-when-nil, same convention as leftImplement/rightImplement above -- the JS
                // bridge treats a missing key as "no confident box read," not a zeroed default.
                if let boxTopNormalizedY = boxTopNormalizedY {
                    result["boxTopNormalizedY"] = boxTopNormalizedY
                }
                if let freeDiskSpaceBytes = freeDiskSpaceBytes {
                    result["freeDiskSpaceBytes"] = freeDiskSpaceBytes
                }
                if let maxInterFrameGapSeconds = maxInterFrameGapSeconds {
                    result["maxInterFrameGapSeconds"] = maxInterFrameGapSeconds
                }
                call.resolve(result)
            }
        }
    }

    private static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let mid = sorted.count / 2
        return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    // Same mapping ArCameraPreviewPlugin's own thermalStateDescription already uses (see that
    // file) -- duplicated rather than shared since the two plugins don't otherwise share a base
    // class. Read once at the end of analysis: this whole pipeline is CPU-bound Vision work, so
    // if a phone throttled partway through a clip, that's a real, public, documented explanation
    // for analysis slowing down or bailing out early -- exactly the kind of root cause
    // assetDurationSeconds/readerStatus alone can't distinguish from anything else.
    private func thermalStateDescription(_ state: ProcessInfo.ThermalState) -> String {
        switch state {
        case .nominal: return "nominal"
        case .fair: return "fair"
        case .serious: return "serious"
        case .critical: return "critical"
        @unknown default: return "unknown"
        }
    }

    // Free space on the volume actually holding this app's documents, at the moment analysis
    // finishes -- the same volume startRecording/stopRecording write clips to. Distinct from
    // (and a cheaper, per-recording complement to) the admin Video Storage page's own
    // system-wide free-space figure: this ties a specific low-space reading to a specific
    // clip's own diagnostics instead of only being visible as a global snapshot an admin has to
    // separately think to go check.
    private func availableDiskSpaceBytes() -> Int64? {
        guard let docsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        return try? docsURL.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
            .volumeAvailableCapacityForImportantUsage
    }

    // Box jump has a real, physical target the athlete jumps ONTO -- unlike a barbell/med
    // ball/kettlebell (AvImplementTracker's own job, motion-diff based: nothing to follow by
    // recognition), a box is stationary, so motion-diff finds nothing to track. What it DOES
    // have is a real, detectable shape: VNDetectRectanglesRequest finds the box's own top
    // surface as a (perspective-distorted) quadrilateral, the same public Vision API this
    // pipeline already builds everything else on. topLeft/topRight are the two corners with
    // the largest y (Vision's bottom-left-origin convention -- larger y is higher up the
    // frame), i.e. the physical top edge of whatever rectangle this is.
    //
    // Picking WHICH rectangle in frame is the box (not a doorframe, a mat, a rack upright) uses
    // the same plausibility-bound philosophy as ArImplementTracker.swift's own
    // maxPlausibleImplementSpeedMps: reject anything that couldn't physically be the box rather
    // than trying to positively identify it by appearance. Requires an ankle joint that frame
    // to check against (nothing to validate proximity to otherwise) and keeps only the
    // candidate whose horizontal center sits closest to the ankle's own x -- the athlete stands
    // right in front of (or on top of) the box, so the box is never far from directly under
    // their own feet in frame.
    //
    // UNTUNED, flagged honestly rather than assumed -- there's no camera to calibrate any of
    // these fractions against in this environment, same caveat as every other constant in this
    // pipeline picked by reasoning instead of measurement (see e.g. AvImplementTracker's own
    // motionDiffThreshold comment).
    private let boxHorizontalToleranceFraction = 0.3
    private let boxMaxHeightAboveAnkleFraction = 0.6
    // A box's top surface, viewed from roughly straight on (how this is filmed -- the athlete
    // needs the whole jump in frame), reads as a quadrilateral somewhere between "almost square"
    // and "noticeably wider than tall," never a thin sliver. A gym floor seam, a mat edge, or a
    // shadow line is exactly the shape this was mistaking for a box top before this guard existed
    // -- long and thin, nowhere near square. boundingBox is VNRectangleObservation's own
    // normalized, axis-aligned bounding box of the (possibly perspective-skewed) quad; its
    // width/height ratio is a cheap, resolution-independent proxy for "roughly box-shaped" that
    // doesn't need the actual corner geometry the height/horizontal checks below already use for
    // a different purpose (position, not shape). UNTUNED, same honest caveat as every other
    // constant in this pipeline -- no camera in this environment to calibrate against a real box
    // photographed from a real filming angle.
    private let boxMinAspectRatio = 0.5
    private let boxMaxAspectRatio = 3.0

    private func detectBoxTopCandidate(
        handler: VNImageRequestHandler,
        request: VNDetectRectanglesRequest,
        leftAnkle: (x: Double, y: Double)?,
        rightAnkle: (x: Double, y: Double)?
    ) -> Double? {
        let ankles = [leftAnkle, rightAnkle].compactMap { $0 }
        guard !ankles.isEmpty else { return nil }
        let ankleX = ankles.map { $0.x }.reduce(0, +) / Double(ankles.count)
        let ankleY = ankles.map { $0.y }.reduce(0, +) / Double(ankles.count)

        do {
            try handler.perform([request])
        } catch {
            return nil
        }
        guard let observations = request.results as? [VNRectangleObservation] else { return nil }

        var best: (topY: Double, horizontalDistance: Double)?
        for obs in observations {
            // Cheapest check first -- rejects floor seams/mat edges/shadow lines before doing
            // any of the position math below on a candidate that was never going to be the box
            // regardless of where it sits.
            let boundingBox = obs.boundingBox
            guard boundingBox.height > 0 else { continue }
            let aspectRatio = Double(boundingBox.width / boundingBox.height)
            guard aspectRatio >= boxMinAspectRatio, aspectRatio <= boxMaxAspectRatio else { continue }
            let topY = Double(obs.topLeft.y + obs.topRight.y) / 2
            let centerX = Double(obs.topLeft.x + obs.topRight.x + obs.bottomLeft.x + obs.bottomRight.x) / 4
            // The box's top has to sit above the athlete's own standing ankle level (it's an
            // elevated platform) but not implausibly far above it (a doorway lintel, a ceiling
            // beam) -- see this function's own comment on why these are reasoned bounds, not
            // measured ones.
            let heightAboveAnkle = topY - ankleY
            guard heightAboveAnkle > 0, heightAboveAnkle <= boxMaxHeightAboveAnkleFraction else { continue }
            let horizontalDistance = abs(centerX - ankleX)
            guard horizontalDistance <= boxHorizontalToleranceFraction else { continue }
            if best == nil || horizontalDistance < best!.horizontalDistance {
                best = (topY: topY, horizontalDistance: horizontalDistance)
            }
        }
        return best?.topY
    }

    private func cgOrientation(for transform: CGAffineTransform) -> CGImagePropertyOrientation {
        switch (transform.a, transform.b, transform.c, transform.d) {
        case (0, 1, -1, 0): return .right
        case (0, -1, 1, 0): return .left
        case (-1, 0, 0, -1): return .down
        default: return .up
        }
    }

    // Defense-in-depth for the same storage-bloat edge case -- a temp file only survives to
    // here if the JS side's own deleteRecording call never ran (app killed before it could, a
    // crash, an upload that failed before cleanup). Swept at the start of every start() call
    // so a string of interrupted sessions can't slowly fill the device's storage.
    private func purgeStaleRecordings() {
        let tmp = FileManager.default.temporaryDirectory
        guard let files = try? FileManager.default.contentsOfDirectory(at: tmp, includingPropertiesForKeys: nil) else {
            return
        }
        for file in files where file.lastPathComponent.hasPrefix("av-") {
            try? FileManager.default.removeItem(at: file)
        }
    }

    // Downscaled working-resolution buffers for AvImplementTracker's motion-diff scan --
    // same WORKING_MAX_DIM=160 budget as implement-tracking.ts's own (see that file's
    // comment: large enough to localize a held implement's centroid, small enough that a
    // full-frame diff is cheap every tick regardless of the camera's native resolution).
    // .oriented(orientation) reorients the raw BGRA buffer into the exact same upright
    // coordinate space Vision's own joint normalization already measured against (the
    // frameWidth x frameHeight already computed by the caller), so the returned buffer's
    // pixel grid lines up with Vision's joints with nothing further to correct for.
    private static let implementWorkingMaxDim = 160

    private struct WorkingFrame {
        // Row-major, top-left origin, width*height*4 (rgba) / width*height (luma) --
        // UNVERIFIED on real hardware, flagged honestly rather than assumed (this
        // environment has no device to render against): CIContext.render(_:toBitmap:...)
        // is documented top-left-origin/row-major output, matching this codebase's own
        // established pattern for anything that can't be confirmed without a physical
        // device (see e.g. ArImplementTracker.swift's own orientation caveat).
        var rgba: [UInt8]
        var luma: [UInt8]
        var width: Int
        var height: Int
    }

    private func extractWorkingFrame(
        pixelBuffer: CVPixelBuffer,
        orientation: CGImagePropertyOrientation,
        frameWidth: Int,
        frameHeight: Int
    ) -> WorkingFrame? {
        guard frameWidth > 0, frameHeight > 0 else { return nil }
        let maxDim = Double(Self.implementWorkingMaxDim)
        var workingWidth = Self.implementWorkingMaxDim
        var workingHeight = Int((maxDim * Double(frameHeight) / Double(frameWidth)).rounded())
        if workingHeight > Self.implementWorkingMaxDim {
            workingHeight = Self.implementWorkingMaxDim
            workingWidth = Int((maxDim * Double(frameWidth) / Double(frameHeight)).rounded())
        }
        workingWidth = max(1, workingWidth)
        workingHeight = max(1, workingHeight)

        let oriented = CIImage(cvPixelBuffer: pixelBuffer).oriented(orientation)
        guard oriented.extent.width > 0, oriented.extent.height > 0 else { return nil }
        let scaleX = CGFloat(workingWidth) / oriented.extent.width
        let scaleY = CGFloat(workingHeight) / oriented.extent.height
        let scaled = oriented.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

        let bytesPerRow = workingWidth * 4
        var rgba = [UInt8](repeating: 0, count: bytesPerRow * workingHeight)
        let bounds = CGRect(x: 0, y: 0, width: workingWidth, height: workingHeight)
        let rendered: Bool = rgba.withUnsafeMutableBytes { ptr -> Bool in
            guard let base = ptr.baseAddress else { return false }
            implementCIContext.render(
                scaled,
                toBitmap: base,
                rowBytes: bytesPerRow,
                bounds: bounds,
                format: .RGBA8,
                colorSpace: CGColorSpaceCreateDeviceRGB()
            )
            return true
        }
        guard rendered else { return nil }

        var luma = [UInt8](repeating: 0, count: workingWidth * workingHeight)
        for pixelIndex in 0..<(workingWidth * workingHeight) {
            let byteIndex = pixelIndex * 4
            let r = Double(rgba[byteIndex])
            let g = Double(rgba[byteIndex + 1])
            let b = Double(rgba[byteIndex + 2])
            luma[pixelIndex] = UInt8(min(255.0, max(0.0, 0.299 * r + 0.587 * g + 0.114 * b)))
        }
        return WorkingFrame(rgba: rgba, luma: luma, width: workingWidth, height: workingHeight)
    }

    // Same shape/omit-when-nil convention as ArCameraPreviewPlugin's own implementResultDict --
    // color is carried through even though no current AV dialog reads it yet (same as that
    // ARKit counterpart, which computes and emits it for implement-appearance-memory.ts's
    // corroboration feature despite ar-bar-tracker-dialog.tsx not calling into it either) so a
    // future caller doesn't need a native change just to start using it.
    private func implementResultDict(_ result: AvImplementTracker.TrackResult) -> [String: Any] {
        var dict: [String: Any] = [
            "x": result.x,
            "y": result.y,
            "confidence": result.confidence,
        ]
        if let color = result.color {
            dict["color"] = ["r": color.r, "g": color.g, "b": color.b]
        }
        return dict
    }

    private func coreMlResultDict(_ boundingBox: CGRect, confidence: Float) -> [String: Any] {
        // Vision's box is (x, y, width, height) with the same normalized,
        // bottom-left-origin convention as every joint this file already
        // hands back -- reporting the box's center point keeps the shape
        // consistent with implementResultDict's x/y (a point, not a rect)
        // for whatever future JS-side code starts consuming this.
        return [
            "x": Double(boundingBox.midX),
            "y": Double(boundingBox.midY),
            "width": Double(boundingBox.width),
            "height": Double(boundingBox.height),
            "confidence": Double(confidence),
        ]
    }
}

// A frame-processed counter analyzeRecording's stall-check timer reads from a DIFFERENT queue
// than the one actually running runPoseAnalysis's frame loop -- a plain Int/Date pair read/
// written from two queues at once is a data race; this is the minimal NSLock-guarded wrapper
// that isn't. One instance per analyzeRecording call (not shared across calls the way
// AvCoreMlImplementDetector's single instance is), created fresh in analyzeRecording and passed
// down into runPoseAnalysis. lastChangedAt starts at construction time (effectively "when this
// analysis call began") rather than nil, so a stall check running before the very first
// increment() still gets a real answer to "how long has it been since anything happened."
private final class AvAnalysisProgress {
    private let lock = NSLock()
    private var count = 0
    private var lastChangedAt = Date()

    func increment() {
        lock.lock()
        count += 1
        lastChangedAt = Date()
        lock.unlock()
    }

    func snapshot() -> Int {
        lock.lock()
        defer { lock.unlock() }
        return count
    }

    func secondsSinceLastProgress() -> TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return Date().timeIntervalSince(lastChangedAt)
    }
}

// Real, trained, on-device object detection for med-ball throws only (see the
// trackingMode gate in analyzeRecording/runPoseAnalysis below) -- built to
// directly address AvImplementTracker's own documented weak spot: motion-diff
// tracking loses lock the instant the implement stops moving (the exact
// bottom of a throw's countermovement) or gets briefly occluded. Runs Apple's
// own VNCoreMLRequest once per clip to find the implement, then hands off to
// VNTrackObjectRequest (Apple's Neural Engine object tracker) for every frame
// after that -- cheap, and immune to the zero-velocity/occlusion cases
// motion-diff can't handle, because it's tracking the implement's actual
// visual appearance, not just which pixels changed.
//
// See scripts/med-ball-detector/ for the training pipeline that produces
// MedBallDetector.mlmodelc, currently trained on 8 classes (med_ball, plate,
// baseball, golf_ball, tennis_ball, kettlebell, dumbbell, barbell -- see
// that pipeline's own CLASS_NAMES, the source of truth for valid
// targetLabel/supportedTrackingModes values). Deliberately, completely
// inert (isAvailable == false, track() always returns nil) until that file
// is actually bundled into the app -- nothing here ever blocks, delays, or
// fails a recording or its analysis; every call site treats a nil result
// exactly like AvImplementTracker returning nil (no signal this frame, not
// an error), and every tracking mode this feeds keeps working via
// AvImplementTracker/wrist fusion alone in the meantime. This is pure
// addition, never a replacement -- not for med-ball throws, and not (now
// that AvBarTrackerDialog also enables this for a lifted implement it
// recognizes) for a barbell/dumbbell/kettlebell's own motion-diff tracker
// either. One detector instance, one loaded model, reused across whatever
// class each call asks it to look for -- track()'s targetLabel argument
// picks the class per call rather than this class hardcoding one.
private final class AvCoreMlImplementDetector {
    private let modelName = "MedBallDetector"

    // trackingMode strings AvBodyTrackingPlugin's runPoseAnalysis will actually enable this
    // detector for, and what Vision class label each maps to -- currently the identity mapping
    // (the client already sends the exact class name: AvMedBallTrackerDialog sends "med_ball",
    // AvBarTrackerDialog maps its own `equipment` prop, e.g. "Barbell" -> "barbell", before
    // calling stopRecordingAndAnalyze), but kept as an explicit allow-list rather than trusting
    // any client-supplied string straight through as a Vision label -- an unrecognized
    // trackingMode should mean "stay off," the same as omitting it entirely, not "ask Vision to
    // match a class it was never trained on."
    static let supportedTrackingModes: Set<String> = [
        "med_ball", "plate", "baseball", "golf_ball", "tennis_ball", "kettlebell", "dumbbell", "barbell",
    ]

    static func targetLabel(forTrackingMode trackingMode: String?) -> String? {
        guard let trackingMode, supportedTrackingModes.contains(trackingMode) else { return nil }
        return trackingMode
    }

    // Loaded once per plugin instance lookup, not per clip -- Bundle.main
    // is static for the life of the app, so there's nothing to gain from
    // re-resolving this on every reset(), and MLModel/VNCoreMLModel
    // construction isn't free.
    private lazy var visionModel: VNCoreMLModel? = {
        guard let url = Bundle.main.url(forResource: modelName, withExtension: "mlmodelc") else {
            return nil
        }
        guard let mlModel = try? MLModel(contentsOf: url),
            let vnModel = try? VNCoreMLModel(for: mlModel)
        else {
            return nil
        }
        return vnModel
    }()

    var isAvailable: Bool { visionModel != nil }

    private var trackingRequest: VNTrackObjectRequest?
    private let sequenceHandler = VNSequenceRequestHandler()
    // A detection this weak is more likely a false positive (a shadow, a
    // teammate's shirt) than a real med ball -- untuned starting value, same
    // "no real footage to calibrate against yet" caveat every other
    // heuristic constant in this file carries until real device testing
    // gives actual numbers to react to.
    private let minDetectionConfidence: VNConfidence = 0.4

    // Camera overlord: recent boxes VNTrackObjectRequest has reported while actively locked
    // on, oldest first -- lets a fresh observation be checked against the recent trend before
    // being trusted, rather than accepted purely because Vision's own tracker still reports a
    // confidence above minDetectionConfidence. VNTrackObjectRequest tracks visual continuity of
    // a REGION, not "is this still the right class" (it never re-runs the classifier once
    // locked on -- see track()'s own comment) -- a sudden implausible jump in the tracked
    // region's position or size is the signature of the tracker having drifted onto a
    // DIFFERENT nearby object (the exact "a plate in the background looks like the med ball"
    // failure mode), not the same one legitimately moving fast.
    private var recentBoxes: [CGRect] = []
    private let boxHistoryWindow = 4

    // Camera overlord: Vision's own free-flight parabola fit (VNDetectTrajectoriesRequest, iOS
    // 14+), an entirely independent signal from VNTrackObjectRequest's own visual-continuity
    // tracking above -- physics-based (does this object's actual path over the last several
    // frames trace a real gravity-only arc), not appearance-based, so it can catch a drifted
    // lock in a way box-consistency alone can't: a lock that drifted onto something visually
    // similar (a plate, a shadow) but NOT actually in free flight. Stateful across calls, same
    // as trackingRequest above -- accumulates evidence over trajectoryLength frames before it
    // ever reports an observation, so it's recreated (not just cleared) on reset() the same way
    // a fresh trackingRequest is, rather than carrying stale accumulated frames across clips.
    //
    // Wrapped in a factory method (not a plain lazy var) specifically so reset() can call it
    // again -- a lazy var's deferred-evaluation behavior only governs its FIRST access; once
    // initialized it's a completely ordinary stored var that can be reassigned any time, which
    // is exactly what a fresh per-clip instance needs.
    private lazy var trajectoryRequest: VNDetectTrajectoriesRequest = makeTrajectoryRequest()
    private var latestTrajectoryObservations: [VNTrajectoryObservation] = []
    // How many consistent points VNDetectTrajectoriesRequest wants to see before it reports a
    // trajectory at all -- Apple's own sample code uses 5 (see this class's header comment for
    // the source); kept the same since there's no real-footage reason yet to diverge from it.
    private let trajectoryLength = 5

    private func makeTrajectoryRequest() -> VNDetectTrajectoriesRequest {
        let request = VNDetectTrajectoriesRequest(
            frameAnalysisSpacing: .zero, trajectoryLength: trajectoryLength
        ) { [weak self] request, _ in
            self?.latestTrajectoryObservations = (request.results as? [VNTrajectoryObservation]) ?? []
        }
        // Excludes anything much smaller than a med ball's own real screen-radius at a typical
        // filming distance (a hand, a stray reflection/highlight) and anything implausibly large
        // (a misfit spanning much of the frame) -- same "reasoned starting value, untuned against
        // real footage" caveat as minDetectionConfidence above.
        request.objectMinimumNormalizedRadius = 0.01
        request.objectMaximumNormalizedRadius = 0.3
        return request
    }

    // Only meaningful for a genuinely thrown, free-flying object -- see detectTrajectory's own
    // comment on why this is gated to "med_ball" specifically at the call site below, not every
    // class this detector supports.
    private func detectTrajectory(pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation) -> [(x: Double, y: Double)]? {
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
        guard (try? handler.perform([trajectoryRequest])) != nil else { return nil }
        // Vision doesn't guarantee these come back in any particular order -- the trajectory
        // covering the most points is the best proxy for "most complete, most current" when more
        // than one is reported this frame.
        guard let best = latestTrajectoryObservations.max(by: { $0.detectedPoints.count < $1.detectedPoints.count })
        else { return nil }
        return best.detectedPoints.map { (x: Double($0.x), y: Double($0.y)) }
    }

    func reset() {
        trackingRequest = nil
        trackingLabel = nil
        recentBoxes = []
        trajectoryRequest = makeTrajectoryRequest()
        latestTrajectoryObservations = []
    }

    // Center-to-center normalized distance and area ratio between two boxes -- both in Vision's
    // own normalized (0-1) box convention, so these are directly comparable across frames with
    // no extra scaling. areaRatio is always expressed as the larger area over the smaller (>=
    // 1), so both a sudden growth and a sudden shrink are caught by the same single threshold
    // check at the call site.
    private static func boxDelta(_ a: CGRect, _ b: CGRect) -> (centerDistance: Double, areaRatio: Double) {
        let centerA = CGPoint(x: a.midX, y: a.midY)
        let centerB = CGPoint(x: b.midX, y: b.midY)
        let centerDistance = Double(hypot(centerA.x - centerB.x, centerA.y - centerB.y))
        let areaA = Double(a.width * a.height)
        let areaB = Double(b.width * b.height)
        let areaRatio: Double
        if areaA > 0 && areaB > 0 {
            areaRatio = max(areaA, areaB) / min(areaA, areaB)
        } else {
            areaRatio = 1
        }
        return (centerDistance, areaRatio)
    }

    // Untuned starting thresholds, same "no real footage to calibrate against yet" caveat as
    // every other heuristic constant in this file. maxPlausibleCenterJump is deliberately
    // generous (over a third of the frame per single sampled frame) -- VNTrackObjectRequest
    // already does its own local search around the previous frame's box, so a jump this large
    // in ONE step is well beyond anything a real implement's actual motion, even airborne,
    // plausibly covers between two adjacent sampled frames.
    private let maxPlausibleCenterJump = 0.35
    private let maxPlausibleAreaRatio = 3.0

    private func isImplausibleJump(from lastBox: CGRect, to newBox: CGRect) -> Bool {
        let delta = AvCoreMlImplementDetector.boxDelta(lastBox, newBox)
        return delta.centerDistance > maxPlausibleCenterJump || delta.areaRatio > maxPlausibleAreaRatio
    }

    private func recordBox(_ box: CGRect) {
        recentBoxes.append(box)
        if recentBoxes.count > boxHistoryWindow { recentBoxes.removeFirst() }
    }

    // Which class VNTrackObjectRequest is currently locked onto, so a stale lock from a
    // previous call (or a previous frame's different targetLabel, if a caller ever changed
    // trackingMode mid-clip -- reset() is the normal way this happens between clips, but this
    // guards the same invariant defensively) never gets treated as this frame's answer for a
    // now-different class. Vision's object tracker follows a pixel region, not a label, so
    // without this a tracked-but-now-wrong-class region would just keep reporting confidently.
    private var trackingLabel: String?

    // How far (as a fraction of the frame, in Vision's own normalized 0-1 space) a FRESH
    // detection's search region extends past the wrist(s) actually driving it -- generous enough
    // to comfortably contain a barbell/dumbbell/kettlebell at a normal grip offset from the hand
    // (unlike extractWorkingFrame's implementWorkingMaxDim, sized for the motion-diff tracker's
    // own much tighter local search), while still meaningfully narrower than the full frame this
    // detector used to scan unconditionally.
    private static let regionMarginFraction: CGFloat = 0.35

    // Vision's own regionOfInterest convention: normalized 0-1, origin bottom-left, same as a
    // VNRecognizedPoint's own location -- so leftWrist/rightWrist (as read straight off
    // observation.recognizedPoint in runPoseAnalysis) plug in with no conversion. Returns nil
    // when neither wrist was found this frame, the same "nothing to anchor a search on" case
    // extractWorkingFrame's own caller already treats as "skip this frame's implement work
    // entirely" for the motion-diff tracker -- track() below applies that same skip specifically
    // to a FRESH detection (see its own comment on why an active track doesn't need this).
    static func regionOfInterest(leftWrist: (x: Double, y: Double)?, rightWrist: (x: Double, y: Double)?) -> CGRect? {
        let xs = [leftWrist?.x, rightWrist?.x].compactMap { $0 }
        let ys = [leftWrist?.y, rightWrist?.y].compactMap { $0 }
        guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else {
            return nil
        }
        let x0 = max(0, CGFloat(minX) - regionMarginFraction)
        let x1 = min(1, CGFloat(maxX) + regionMarginFraction)
        let y0 = max(0, CGFloat(minY) - regionMarginFraction)
        let y1 = min(1, CGFloat(maxY) + regionMarginFraction)
        return CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
    }

    // Vision's normalized (0-1, bottom-left-origin) bounding box for wherever the detector
    // currently believes `targetLabel` is, or nil on any failure -- no model bundled, no
    // confident detection of THIS class yet, or tracking lost this frame. A lost track (or a
    // targetLabel that no longer matches the active lock) clears trackingRequest so a LATER
    // frame can re-detect from scratch (the implement re-entering frame after a full occlusion,
    // or a caller now asking for a different class) rather than staying permanently silent for
    // the rest of the clip.
    //
    // regionOfInterest only ever narrows a FRESH detection (below) -- an already-locked
    // VNTrackObjectRequest (right below) does its own local search around the previous frame's
    // box already, via Vision's own tracking algorithm, so applying a wrist-anchored region on
    // top of that would be redundant at best and could clip a fast-moving implement that's
    // legitimately drifted outside the margin at worst. nil regionOfInterest (no wrist this
    // frame) skips a fresh detection outright rather than falling back to a full-frame scan --
    // same "only worth it when there's a wrist to anchor on" precedent
    // extractWorkingFrame's own caller already established for the motion-diff tracker.
    func track(pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation, targetLabel: String, regionOfInterest: CGRect?) -> (box: CGRect, confidence: Float)? {
        guard let visionModel = visionModel else { return nil }

        if trackingLabel != targetLabel {
            trackingRequest = nil
            trackingLabel = targetLabel
        }

        if let request = trackingRequest {
            do {
                try sequenceHandler.perform([request], on: pixelBuffer, orientation: orientation)
                guard let observation = request.results?.first as? VNDetectedObjectObservation,
                    observation.confidence >= minDetectionConfidence
                else {
                    trackingRequest = nil
                    recentBoxes = []
                    return nil
                }
                let newBox = observation.boundingBox
                // Camera overlord: VNTrackObjectRequest only ever verifies visual continuity
                // of the region it's already following -- it never re-checks "is this still
                // targetLabel" once locked on. A jump this implausible against the recent
                // trend reads as having drifted onto a different, nearby object, not the same
                // one legitimately moving -- force a fresh classification next frame instead
                // of trusting it.
                if let lastBox = recentBoxes.last, isImplausibleJump(from: lastBox, to: newBox) {
                    trackingRequest = nil
                    recentBoxes = []
                    return nil
                }
                // Camera overlord: an entirely independent, physics-based signal -- see
                // detectTrajectory's own comment. Only acts when Vision actually found a
                // confident free-flight trajectory THIS frame (the normal case is no trajectory
                // yet, or none at all, which changes nothing here -- a med-ball throw where the
                // parabola fit simply never fires loses no coverage from this check) AND that
                // trajectory's most recent point disagrees with where VNTrackObjectRequest just
                // said the box is, by more than the same margin the box-consistency check above
                // already treats as implausible for one frame's real motion.
                if trackingLabel == "med_ball",
                   let trajectoryPoints = detectTrajectory(pixelBuffer: pixelBuffer, orientation: orientation),
                   let lastTrajectoryPoint = trajectoryPoints.last {
                    let boxCenter = CGPoint(x: newBox.midX, y: newBox.midY)
                    let trajectoryPoint = CGPoint(x: lastTrajectoryPoint.x, y: lastTrajectoryPoint.y)
                    let disagreement = Double(hypot(boxCenter.x - trajectoryPoint.x, boxCenter.y - trajectoryPoint.y))
                    if disagreement > maxPlausibleCenterJump {
                        trackingRequest = nil
                        recentBoxes = []
                        return nil
                    }
                }
                recordBox(newBox)
                request.inputObservation = observation
                return (newBox, observation.confidence)
            } catch {
                trackingRequest = nil
                recentBoxes = []
                return nil
            }
        }

        guard let regionOfInterest else { return nil }

        let detectRequest = VNCoreMLRequest(model: visionModel)
        detectRequest.imageCropAndScaleOption = .scaleFit
        // Per Apple's documented Vision behavior, a request's regionOfInterest only narrows what
        // gets ANALYZED -- the resulting observation.boundingBox below is still expressed in the
        // full image's own normalized coordinate space, not the region's, so no extra coordinate
        // conversion is needed here or on the JS side reading this detector's output. UNVERIFIED
        // against this specific model/request combination on real hardware (this sandbox has no
        // device to confirm on) -- if a real build ever shows the reported box visibly offset
        // from the actual implement, this assumption is the first place to check.
        detectRequest.regionOfInterest = regionOfInterest
        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
        // Vision doesn't guarantee these come back sorted by confidence -- taking the max
        // explicitly rather than assuming .first is the best candidate. The bundled model knows
        // 8 classes total (see this class's own header comment); filtering to exactly
        // targetLabel here (not just "any confident detection") is what keeps, say, a barbell
        // call from seeding its tracker off a plate sitting on the same rack, or a med-ball call
        // from seeding off a kettlebell in the background -- every other class's detection is
        // real signal, just not for THIS call.
        guard (try? handler.perform([detectRequest])) != nil,
            let results = detectRequest.results as? [VNRecognizedObjectObservation],
            let best = results
                .filter({ $0.labels.first?.identifier == targetLabel })
                .max(by: { $0.confidence < $1.confidence }),
            best.confidence >= minDetectionConfidence
        else { return nil }

        let seedObservation = VNDetectedObjectObservation(boundingBox: best.boundingBox)
        let newRequest = VNTrackObjectRequest(detectedObjectObservation: seedObservation)
        newRequest.trackingLevel = .accurate
        trackingRequest = newRequest
        // Fresh acquisition -- recentBoxes restarts clean rather than comparing against
        // whatever a previous, unrelated lock last reported.
        recentBoxes = [best.boundingBox]
        return (best.boundingBox, best.confidence)
    }
}

// Handheld camera shake corrupts velocity data -- if the coach's hands move
// while filming, that camera movement is mathematically indistinguishable
// from the implement itself moving, showing up as spurious spikes in the
// tracked velocity readout. This measures how much the CAMERA moved (via
// Apple's own VNTranslationalImageRegistrationRequest, comparing each frame's
// background against the clip's first frame -- one steady reference point,
// not frame-to-frame, so small per-step errors can't compound into drift of
// their own), so a caller can later subtract it back out of the implement's
// tracked X/Y. Same "med-ball only for now" scope and same complete-no-op-
// on-failure guarantee as AvCoreMlImplementDetector above -- this is a
// signal to subtract out, never something recording or analysis depends on.
private final class AvCameraStabilizer {
    private var referenceBuffer: CVPixelBuffer?

    func reset() {
        referenceBuffer = nil
    }

    // Cumulative (x, y) drift of this frame's background relative to the
    // clip's first analyzed frame, normalized the same 0-1 way every other
    // coordinate in this file is (divided by the same orientation-corrected
    // frameWidth/frameHeight every caller already has on hand). nil on the
    // very first frame (nothing to compare against yet -- that frame
    // becomes the reference) or if Vision's registration itself fails.
    func drift(
        for pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation,
        frameWidth: Int, frameHeight: Int
    ) -> (x: Double, y: Double)? {
        guard let reference = referenceBuffer else {
            referenceBuffer = pixelBuffer
            return nil
        }
        guard frameWidth > 0, frameHeight > 0 else { return nil }

        let request = VNTranslationalImageRegistrationRequest(
            targetedCVPixelBuffer: pixelBuffer, orientation: orientation
        )
        let handler = VNImageRequestHandler(cvPixelBuffer: reference, orientation: orientation, options: [:])
        guard (try? handler.perform([request])) != nil,
            let observation = request.results?.first as? VNImageTranslationAlignmentObservation
        else { return nil }

        let transform = observation.alignmentTransform
        return (x: Double(transform.tx) / Double(frameWidth), y: Double(transform.ty) / Double(frameHeight))
    }
}

// Swift port of client/src/lib/implement-tracking.ts's ImplementTracker for the
// AVFoundation + Vision pipeline -- see that file's own header comment for the
// algorithm itself (motion-diff, not object recognition: whatever moves in sync with
// the athlete's own wrist, frame to frame, is what they're holding). One instance
// tracks one hand, same as both existing ports (implement-tracking.ts's own
// ImplementTracker and ArImplementTracker.swift) -- a caller tracking a single
// implement (a thrown medicine ball, not a two-handed bar) uses the left instance
// alone and ignores the right.
//
// Unlike both of those, this reports its result directly in Vision's own normalized,
// bottom-left-origin joint convention (0-1, relative to the oriented frame's own
// width/height) rather than meters or an ARKit world position. There's no real depth
// in this pipeline (see AvBodyTrackingPlugin's own file comment on why), and unlike
// implement-tracking.ts this plugin's caller (the JS bridge) already defers ALL
// pixel-to-meters conversion, for every joint, to pose-tracking.ts's own calibration
// functions, after the fact -- reporting the implement in that identical raw
// convention means it flows through that same existing path with zero new conversion
// code on the JS side, rather than reproducing either existing tracker's own meters
// math. That also makes the state machine itself simpler than both ports it's
// descended from: with no unit conversion to perform, the tracker's own held "lock"
// position IS the reported position, with no separate delta-accumulation
// (implement-tracking.ts) or per-frame unprojection (ArImplementTracker.swift) needed
// to get there.
private final class AvImplementTracker {
    // Untuned starting values, same as both ports this descends from -- there's no
    // camera to tune any of them against in this environment (see
    // implement-tracking.ts's own comment on MOTION_DIFF_THRESHOLD).
    private let motionDiffThreshold = 18
    private let searchRadiusFraction = 0.22
    private let minHotPixels = 6
    private let minWristSpeedPx = 1.0
    private let lockRampFrames = 3.0
    // Was 0.45 (nearly half the frame's shorter side) -- generous enough
    // that a rack post or a spotter's arm well away from the wrist could
    // still register as "plausible" and let a lock wander onto it
    // undetected. Tightened to a value that still covers a
    // kettlebell/med-ball's real offset from the hand without leaving that
    // much room for a lock to drift onto an unrelated object. See
    // implement-tracking.ts's own comment on this same constant -- still a
    // starting point, not tuned against real footage.
    private let maxLockDriftFraction = 0.3
    // How many recent frames' drift-from-wrist ratio to average when
    // scoring a held lock's confidence -- see driftRatioHistory below and
    // implement-tracking.ts's matching DRIFT_HISTORY_WINDOW.
    //
    // FUTURE CALIBRATION NOTE (both this and maxLockDriftFraction above):
    // picked by reasoning, not measured against a real recorded set -- see
    // implement-tracking.ts's matching note for the full reasoning. Once
    // real device testing gives actual numbers to react to, adjust these
    // in SMALL increments first rather than swinging back toward the old
    // looser values -- only jump further if a small nudge clearly isn't
    // enough.
    private let driftHistoryWindow = 5

    struct ColorSignature {
        var r: Double
        var g: Double
        var b: Double
    }

    struct TrackResult {
        // Vision's own normalized [0,1], bottom-left-origin convention -- see this
        // class's own comment for why, and vision-body-landmarks.ts for the bridge
        // that turns this (like every joint) into real pixels and, eventually, meters.
        var x: Double
        var y: Double
        // 0-1, ramping up over lockRampFrames of continuous, unbroken lock -- same
        // meaning as both ports this is descended from.
        var confidence: Double
        var color: ColorSignature?
    }

    private var prevLuma: [UInt8]?
    private var prevWidth = 0
    private var prevHeight = 0
    private var prevWristX: Double = 0
    private var prevWristY: Double = 0

    private var lockPixelX: Double?
    private var lockPixelY: Double?
    private var lockStreak: Double = 0
    private var lastColor: ColorSignature?
    // Rolling window of how far each recent frame's tracked point landed
    // from the wrist, as a fraction of maxLockDriftFraction's own limit (0
    // = right on the wrist, 1 = at the edge of what's still allowed as
    // "plausible"). lockStreak alone used to be the only input to
    // confidence, which meant a lock that had wandered to the very edge of
    // plausibility reported the exact same full confidence as one still
    // sitting right on the wrist, as long as both had held for
    // lockRampFrames -- see implement-tracking.ts's matching
    // driftRatioHistory for the full reasoning.
    private var driftRatioHistory: [Double] = []
    // Camera overlord: rolling window of recent REPORTED confidence values (after any
    // suppression already applied), separate from driftRatioHistory -- catches an isolated,
    // extreme dip in an otherwise well-tracked rep (see checkForSuspiciousDip below), not the
    // same signal as drift-from-wrist at all. Same driftHistoryWindow size, no reason for a
    // second window-size constant.
    private var confidenceHistory: [Double] = []

    func reset() {
        prevLuma = nil
        prevWidth = 0
        prevHeight = 0
        dropLock()
    }

    private func dropLock() {
        lockPixelX = nil
        lockPixelY = nil
        lockStreak = 0
        lastColor = nil
        driftRatioHistory = []
        confidenceHistory = []
    }

    // Average of driftRatioHistory, 0 (perfectly on the wrist) when
    // nothing's been recorded yet -- confidence() below multiplies this in
    // as a proximity factor alongside the existing streak-based ramp.
    private func avgDriftRatio() -> Double {
        guard !driftRatioHistory.isEmpty else { return 0 }
        return driftRatioHistory.reduce(0, +) / Double(driftRatioHistory.count)
    }

    private func confidence() -> Double {
        min(1.0, lockStreak / lockRampFrames) * (1 - avgDriftRatio())
    }

    // Camera overlord, check 1 of 2 -- a lock that's technically "plausible" (within
    // maxLockDriftFraction) but has spent its whole recent history hugging the very edge of
    // that boundary, rather than sitting reasonably close to the wrist, is a suspicious
    // pattern: a real held implement stays reasonably close to the hand frame to frame; a
    // lock that's wandered onto something else nearby (a rack post, a training partner's arm)
    // but just barely stays inside the drift ceiling looks exactly like this, and would
    // otherwise keep climbing toward full confidence via lockStreak alone. Only fires once the
    // rolling window is genuinely full (driftHistoryWindow samples), so a single noisy frame
    // can't trigger it -- this is about a sustained pattern, not one reading. Untuned starting
    // threshold, same "no real footage to calibrate against yet" caveat as every other
    // heuristic constant in this file.
    private let suspiciousDriftThreshold = 0.7

    private func isSuspiciousLock() -> Bool {
        driftRatioHistory.count == driftHistoryWindow && avgDriftRatio() > suspiciousDriftThreshold
    }

    // Camera overlord, check 2 of 2 -- an isolated, extreme confidence dip in the middle of an
    // otherwise well-tracked rep is much more likely a single bad frame (motion blur, a
    // momentary occlusion) than a genuine change in tracking quality; reporting it as-is would
    // read as a real, wrong number rather than the noise it almost certainly is. Compares
    // against the PRE-this-frame rolling average specifically so a real anomaly can't drag
    // down its own baseline before being judged against it -- caller is responsible for
    // pushing `current` into confidenceHistory only AFTER calling this. Requires the recent
    // trend to have been reasonably good before this fires at all -- a rep that's already
    // tracking poorly throughout doesn't get a "dip" flagged on top of already-low numbers,
    // since there's no established good baseline to compare against. Untuned starting
    // thresholds, same caveat as every other heuristic constant in this file.
    private let minHistoryForDipCheck = 3
    private let dipRecentAvgFloor = 0.5
    private let dipRatioThreshold = 0.3

    private func isSuspiciousDip(current: Double) -> Bool {
        guard confidenceHistory.count >= minHistoryForDipCheck else { return false }
        let recentAvg = confidenceHistory.reduce(0, +) / Double(confidenceHistory.count)
        return recentAvg > dipRecentAvgFloor && current < recentAvg * dipRatioThreshold
    }

    // Pushes into confidenceHistory and applies the fixed window size -- the one place both
    // callers of confidenceHistory.append should go through, so the window-size bookkeeping
    // can't drift out of sync between them.
    private func recordConfidence(_ value: Double) {
        confidenceHistory.append(value)
        if confidenceHistory.count > driftHistoryWindow { confidenceHistory.removeFirst() }
    }

    // Same escape hatch as both ports this descends from -- a caller-side fusion
    // (av-bar-tracker-dialog.tsx) that decides this frame's reported point disagreed
    // with the wrist by more than any real implement plausibly could calls this to
    // force a clean reacquisition next frame instead of continuing to dead-reckon from
    // a position just flagged as wrong.
    func rejectLock() {
        dropLock()
    }

    // rgba/luma: the current frame's downscaled working-resolution buffers (see
    // AvBodyTrackingPlugin.extractWorkingFrame), row-major, top-left origin,
    // width*height (luma) / width*height*4 (rgba). wristX/wristY: the tracked wrist
    // joint (or wrist midpoint for a two-handed grip), already converted into this
    // SAME working-resolution top-left-origin pixel space -- centers the search
    // window, and, on a fresh acquisition, seeds the lock directly (this class has no
    // separate "world" position to seed, unlike both ports it's descended from, so
    // seeding just means starting the search there). Only ever called on a frame where
    // the wrist joint was itself confidently detected, matching bar-tracker-dialog.tsx
    // and ar-bar-tracker-dialog.tsx's own existing precedent of never calling track()
    // on a frame with no wrist reading.
    func track(
        rgba: [UInt8],
        luma: [UInt8],
        width: Int,
        height: Int,
        wristX: Double,
        wristY: Double
    ) -> TrackResult? {
        let previousWristX = prevWristX
        let previousWristY = prevWristY
        prevWristX = wristX
        prevWristY = wristY

        guard let prev = prevLuma, prevWidth == width, prevHeight == height else {
            prevLuma = luma
            prevWidth = width
            prevHeight = height
            dropLock()
            return nil
        }
        prevLuma = luma
        prevWidth = width
        prevHeight = height

        let wristSpeed = hypot(wristX - previousWristX, wristY - previousWristY)
        if wristSpeed < minWristSpeedPx {
            // A stationary implement (top of a squat, a paused bench press) hasn't
            // moved -- nothing new to search for, but no reason to believe an
            // already-held lock is suddenly wrong. Same "hold, don't drop" reasoning
            // as both ports this descends from.
            if let lx = lockPixelX, let ly = lockPixelY {
                return TrackResult(
                    x: lx / Double(width),
                    y: 1.0 - (ly / Double(height)),
                    confidence: confidence(),
                    color: lastColor
                )
            }
            return nil
        }

        let maxDrift = maxLockDriftFraction * Double(min(width, height))
        let hasPlausibleLock: Bool
        if let lx = lockPixelX, let ly = lockPixelY {
            hasPlausibleLock = hypot(lx - wristX, ly - wristY) < maxDrift
        } else {
            hasPlausibleLock = false
        }
        let searchX = hasPlausibleLock ? lockPixelX! : wristX
        let searchY = hasPlausibleLock ? lockPixelY! : wristY

        guard let centroid = AvImplementTracker.findMotionCentroid(
            curr: luma,
            prev: prev,
            width: width,
            height: height,
            centerX: searchX,
            centerY: searchY,
            searchRadiusFraction: searchRadiusFraction,
            motionDiffThreshold: motionDiffThreshold,
            minHotPixels: minHotPixels
        ) else {
            dropLock()
            return nil
        }

        lockPixelX = centroid.x
        lockPixelY = centroid.y
        lockStreak = hasPlausibleLock ? lockStreak + 1 : 1
        lastColor = AvImplementTracker.sampleColor(rgba: rgba, width: width, height: height, x: centroid.x, y: centroid.y)

        // How far THIS frame's freshly-found point landed from the wrist,
        // against the same maxDrift the plausibility check above uses --
        // pushed into the rolling window before reading it back out in
        // confidence() below, so this frame's own reading is already
        // counted in its own score.
        let driftRatio = min(1.0, hypot(centroid.x - wristX, centroid.y - wristY) / maxDrift)
        driftRatioHistory.append(driftRatio)
        if driftRatioHistory.count > driftHistoryWindow { driftRatioHistory.removeFirst() }

        // Camera overlord check 1: a lock that's spent its whole recent history hugging the
        // edge of plausibility, rather than sitting near the wrist, is more likely wandered
        // onto the wrong object than a real held implement -- force a fresh reacquisition
        // instead of reporting a confidently-climbing number on it.
        if isSuspiciousLock() {
            dropLock()
            return nil
        }

        let rawConfidence = confidence()

        // Camera overlord check 2: an isolated, extreme dip against an otherwise-good recent
        // trend reads as a single bad frame, not a real change in tracking quality -- checked
        // against history BEFORE this frame's own reading is recorded into it, so the dip
        // can't skew its own baseline.
        if isSuspiciousDip(current: rawConfidence) {
            recordConfidence(rawConfidence)
            return nil
        }
        recordConfidence(rawConfidence)

        return TrackResult(
            x: centroid.x / Double(width),
            y: 1.0 - (centroid.y / Double(height)),
            confidence: rawConfidence,
            color: lastColor
        )
    }

    // Direct port of implement-tracking.ts's own findMotionCentroid -- see that file's
    // comment for the reasoning behind each constant. Scans every pixel in the search
    // window, not strided (unlike ArImplementTracker.swift's full-sensor-resolution
    // version) -- this already runs against the same ~160px-max working resolution the
    // JS version does, so a full scan is just as cheap here.
    private static func findMotionCentroid(
        curr: [UInt8],
        prev: [UInt8],
        width: Int,
        height: Int,
        centerX: Double,
        centerY: Double,
        searchRadiusFraction: Double,
        motionDiffThreshold: Int,
        minHotPixels: Int
    ) -> (x: Double, y: Double)? {
        let radius = max(6.0, (searchRadiusFraction * Double(min(width, height))).rounded())
        let left = max(0, Int((centerX - radius).rounded()))
        let right = min(width, Int((centerX + radius).rounded()))
        let top = max(0, Int((centerY - radius).rounded()))
        let bottom = min(height, Int((centerY + radius).rounded()))
        guard left < right, top < bottom else { return nil }

        var sumX = 0.0
        var sumY = 0.0
        var hotCount = 0
        var y = top
        while y < bottom {
            let rowOffset = y * width
            var x = left
            while x < right {
                let idx = rowOffset + x
                let diff = abs(Int(curr[idx]) - Int(prev[idx]))
                if diff >= motionDiffThreshold {
                    sumX += Double(x)
                    sumY += Double(y)
                    hotCount += 1
                }
                x += 1
            }
            y += 1
        }
        guard hotCount >= minHotPixels else { return nil }
        return (x: sumX / Double(hotCount), y: sumY / Double(hotCount))
    }

    // Average RGB in a small neighborhood around the found centroid, for
    // implement-appearance-memory.ts's existing corroboration feature -- same
    // reasoning as implement-tracking.ts's own sampleAverageColor (a few-pixel average
    // is stable without smearing across the implement's actual edge; a single pixel is
    // too noisy).
    private static func sampleColor(rgba: [UInt8], width: Int, height: Int, x: Double, y: Double) -> ColorSignature? {
        let radius = 2
        let cx = Int(x.rounded())
        let cy = Int(y.rounded())
        let left = max(0, cx - radius)
        let right = min(width, cx + radius + 1)
        let top = max(0, cy - radius)
        let bottom = min(height, cy + radius + 1)
        guard left < right, top < bottom else { return nil }

        var r = 0.0
        var g = 0.0
        var b = 0.0
        var count = 0
        var sy = top
        while sy < bottom {
            var sx = left
            while sx < right {
                let idx = (sy * width + sx) * 4
                r += Double(rgba[idx])
                g += Double(rgba[idx + 1])
                b += Double(rgba[idx + 2])
                count += 1
                sx += 1
            }
            sy += 1
        }
        guard count > 0 else { return nil }
        return ColorSignature(r: r / Double(count), g: g / Double(count), b: b / Double(count))
    }
}
