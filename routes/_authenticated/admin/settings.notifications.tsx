import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMyNotificationSettings, updateMyNotificationSettings } from "@/lib/notifications.functions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/settings/notifications")({
  component: NotificationSettings,
});

const CHANNELS = [
  { key: "new_lead", label: "Ny lead tilldelad" },
  { key: "lead_response", label: "Kund svarat på SMS" },
  { key: "lead_won", label: "Affär vunnen" },
  { key: "lead_lost", label: "Lead förlorad" },
  { key: "dealer_bid", label: "Nytt handlarbud" },
  { key: "task_due", label: "Uppgift förfaller" },
];

function NotificationSettings() {
  const get = useServerFn(getMyNotificationSettings);
  const upd = useServerFn(updateMyNotificationSettings);
  const qc = useQueryClient();

  const { data } = useQuery({ queryKey: ["notif-settings"], queryFn: () => get() });
  const [email, setEmail] = useState<Record<string, boolean>>({});
  const [sms, setSms] = useState<Record<string, boolean>>({});
  const [browser, setBrowser] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data) {
      setEmail((data.email_enabled as Record<string, boolean>) ?? {});
      setSms((data.sms_enabled as Record<string, boolean>) ?? {});
      setBrowser((data.browser_enabled as Record<string, boolean>) ?? {});
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () => upd({ data: { email_enabled: email, sms_enabled: sms, browser_enabled: browser } }),
    onSuccess: () => {
      toast.success("Sparat");
      qc.invalidateQueries({ queryKey: ["notif-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requestBrowser = async () => {
    if (typeof Notification === "undefined") return toast.error("Browser-notiser stöds inte");
    const p = await Notification.requestPermission();
    if (p === "granted") toast.success("Notiser tillåtna");
    else toast.warning("Notiser inte tillåtna");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Notifieringar</h1>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated">
            <tr>
              <th className="px-3 py-2 text-left">Händelse</th>
              <th className="px-3 py-2">E-post</th>
              <th className="px-3 py-2">SMS</th>
              <th className="px-3 py-2">Browser</th>
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((c) => (
              <tr key={c.key} className="border-t border-border">
                <td className="px-3 py-2"><Label>{c.label}</Label></td>
                <td className="px-3 py-2 text-center">
                  <Switch checked={!!email[c.key]} onCheckedChange={(v) => setEmail((p) => ({ ...p, [c.key]: v }))} />
                </td>
                <td className="px-3 py-2 text-center">
                  <Switch checked={!!sms[c.key]} onCheckedChange={(v) => setSms((p) => ({ ...p, [c.key]: v }))} />
                </td>
                <td className="px-3 py-2 text-center">
                  <Switch checked={!!browser[c.key]} onCheckedChange={(v) => setBrowser((p) => ({ ...p, [c.key]: v }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Spara</Button>
        <Button variant="outline" onClick={requestBrowser}>Tillåt browser-notiser</Button>
      </div>
    </div>
  );
}
