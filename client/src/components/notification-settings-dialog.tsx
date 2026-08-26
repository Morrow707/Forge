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
import { Mail, MessageCircle, Bell, ScanFace, Watch } from "lucide-react";
import type { PublicUser } from "@shared/schema";
import { notificationCategoriesForRole } from "@shared/notification-categories";
import {
  isPushSupported,
  getCurrentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import {
  isNativePushSupported,
  getNativePushPermissionGranted,
  subscribeToNativePush,
  unsubscribeFromNativePush,
} from "@/lib/native-push";
import {
  isBiometricLockSupported,
  isBiometricLockEnabled,
  setBiometricLockEnabled,
  checkBiometryAvailable,
} from "@/lib/biometric-lock";
import {
  isNativeHealthSupported,
  isHealthSyncEnabled,
  enableHealthSync,
  disableHealthSync,
} from "@/lib/native-health";

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
  // Push is per-device, not part of the account -- tracked separately from
  // the other prefs, read straight from this browser's own subscription
  // state rather than the server.
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  // isPushSupported() only ever detects the browser's Web Push APIs, which
  // don't exist inside the native WKWebView -- isNativePushSupported()
  // covers the app there instead, so this checkbox stays visible on both
  // rather than silently disappearing on native.
  const pushSupported = isPushSupported() || isNativePushSupported();
  // Same per-device (not per-account) shape as push above -- a lock
  // screen is a property of this phone, not something to sync across the
  // athlete/coach's other devices.
  const [bioLockAvailable, setBioLockAvailable] = useState(false);
  const [bioLockEnabled, setBioLockEnabled] = useState(false);
  // Same per-device shape as push/bio-lock above -- which watch/tracker is
  // paired is a property of this phone, not the account.
  const [healthSyncEnabled, setHealthSyncEnabledState] = useState(false);
  const [healthSyncBusy, setHealthSyncBusy] = useState(false);
  // Push-channel category prefs -- saved immediately per-toggle, same
  // "no batching, no separate Save step" treatment as push/bio-lock/health
  // sync above, not the phone/email/sms group below.
  const [categoryPrefs, setCategoryPrefs] = useState<Record<string, boolean>>({});
  const categories =
    user.role === "coach" || user.role === "athlete" ? notificationCategoriesForRole(user.role) : [];

  useEffect(() => {
    if (open) {
      setPhone(user.phone ?? "");
      setNotifyEmail(user.notifyEmail);
      setNotifySms(user.notifySms);
      setCategoryPrefs(user.pushNotificationCategoryPrefs ?? {});
      if (isNativePushSupported()) {
        getNativePushPermissionGranted().then(setPushSubscribed);
      } else if (isPushSupported()) {
        getCurrentPushSubscription().then((sub) => setPushSubscribed(!!sub));
      }
      if (isBiometricLockSupported()) {
        checkBiometryAvailable().then(setBioLockAvailable);
        setBioLockEnabled(isBiometricLockEnabled());
      }
      if (isNativeHealthSupported()) {
        setHealthSyncEnabledState(isHealthSyncEnabled());
      }
    }
  }, [open, user]);

  function toggleBiometricLock(next: boolean) {
    setBiometricLockEnabled(next);
    setBioLockEnabled(next);
    toast.success(next ? "Face ID/Touch ID lock enabled" : "Lock screen turned off");
  }

  async function toggleHealthSync(next: boolean) {
    setHealthSyncBusy(true);
    try {
      if (next) {
        await enableHealthSync();
        toast.success("Apple Health sync enabled -- your check-in will pre-fill when available");
      } else {
        disableHealthSync();
        toast.success("Apple Health sync turned off");
      }
      setHealthSyncEnabledState(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Health sync");
    } finally {
      setHealthSyncBusy(false);
    }
  }

  async function togglePush(next: boolean) {
    setPushBusy(true);
    try {
      if (next) {
        await (isNativePushSupported() ? subscribeToNativePush() : subscribeToPush());
        toast.success("Push notifications enabled on this device");
      } else {
        await (isNativePushSupported() ? unsubscribeFromNativePush() : unsubscribeFromPush());
        toast.success("Push notifications turned off on this device");
      }
      setPushSubscribed(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update push notifications");
    } finally {
      setPushBusy(false);
    }
  }

  const categoryPrefMutation = useMutation({
    mutationFn: async (categories: Record<string, boolean>) => {
      const res = await apiRequest("PATCH", "/api/notification-prefs/push-categories", { categories });
      return (await res.json()) as PublicUser;
    },
    onSuccess: (updatedUser) => qc.setQueryData(["/api/auth/me"], updatedUser),
    onError: (err: ApiError) => toast.error(err.message || "Could not save that preference"),
  });

  function toggleCategory(key: string, enabled: boolean) {
    setCategoryPrefs((prev) => ({ ...prev, [key]: enabled }));
    categoryPrefMutation.mutate({ [key]: enabled });
  }

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
          Choose which categories reach you by push, on top of enabling push itself below. An
          urgent team announcement always gets through regardless of what you mute here.
        </p>
        <div className="space-y-4">
          {pushSupported && (
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={pushSubscribed}
                disabled={pushBusy}
                onCheckedChange={(checked) => togglePush(checked === true)}
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <Bell className="h-3.5 w-3.5" /> Push notifications
                </span>
                <span className="text-xs text-muted-foreground">
                  Sent to this device/browser only -- enable on each one you want alerts on.
                </span>
              </span>
            </label>
          )}
          {categories.length > 0 && (
            <div className="ml-6 space-y-2 border-l border-border pl-3">
              {categories.map((cat) => {
                const enabled = categoryPrefs[cat.key] !== false;
                return (
                  <label key={cat.key} className="flex items-start gap-2.5 text-sm">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(checked) => toggleCategory(cat.key, checked === true)}
                    />
                    <span>
                      <span className="font-medium">{cat.label}</span>
                      <span className="block text-xs text-muted-foreground">{cat.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {bioLockAvailable && (
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={bioLockEnabled}
                onCheckedChange={(checked) => toggleBiometricLock(checked === true)}
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <ScanFace className="h-3.5 w-3.5" /> Require Face ID / Touch ID
                </span>
                <span className="text-xs text-muted-foreground">
                  Lock the app on this device until you authenticate -- on top of
                  staying signed in, not instead of it.
                </span>
              </span>
            </label>
          )}
          {isNativeHealthSupported() && (
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={healthSyncEnabled}
                disabled={healthSyncBusy}
                onCheckedChange={(checked) => toggleHealthSync(checked === true)}
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <Watch className="h-3.5 w-3.5" /> Sync Apple Health
                </span>
                <span className="text-xs text-muted-foreground">
                  Pre-fills sleep, resting heart rate, and heart rate variability on
                  your daily check-in from your watch or tracker -- always editable
                  before you submit.
                </span>
              </span>
            </label>
          )}
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
