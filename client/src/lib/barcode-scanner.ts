import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

// Thrown constantly by the decode loop while it's still hunting for a valid
// symbol in frame (partial edge, motion blur, nothing there yet) -- zxing's
// own retry helpers (e.g. scanOneResult) treat all three as "keep scanning,"
// not real failures, so surfacing them as "check permissions" errors would
// be a false alarm on a camera that's working fine. Matched by prefix, not
// exact string, because Vite's dev-mode dependency pre-bundling can end up
// with a duplicate copy of these exception classes, which renames them (e.g.
// "NotFoundException2") to dodge an identifier collision.
const SOFT_DECODE_ERROR_PREFIXES = ["NotFoundException", "ChecksumException", "FormatException"];
function isSoftDecodeError(name: string | undefined): boolean {
  return !!name && SOFT_DECODE_ERROR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Thin wrapper around zxing's continuous video-decode API -- same
 * "wrap the CV library behind a small typed surface" pattern as
 * pose-tracking.ts/bar-tracking.ts use for MediaPipe, just for barcodes
 * instead of pose landmarks. Scans UPC/EAN (retail) and QR/Code128 in one
 * pass since zxing's default reader already covers all of those. */
export class BarcodeScanner {
  private reader = new BrowserMultiFormatReader();
  private controls: IScannerControls | null = null;

  async start(
    videoEl: HTMLVideoElement,
    onDetect: (text: string) => void,
    onError?: (err: unknown) => void,
  ): Promise<void> {
    // Same rear-camera preference as BarTrackerDialog's getUserMedia call --
    // decodeFromConstraints (rather than decodeFromVideoDevice) is what lets
    // us pass facingMode instead of picking a device by id.
    this.controls = await this.reader.decodeFromConstraints(
      { video: { facingMode: "environment" } },
      videoEl,
      (result, err) => {
        if (result) onDetect(result.getText());
        else if (err && !isSoftDecodeError(err.name)) onError?.(err);
      },
    );
  }

  /** Decode from an already-acquired MediaStream instead of requesting a new
   * one, so a caller juggling multiple camera-consuming modes (e.g. barcode
   * scan + photo capture) only has to call getUserMedia once and hand the
   * result around. Passes a clone() to zxing rather than the stream itself,
   * because decodeFromStream's finalizeCallback disposes (stops the tracks
   * of) whatever stream it's given as soon as stop() is called -- a clone's
   * tracks can be stopped independently without killing the shared original
   * still in use elsewhere. */
  async startFromStream(
    stream: MediaStream,
    videoEl: HTMLVideoElement,
    onDetect: (text: string) => void,
    onError?: (err: unknown) => void,
  ): Promise<void> {
    this.controls = await this.reader.decodeFromStream(
      stream.clone(),
      videoEl,
      (result, err) => {
        if (result) onDetect(result.getText());
        else if (err && !isSoftDecodeError(err.name)) onError?.(err);
      },
    );
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
  }
}
