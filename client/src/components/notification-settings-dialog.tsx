import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Mail, MessageCircle } from "lucide-react";
import type { PublicUser } from "@shared/schema";

export function NotificationSettingsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PublicUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone(user.phone ?? "");
      setNotifyEmail(user.notifyEmail);
      setNotifySms(user.notifySms);
    }
  }, [open, user]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/notification-prefs", {
        phone: phone.trim() || null,
        notifyEmail,
        notifySms,
      });
      return (await res.json()) as PublicUser;
    },
    onSuccess: (updatedUser) => {
      qc.setQueryData(["/api/auth/me"], updatedUser);
      toast.success("Notification settings saved");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save settings"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notification Settings</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You'll only ever hear about an athlete's comment or video upload -- never program
          completions or team-wide activity.
        </p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="notif-phone">Phone number</Label>
            <Input
              id="notif-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Required for text notifications"
            />
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={notifyEmail}
              onCheckedChange={(checked) => setNotifyEmail(checked === true)}
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Mail className="h-3.5 w-3.5" /> Email notifications
              </span>
              <span className="text-xs text-muted-foreground">
                Sent to your account email.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={notifySms}
              disabled={!phone.trim()}
              onCheckedChange={(checked) => setNotifySms(checked === true)}
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <MessageCircle className="h-3.5 w-3.5" /> Text (SMS) notifications
              </span>
              <span className="text-xs text-muted-foreground">
                {phone.trim() ? "Sent to the phone number above." : "Add a phone number first."}
              </span>
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
