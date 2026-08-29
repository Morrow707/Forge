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

/** Photo counterpart to the New Track button on Coaches Corner -- same
 * two-step "get a draft, then create the real track from it" mutation shape
 * as ProgramPhotoImportDialog, just fed by a photographed/screenshotted
 * education document instead of a printed program. Lands the admin in the
 * same full track builder to review before it's ever shown to a coach. */
export function AcademyTrackPhotoImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [images, setImages] = useState<CapturedPhoto[]>([]);

  const importMutation = useMutation({
    mutationFn: async () => {
      const draftRes = await apiRequest("POST", "/api/admin/academy/tracks/photo-draft", { images });
      const draft: { structure: unknown; note: string | null } | null = await draftRes.json();
      if (!draft) return null;
      const res = await apiRequest("POST", "/api/admin/academy/tracks", draft.structure);
      const track = await res.json();
      return { track, note: draft.note };
    },
    onSuccess: (result) => {
      if (!result?.track) {
        toast.error("Couldn't read that photo -- try a clearer shot or build it manually");
        return;
      }
      qc.invalidateQueries({ queryKey: ["/api/admin/academy/tracks"] });
      toast.success("Imported -- review it before it's shown to coaches");
      if (result.note) toast.info(result.note, { duration: 10000 });
      onOpenChange(false);
      setImages([]);
      navigate(`/admin/academy-tracks/${result.track.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not import that track"),
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
          <DialogTitle>Import Track from Photo</DialogTitle>
          <DialogDescription>
            Photograph or screenshot a document, outline, or slides -- it's organized into lessons, then you land
            in the full builder to review before it's shown to coaches.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <PhotoUploadField images={images} onChange={setImages} maxImages={4} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={images.length === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Reading..." : "Import Track"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
