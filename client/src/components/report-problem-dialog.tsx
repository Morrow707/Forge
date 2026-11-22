import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Flag, ImagePlus, X } from "lucide-react";
import { useT } from "@/i18n";

/** Available from every role's account menu (see AppShell) -- free text plus
 * an optional screenshot, sent straight to the Forge team rather than the
 * athlete's coach. The screenshot is uploaded through the same signed-URL
 * gated path as athlete video (server/media-url-signing.ts), since a "here's
 * what's broken" screenshot can just as easily capture someone else's data
 * as anything else in the app. */
export function ReportProblemDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const [location] = useLocation();
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function reset() {
    setMessage("");
    clearPhoto();
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("message", message.trim());
      form.append("path", location);
      if (photo) form.append("photo", photo);
      await apiRequest("POST", "/api/report-problem", form);
    },
    onSuccess: () => {
      toast.success(t("Thanks, we got your report."));
      reset();
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't send that report")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" />
            {t("Report a problem")}
          </DialogTitle>
          <DialogDescription>
            {t("Tell us what happened, a screenshot helps but isn't required. This goes straight to the Forge team, not your coach.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("What went wrong?")}
            rows={4}
            maxLength={2000}
          />
          <div className="space-y-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPhoto(file);
                  setPhotoPreview((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(file);
                  });
                }
                e.target.value = "";
              }}
            />
            {photoPreview ? (
              <div className="relative w-fit">
                <img
                  src={photoPreview}
                  alt={t("Attached screenshot")}
                  className="max-h-40 rounded-md border border-border object-contain"
                />
                <button
                  type="button"
                  onClick={clearPhoto}
                  aria-label={t("Remove photo")}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-3.5 w-3.5" />
                {t("Attach a screenshot")}
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => submitMutation.mutate()} disabled={!message.trim() || submitMutation.isPending}>
            {submitMutation.isPending ? t("Sending…") : t("Send report")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
