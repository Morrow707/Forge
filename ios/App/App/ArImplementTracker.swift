import Foundation
import ARKit
import CoreVideo
import simd

// Swift port of client/src/lib/implement-tracking.ts's ImplementTracker --
// see that file's own header comment for the algorithm's reasoning: there's
// no barbell/dumbbell/kettlebell detection model available (or trainable)
// in this offline-first client, on either platform, so this tracks by
// motion instead of recognition -- whatever moves in sync with the
// athlete's own wrist, frame to frame, is what they're holding. The
// lock/confidence/drift state machine below is a direct, unmodified port
// of that file's; one instance tracks one hand, same as there (a caller
// wanting a two-handed barbell runs two instances, one per wrist, exactly
// like bar-tracker-dialog.tsx's leftImplementTrackerRef/
// rightImplementTrackerRef already do).
//
// What's genuinely different, not just translated: the JS version has no
// real depth, so it has to guess a pixel-to-meter scale from shoulder
// width every frame (see shoulderPixelsPerMeter there) and assume the
// implement is roughly as far from the camera as the shoulders are. This
// version doesn't need that guess -- ARKit already gives a real, tracked
// 3D wrist position every frame, so a found pixel converts to a real world
// position by intersecting the camera ray through that pixel with a plane
// sitting at the wrist's own depth (see unprojectToWristDepth below). The
// implement is right next to the hand holding it, so that's a much
// tighter real-world assumption than shoulder width ever was, and it
// means a found pixel gives an ABSOLUTE world position every frame -- no
// need for the JS version's "advance the lock by the pixel delta since
// last frame, scaled by shoulders" trick, which existed only because JS
// had no way to recover an absolute position directly.
//
// Reads ARFrame.capturedImage directly rather than a canvas -- there's no
// HTML <video> element once ARKit owns the camera (see
// ArCameraPreviewPlugin.swift's own file comment). That buffer is
// kCVPixelFormatType_420YpCbCr8BiPlanarFullRange: plane 0 is the Y (luma)
// channel already, at full capture resolution, so unlike the JS version
// there's no RGB-to-grayscale conversion needed for the motion diff --
// only sampleColor (for implement-appearance-memory.ts's existing
// corroboration feature) needs the CbCr plane too, converted to real RGB.
//
// UNVERIFIED, flagged honestly rather than assumed: this operates in the
// camera's raw captured-image pixel space (landscape, un-rotated -- NOT
// the portrait on-screen space ArCameraPreviewPlugin projects
// hipScreenX/Y into for sprint tracking, a different coordinate system on
// purpose, since that one has to match the display and this one has to
// match capturedImage's own byte layout). The caller projects the wrist
// into that space via camera.projectPoint(_:orientation: .landscapeRight,
// viewportSize: camera.imageResolution) -- .landscapeRight matches every
// ARKit sample project's convention for capturedImage's native sensor
// orientation, but there's no way to confirm that against a real capture
// without a physical device, unlike the two compile-time mistakes CI
// already caught elsewhere in this ARKit conversion. If a real device
// shows the search window offset from the actual implement, this
// orientation is the first thing to check.
final class ArImplementTracker {
    // Grayscale delta (0-255) counted as "this pixel moved" -- same
    // untuned starting value as implement-tracking.ts's own
    // MOTION_DIFF_THRESHOLD (there's no camera to tune either one against
    // in this environment).
    private let motionDiffThreshold = 18
    // Fraction of the captured image's shorter side to search out from the
    // wrist/lock -- same fraction as the JS version's SEARCH_RADIUS_FRACTION;
    // it's dimensionless, so it carries over even though this runs at full
    // sensor resolution instead of a 160px downscale.
    private let searchRadiusFraction = 0.22
    private let minSearchRadius = 40.0
    // Every 4th pixel in each dimension within the search window, not
    // every pixel -- full sensor resolution has far more raw pixels per
    // real-world area than the JS version's 160px-downscaled frame did.
    // Sampling at a stride keeps the hot-pixel count in a range
    // MIN_HOT_PIXELS below (carried over from the JS version's tuning,
    // such as it is) still means something for, without a full separate
    // downscale pass.
    private let pixelStride = 4
    private let minHotPixels = 6
    // Wrist displacement, in captured-image pixels, below which there's
    // nothing to search for -- a stationary implement produces no
    // frame-diff at all, same reasoning as implement-tracking.ts's
    // MIN_WRIST_SPEED_PX.
    private let minWristSpeedPx = 1.0
    private let lockRampFrames = 3.0
    private let maxLockDriftFraction = 0.45

