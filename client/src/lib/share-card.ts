// Client-side canvas rendering for shareable PR/workout image cards --
// deliberately drawn entirely in the browser (no server round-trip, no
// server-side rendering dependency) since a Canvas 2D context is all this
// needs and every target device already has one.
const WIDTH = 1080;
const HEIGHT = 1350;

// Matches the app's CSS custom properties (client/src/index.css) so a
// shared card looks like it came from the same product, not a bolt-on.
const COLOR = {
  background: "#0f1115",
  backgroundGlow: "#2a1710",
  primary: "#f65b23",
  foreground: "#f5f5f5",
  muted: "#9a9aa0",
  success: "#21c45d",
};

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT * 0.28,
    0,
    WIDTH / 2,
    HEIGHT * 0.28,
    WIDTH * 0.75,
  );
  glow.addColorStop(0, COLOR.backgroundGlow);
  glow.addColorStop(1, COLOR.background);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawHeader(ctx: CanvasRenderingContext2D) {
  const size = 56;
  const x = 64;
  const y = 64;
  ctx.fillStyle = COLOR.primary;
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + size, y, x + size, y + size, r);
  ctx.arcTo(x + size, y + size, x, y + size, r);
  ctx.arcTo(x, y + size, x, y, r);
  ctx.arcTo(x, y, x + size, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOR.background;
  ctx.font = "bold 36px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("F", x + size / 2, y + size / 2 + 2);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = "800 40px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("FORGE", x + size + 20, y + size / 2 + 2);
}

function drawFooter(ctx: CanvasRenderingContext2D, dateLabel: string) {
  ctx.fillStyle = COLOR.muted;
  ctx.font = "500 30px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(dateLabel, WIDTH / 2, HEIGHT - 72);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
  return lines.length;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Couldn't render that image"));
    }, "image/png");
  });
}

export async function renderPrShareCard(data: {
  athleteName: string;
  exerciseName: string;
  weight: number;
  unit: string;
  reps: string;
  dateLabel: string;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  drawBackground(ctx);
  drawHeader(ctx);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COLOR.primary;
  ctx.font = "800 52px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.fillText("NEW PERSONAL RECORD", WIDTH / 2, HEIGHT * 0.34);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = "700 64px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  wrapText(ctx, data.exerciseName, WIDTH / 2, HEIGHT * 0.44, WIDTH - 160, 72);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = "900 170px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.fillText(`${data.weight}`, WIDTH / 2, HEIGHT * 0.6);

  ctx.fillStyle = COLOR.muted;
  ctx.font = "600 48px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.fillText(`${data.unit} × ${data.reps} reps`, WIDTH / 2, HEIGHT * 0.68);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = "700 44px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.fillText(data.athleteName, WIDTH / 2, HEIGHT * 0.8);

  drawFooter(ctx, data.dateLabel);

  return canvasToPngBlob(canvas);
}

export async function renderWorkoutShareCard(data: {
  athleteName: string;
  workoutTitle: string;
  totalReps: number;
  totalVolume: number;
  volumeUnit: string;
  exerciseCount: number;
  dateLabel: string;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d")!;

  drawBackground(ctx);
  drawHeader(ctx);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = COLOR.success;
  ctx.font = "800 52px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.fillText("WORKOUT COMPLETE", WIDTH / 2, HEIGHT * 0.3);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = "700 60px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  wrapText(ctx, data.workoutTitle, WIDTH / 2, HEIGHT * 0.4, WIDTH - 160, 68);

  const stats: [string, string][] = [
    [`${data.totalReps}`, "Total Reps"],
    [`${Math.round(data.totalVolume).toLocaleString()}`, `${data.volumeUnit} Volume`],
    [`${data.exerciseCount}`, "Exercises"],
  ];
  const colWidth = WIDTH / stats.length;
  const statY = HEIGHT * 0.58;
  stats.forEach(([value, label], i) => {
    const cx = colWidth * i + colWidth / 2;
    ctx.fillStyle = COLOR.primary;
    ctx.font = "900 88px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
    ctx.fillText(value, cx, statY);
    ctx.fillStyle = COLOR.muted;
    ctx.font = "600 32px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
    ctx.fillText(label, cx, statY + 70);
  });

  ctx.fillStyle = COLOR.foreground;
  ctx.font = "700 44px system-ui, -apple-system, Segoe UI, Arial, sans-serif";
  ctx.fillText(data.athleteName, WIDTH / 2, HEIGHT * 0.78);

  drawFooter(ctx, data.dateLabel);

  return canvasToPngBlob(canvas);
}
