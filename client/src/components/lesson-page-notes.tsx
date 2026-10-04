import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getJson } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { NotebookPen } from "lucide-react";

type Note = { pageIndex: number; body: string; updatedAt: string };

/** An athlete's own note on one lesson page (2026-10-04). Saved a second after typing stops
 * and again when the page is left, so nothing is lost to a Next tap. The coach who enrolled
 * the athlete can read these on the class roster, and the panel says so. */
export function LessonPageNotes({ classId, lessonId, pageIndex }: { classId: number; lessonId: number; pageIndex: number }) {
  const qc = useQueryClient();
  const url = `/api/athlete/classes/${classId}/lessons/${lessonId}/notes`;
  const { data } = useQuery<{ notes: Note[] }>({ queryKey: [url], queryFn: () => getJson(url) });
  const notes = data?.notes;
  return notes ? <PageNote key={pageIndex} url={url} pageIndex={pageIndex} initial={notes.find((n) => n.pageIndex === pageIndex)?.body ?? ""} onSaved={() => qc.invalidateQueries({ queryKey: [url] })} /> : null;
}

function PageNote({ url, pageIndex, initial, onSaved }: { url: string; pageIndex: number; initial: string; onSaved: () => void }) {
  return (
    <DebouncedNote
      initial={initial}
      title="My notes on this page"
      placeholder="What stood out, a question for your coach, a cue to remember…"
      savedLine="Saved. Your coach can read your notes."
      emptyLine="Only you and your coach can see these."
      save={async (text) => {
        await apiRequest("PUT", url, { pageIndex, body: text });
        onSaved();
      }}
    />
  );
}

/** The note box itself: saved a second after typing stops, on blur, and when unmounted.
 * Shared by the athlete's page notes and the coach's Coaches Corner lesson note, which differ
 * only in where the save goes and who else can read it. */
export function DebouncedNote({
  initial,
  title,
  placeholder,
  savedLine,
  emptyLine,
  save,
}: {
  initial: string;
  title: string;
  placeholder: string;
  savedLine: string;
  emptyLine: string;
  save: (text: string) => Promise<void>;
}) {
  const [body, setBody] = useState(initial);
  const [open, setOpen] = useState(initial.trim().length > 0);
  const latest = useRef(body);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = body;

  const mutation = useMutation({
    mutationFn: async (text: string) => {
      await save(text);
      saved.current = text;
    },
  });
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    if (latest.current !== saved.current) mutation.mutate(latest.current);
  };
  useEffect(() => {
    if (body === saved.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);
  // Leaving the page (Next, Back, close) saves whatever is pending.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => flush(), []);

  return (
    <div className="rounded-md border border-dashed border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-muted-foreground"
        aria-expanded={open}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        {title}
        {!open && body.trim() && <span className="ml-auto font-normal">saved</span>}
      </button>
      {open && (
        <div className="space-y-1 px-3 pb-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={flush}
            rows={3}
            placeholder={placeholder}
            className="text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            {mutation.isPending ? "Saving…" : body !== saved.current ? "Unsaved" : body.trim() ? savedLine : emptyLine}
          </p>
        </div>
      )}
    </div>
  );
}
