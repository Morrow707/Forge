import fs from "fs/promises";
import path from "path";
import { storage } from "./storage";
import { extractPdf, splitIntoPassages } from "./pdf-extract";
import { tagPassages } from "./passage-tagging";
import { UPLOADS_ROOT } from "./uploaded-files";
import { recordSystemFailure } from "./system-events";

/**
 * Finishes a book whose ingest was cut off by the process stopping.
 *
 * Filing a textbook is a couple of hundred model calls over several minutes, and it runs in this
 * process. A deploy replaces the process, so a book uploaded shortly before one simply stopped
 * partway -- the passages already filed stayed, and the rest were never written. Nothing noticed:
 * the row kept the "extracting" status and a progress bar frozen at whatever fraction it had
 * reached, which reads as work in progress rather than work abandoned. A real ingest sat at 69%
 * of 2,893 passages for hours looking busy.
 *
 * Resumed rather than restarted, because the tagging is the expensive part. The passages already
 * filed are kept and only the remainder is tagged, so an interrupted run costs what it would have
 * cost uninterrupted instead of twice. Splitting is deterministic -- the same PDF produces the
 * same passages in the same order every time -- so the count already filed is exactly how far in
 * to start again.
 */
export async function resumeInterruptedIngests(): Promise<void> {
  let interrupted: Awaited<ReturnType<typeof storage.getInterruptedIngests>>;
  try {
    interrupted = await storage.getInterruptedIngests();
  } catch (err) {
    recordSystemFailure("storage", "Could not look for interrupted ingests", { detail: err });
    return;
  }
  if (interrupted.length === 0) return;
  console.log(`Resuming ${interrupted.length} interrupted ingest(s).`);

  for (const source of interrupted) {
    try {
      if (!source.filePath) {
        await storage.setKnowledgeProgress(source.id, null, null);
        await storage.setKnowledgeSourceStatus(
          source.id,
          "failed",
          "The ingest was interrupted and the original file is gone. Upload it again.",
        );
        continue;
      }

      const diskPath = path.join(UPLOADS_ROOT, source.filePath.replace(/^\/uploads\//, ""));
      const bytes = await fs.readFile(diskPath);
      const extracted = await extractPdf(bytes);
      const split = splitIntoPassages(extracted.pages);
      const alreadyFiled = await storage.countKnowledgePassages(source.id);

      if (split.length === 0) {
        await storage.setKnowledgeProgress(source.id, null, null);
        await storage.setKnowledgeSourceStatus(
          source.id,
          alreadyFiled > 0 ? "ready" : "failed",
          alreadyFiled > 0
            ? `${alreadyFiled} passage(s) ingested.`
            : "Nothing could be ingested.",
        );
        continue;
      }

      const remaining = split.slice(alreadyFiled);
      if (remaining.length === 0) {
        await storage.setKnowledgeProgress(source.id, null, null);
        await storage.setKnowledgeSourceStatus(
          source.id,
          "ready",
          `${alreadyFiled} passage(s) ingested.`,
        );
        continue;
      }

      console.log(
        `Resuming "${source.title}": ${alreadyFiled} of ${split.length} passages already filed.`,
      );
      await storage.setKnowledgeProgress(
        source.id,
        alreadyFiled,
        split.length,
        "Resuming after a restart...",
      );

      const CHUNK = 120;
      let filed = alreadyFiled;
      for (let i = 0; i < remaining.length; i += CHUNK) {
        const slice = remaining.slice(i, i + CHUNK);
        const tagged = await tagPassages(slice, source.domains, (done) => {
          void storage.setKnowledgeProgress(
            source.id,
            filed + done,
            split.length,
            "Filing passages by subject...",
          );
        });
        filed += await storage.appendKnowledgePassages(source.id, tagged);
        await storage.setKnowledgeProgress(source.id, filed, split.length);
      }

      await storage.setKnowledgeProgress(source.id, null, null);
      await storage.setKnowledgeSourceStatus(
        source.id,
        filed > 0 ? "ready" : "failed",
        filed > 0 ? `${filed} passage(s) ingested.` : "Nothing could be ingested.",
      );
    } catch (err) {
      recordSystemFailure("ai", "Could not resume an interrupted ingest", {
        detail: err,
      });
      await storage.setKnowledgeProgress(source.id, null, null).catch(() => {});
      await storage
        .setKnowledgeSourceStatus(
          source.id,
          "failed",
          "The ingest was interrupted and could not be resumed. Re-upload this file to replace it.",
        )
        .catch(() => {});
    }
  }
}