    struct ColorSignature {
        var r: Double
        var g: Double
        var b: Double
    }

    struct TrackResult {
        var world: SIMD3<Float>
        var confidence: Double
        var color: ColorSignature?
    }

    private struct LumaBuffer {
        var bytes: [UInt8]
        var width: Int
        var height: Int
        var bytesPerRow: Int
    }

    private var prevLuma: LumaBuffer?
    private var prevWristX: Double = 0
    private var prevWristY: Double = 0

    private var lockPixelX: Double?
    private var lockPixelY: Double?
    private var lockWorld: SIMD3<Float>?
    private var lockStreak: Double = 0
    private var lastColor: ColorSignature?

    func reset() {
        prevLuma = nil
        dropLock()
    }

    private func dropLock() {
        lockPixelX = nil
        lockPixelY = nil
        lockWorld = nil
        lockStreak = 0
        lastColor = nil
    }

    // Same escape hatch as implement-tracking.ts's rejectLock -- the
    // caller (fusing this against the wrist's own real-world position)
    // calls this when a frame's reported world position disagreed with
    // the wrist by more than any real implement plausibly could, forcing
    // a clean reacquisition next frame instead of continuing to
    // dead-reckon from a position just flagged as wrong.
    func rejectLock() {
        dropLock()
    }

    // wristImageX/Y: the wrist projected into capturedImage's own pixel
    // space (see this class's file comment) -- centers the search window
    // and, on a fresh acquisition, seeds the lock. wristWorld: that same
    // wrist's real ARKit-tracked 3D position -- used only as the depth
    // reference for unprojecting a found pixel into world space, on every
    // frame (not just acquisition -- see the file comment on why this
    // doesn't need the JS version's "only seed on acquisition" split, it
    // gets an absolute position from unprojection every time regardless).
    func track(
        frame: ARFrame,
        wristImageX: Double,
        wristImageY: Double,
        wristWorld: SIMD3<Float>
    ) -> TrackResult? {
        guard let luma = ArImplementTracker.extractLuma(from: frame.capturedImage) else { return nil }

        let previousWristX = prevWristX
        let previousWristY = prevWristY
        prevWristX = wristImageX
        prevWristY = wristImageY

        guard let prev = prevLuma, prev.width == luma.width, prev.height == luma.height else {
            prevLuma = luma
            dropLock()
            return nil
        }
        prevLuma = luma

        let wristSpeed = hypot(wristImageX - previousWristX, wristImageY - previousWristY)
        if wristSpeed < minWristSpeedPx {
            // A stationary implement (top of a squat, a paused bench press)
            // hasn't moved -- nothing new to search for, but no reason to
            // believe an already-held lock is suddenly wrong either. Same
            // "hold, don't drop" reasoning as implement-tracking.ts's own
            // MIN_WRIST_SPEED_PX branch.
            if let lockWorld = lockWorld {
                return TrackResult(world: lockWorld, confidence: min(1, lockStreak / lockRampFrames), color: lastColor)
            }
            return nil
        }

        let maxDrift = maxLockDriftFraction * Double(min(luma.width, luma.height))
        let hasPlausibleLock: Bool
        if let lx = lockPixelX, let ly = lockPixelY {
            hasPlausibleLock = hypot(lx - wristImageX, ly - wristImageY) < maxDrift
        } else {
            hasPlausibleLock = false
        }
        let searchX = hasPlausibleLock ? lockPixelX! : wristImageX
        let searchY = hasPlausibleLock ? lockPixelY! : wristImageY

        guard let centroid = findMotionCentroid(curr: luma, prev: prev, centerX: searchX, centerY: searchY) else {
            dropLock()
            return nil
        }

        guard let world = ArImplementTracker.unprojectToWristDepth(
            frame: frame,
            pixelX: centroid.x,
            pixelY: centroid.y,
            depthReference: wristWorld
        ) else {
            dropLock()
            return nil
        }

        lockWorld = world
        lockStreak = hasPlausibleLock ? lockStreak + 1 : 1
        lockPixelX = centroid.x
        lockPixelY = centroid.y
        lastColor = ArImplementTracker.sampleColor(pixelBuffer: frame.capturedImage, x: centroid.x, y: centroid.y)

        return TrackResult(world: world, confidence: min(1, lockStreak / lockRampFrames), color: lastColor)
    }

