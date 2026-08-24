import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PhotoUploadField } from "@/components/photo-upload-field";
import type { CapturedPhoto } from "@/lib/photo-capture";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";

/** Photo counterpart to the AI Assist prompt dialog on this page -- same
 * two-step "get a draft, then create the real program from it" mutation
 * shape as aiDraftMutation, just fed by a photographed program instead of
 * a text prompt. Lands the coach in the same full builder to review before
 * anything's ever assigned, same as every draft path on this page. See
 * generateProgramDraftFromPhoto's own comment for why this transcribes
 * verbatim rather than applying programming judgment the way the AI-
 * generated draft does. */
export function ProgramPhotoImportDialog({
  open,
  onOpenChange,
  apiBase,
  routeBase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  routeBase: string;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [images, setImages] = useState<CapturedPhoto[]>([]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const draftRes = await apiRequest("POST", `${apiBase}/programs/photo-draft`, { images });
      const draft: { structure: unknown; note: string | null } | null = await draftRes.json();
      if (!draft) return null;
      const res = await apiRequest("POST", `${apiBase}/programs`, draft.structure);
      const program = await res.json();
      return { program, note: draft.note };
    },
    onSuccess: (result) => {
      if (!result?.program) {
        toast.error("Couldn't read that photo -- try a clearer shot or build it manually");
        return;
      }
      qc.invalidateQueries({ queryKey: [`${apiBase}/programs`] });
      toast.success("Imported -- review it before assigning to anyone");
      if (result.note) toast.info(result.note, { duration: 10000 });
      onOpenChange(false);
      setImages([]);
      navigate(`${routeBase}/${result.program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not import that program"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setImages([]);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Program from Photo</DialogTitle>
          <DialogDescription>
            Photograph a printed or handwritten program -- it's transcribed verbatim, then you land in the full
            builder to review before assigning it to anyone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <PhotoUploadField images={images} onChange={setImages} maxImages={6} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={images.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Reading..." : "Import Program"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
