import { escapeHtml } from "./email";

/** THE TWO EMAILS A COACH CAN SEND THEIR ROSTER ABOUT PAPERWORK.
 *
 * Both used to be in-app only, or not exist at all. An in-app notification reaches the person
 * who opens the app, and the person who has to act on a missing medical clearance is usually a
 * parent who does not -- so the request went to the wrong inbox, or to none. See
 * storage.requestDocuments for who receives which: an adult athlete gets their own; a minor's
 * linked guardians get it about the child.
 *
 * Every free-text field (a coach's name, a child's name, a document label) is escaped, same as
 * every other builder in this codebase -- see escapeHtml's own comment for why it is not optional.
 */

function shell(title: string, body: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111;">
      <div style="background:#F65B23;padding:20px 24px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:0.5px;">FORGE</span>
      </div>
      <div style="padding:24px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
        ${body}
      </div>
    </div>
  `;
}

const button = (href: string, text: string) =>
  `<p style="margin:16px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#F65B23;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">${escapeHtml(text)}</a></p>`;

/** "Your coach needs these on file." The same wording the in-app notification carries, so a
 * person who sees both is not left comparing two different lists. */
export function buildDocumentsRequestEmail(input: {
  recipientName: string;
  /** Null when the recipient is the athlete themselves; the child's name when it is a guardian. */
  athleteName: string | null;
  coachName: string | null;
  missing: string[];
  link: string;
}): string {
  const from = input.coachName ? escapeHtml(input.coachName) : "Your coach";
  const list = input.missing.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
  const whose = input.athleteName ? `for ${escapeHtml(input.athleteName)}` : "";
  const title = input.athleteName
    ? `Documents needed for ${escapeHtml(input.athleteName)}`
    : "Documents needed";
  return shell(
    title,
    `
      <p style="color:#555;margin:0 0 12px;">
        ${escapeHtml(input.recipientName)}, ${from} needs these on file ${whose}:
      </p>
      <ul style="color:#555;margin:0 0 12px;">${list}</ul>
      <p style="color:#555;margin:0 0 4px;">
        You can upload a photo or a PDF from ${input.athleteName ? "their" : "your"} Documents page.
        If the school or club already had it signed, that copy is fine.
      </p>
      ${button(input.link, "Open the Documents page")}
      <p style="color:#999;font-size:12px;margin:0;">
        You are receiving this because ${
          input.athleteName
            ? "you are listed as a parent or guardian on a Forge account"
            : "a coach on Forge has you on their roster"
        }.
      </p>
    `,
  );
}

/** A coach sending a public legal document to their roster. The document itself is a link, not
 * an attachment: sendEmail carries no attachments, and a link to the live page cannot go stale
 * in an inbox the way a PDF copy does. The PDF link is there too for anyone who wants a copy. */
export function buildRosterDocumentEmail(input: {
  recipientName: string;
  athleteName: string | null;
  coachName: string | null;
  documentTitle: string;
  pageLink: string;
  pdfLink: string;
}): string {
  const from = input.coachName ? escapeHtml(input.coachName) : "Your coach";
  const about = input.athleteName
    ? `It covers ${escapeHtml(input.athleteName)}'s use of Forge, and because they are under 18 it is for you to read.`
    : "It covers your use of Forge.";
  return shell(
    `${from} sent you Forge's ${escapeHtml(input.documentTitle)}`,
    `
      <p style="color:#555;margin:0 0 12px;">
        ${escapeHtml(input.recipientName)}, ${from} asked us to send you a copy of the
        <strong>${escapeHtml(input.documentTitle)}</strong>. ${about}
      </p>
      ${button(input.pageLink, `Read the ${input.documentTitle}`)}
      <p style="color:#555;margin:0 0 12px;">
        Prefer a copy to keep? <a href="${escapeHtml(input.pdfLink)}">Download it as a PDF</a>.
      </p>
      <p style="color:#999;font-size:12px;margin:0;">
        Nothing in this email changes what you have agreed to. It is a copy for your records.
      </p>
    `,
  );
}