    private func findMotionCentroid(
        curr: LumaBuffer,
        prev: LumaBuffer,
        centerX: Double,
        centerY: Double
    ) -> (x: Double, y: Double)? {
        let radius = max(minSearchRadius, searchRadiusFraction * Double(min(curr.width, curr.height)))
        let left = max(0, Int(centerX - radius))
        let right = min(curr.width, Int(centerX + radius))
        let top = max(0, Int(centerY - radius))
        let bottom = min(curr.height, Int(centerY + radius))
        guard left < right, top < bottom else { return nil }

        var sumX = 0.0
        var sumY = 0.0
        var hotCount = 0
        var y = top
        while y < bottom {
            let rowOffset = y * curr.bytesPerRow
            var x = left
            while x < right {
                let idx = rowOffset + x
                let diff = abs(Int(curr.bytes[idx]) - Int(prev.bytes[idx]))
                if diff >= motionDiffThreshold {
                    sumX += Double(x)
                    sumY += Double(y)
                    hotCount += 1
                }
                x += pixelStride
            }
            y += pixelStride
        }
        guard hotCount >= minHotPixels else { return nil }
        return (x: sumX / Double(hotCount), y: sumY / Double(hotCount))
    }

    private static func extractLuma(from pixelBuffer: CVPixelBuffer) -> LumaBuffer? {
        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else { return nil }
        let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let count = bytesPerRow * height
        var bytes = [UInt8](repeating: 0, count: count)
        bytes.withUnsafeMutableBytes { dest in
            memcpy(dest.baseAddress, base, count)
        }
        return LumaBuffer(bytes: bytes, width: width, height: height, bytesPerRow: bytesPerRow)
    }

    // A plane passing through the wrist's own real depth, facing the
    // camera -- reuses the camera's own rotation for the plane's
    // orientation (so its local Z axis points back toward the camera, the
    // orientation unprojectPoint(ontoPlane:) expects) and swaps in the
    // wrist's position for the translation. See the file comment above for
    // why the implement's real depth is safe to stand in for here, and why
    // this replaces implement-tracking.ts's shoulder-width guess.
    private static func unprojectToWristDepth(
        frame: ARFrame,
        pixelX: Double,
        pixelY: Double,
        depthReference: SIMD3<Float>
    ) -> SIMD3<Float>? {
        var planeTransform = frame.camera.transform
        planeTransform.columns.3 = SIMD4<Float>(depthReference.x, depthReference.y, depthReference.z, 1)
        return frame.camera.unprojectPoint(
            CGPoint(x: pixelX, y: pixelY),
            ontoPlane: planeTransform,
            orientation: .landscapeRight,
            viewportSize: frame.camera.imageResolution
        )
    }

    // Real RGB (not raw YCbCr) at the found pixel, for
    // implement-appearance-memory.ts's existing corroboration feature --
    // that module's MAX_RGB_DISTANCE assumes a true 0-255 RGB channel
    // range, and YCbCr's Cb/Cr channels center on 128 rather than 0, so
    // comparing those directly would silently change how sensitive the
    // similarity check is. Standard BT.601 full-range conversion, matching
    // capturedImage's kCVPixelFormatType_420YpCbCr8BiPlanarFullRange.
    private static func sampleColor(pixelBuffer: CVPixelBuffer, x: Double, y: Double) -> ColorSignature? {
        guard CVPixelBufferGetPlaneCount(pixelBuffer) >= 2 else { return nil }
        guard CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }
        guard let yBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0),
              let cbcrBase = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 1) else { return nil }
        let yWidth = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
        let yHeight = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
        guard yWidth > 0, yHeight > 0 else { return nil }
        let yBytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
        let cbcrBytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 1)

        let px = min(max(Int(x), 0), yWidth - 1)
        let py = min(max(Int(y), 0), yHeight - 1)
        let yPtr = yBase.assumingMemoryBound(to: UInt8.self)
        let yValue = Double(yPtr[py * yBytesPerRow + px])

        // CbCr plane is half resolution in both dimensions, interleaved
        // Cb/Cr byte pairs -- BiPlanar 4:2:0's standard layout.
        let cbcrX = px / 2
        let cbcrY = py / 2
        let cbcrPtr = cbcrBase.assumingMemoryBound(to: UInt8.self)
        let cbcrIdx = cbcrY * cbcrBytesPerRow + cbcrX * 2
        let cb = Double(cbcrPtr[cbcrIdx]) - 128
        let cr = Double(cbcrPtr[cbcrIdx + 1]) - 128

        func clamp255(_ v: Double) -> Double { min(255, max(0, v)) }
        let r = clamp255(yValue + 1.402 * cr)
        let g = clamp255(yValue - 0.344136 * cb - 0.714136 * cr)
        let b = clamp255(yValue + 1.772 * cb)
        return ColorSignature(r: r, g: g, b: b)
    }
}
