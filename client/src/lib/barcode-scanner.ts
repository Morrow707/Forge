import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

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
        else if (err && err.name !== "NotFoundException") onError?.(err);
      },
    );
  }

  stop(): void {
    this.controls?.stop();
    this.controls = null;
  }
}
