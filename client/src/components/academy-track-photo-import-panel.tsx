import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhotoUploadField } from "@/components/photo-upload-field";
import type { CapturedPhoto } from "@/lib/photo-capture";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";

type PhotoDraftLesson = { lessonNumber?: number; title: string; content: string; estMinutes: number | null };
export type PhotoDraftStructure = {
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  lessons: PhotoDraftLesson[];
};

/** Inline counterpart to ProgramPhotoImportDialog -- unlike that one (which
 * creates the record immediately and navigates away), this hands the draft
 * back to the builder page it lives inside via onDraft so the admin sees it
 * land in the form fields on the left and can review/edit before ever
 * saving, instead of a photo import silently becoming a saved record. */
export function AcademyTrackPhotoImportPanel({
  onDraft,
}: {
  onDraft: (structure: PhotoDraftStructure, note: string | null) => void;
}) {
  const [images, setImages] = useState<CapturedPhoto[]>([]);

  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/academy/tracks/photo-draft", { images });
      return res.json() as Promise<{ structure: PhotoDraftStructure; note: string | null } | null>;
    },
    onSuccess: (draft) => {
      if (!draft) {
        toast.error("Couldn't read that photo -- try a clearer shot");
        return;
      }
      onDraft(draft.structure, draft.note);
      setImages([]);
      toast.success("Added from photo -- review it before saving");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not read that photo"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImagePlus className="h-4 w-4" />
          Import from Photo
        </CardTitle>
        <CardDescription>
          Photograph or screenshot a document, outline, or slides -- it fills in the fields to the left for
          you to review and edit before saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <PhotoUploadField images={images} onChange={setImages} maxImages={4} />
        <Button
          type="button"
          className="w-full"
          disabled={images.length === 0 || draftMutation.isPending}
          onClick={() => draftMutation.mutate()}
        >
          {draftMutation.isPending ? "Reading..." : "Generate from Photo"}
        </Button>
      </CardContent>
    </Card>
  );
}
