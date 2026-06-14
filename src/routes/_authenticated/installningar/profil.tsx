import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/installningar/profil")({
  head: () => ({ meta: [{ title: "Min profil — Min Bil Värdering" }] }),
  component: ProfilePage,
});

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notificationPhone, setNotificationPhone] = useState("");
  const [role, setRole] = useState("seller");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const id = sess.session?.user?.id ?? null;
      setUid(id);
      if (!id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("name, email, phone, notification_phone, role, avatar_url")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        setName((data as any).name ?? "");
        setEmail((data as any).email ?? "");
        setPhone((data as any).phone ?? "");
        setNotificationPhone((data as any).notification_phone ?? "");
        setRole((data as any).role ?? "seller");
        setAvatarUrl((data as any).avatar_url ?? null);
      }
      setLoading(false);
    })();
  }, []);

  const saveProfile = async () => {
    if (!uid) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: name || null, phone: phone || null, notification_phone: notificationPhone || null })
      .eq("id", uid);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profil sparad");
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uid) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Endast JPG, PNG eller WebP");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Max 5 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${uid}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("profile-avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
    setUploading(false);
    if (updErr) toast.error(updErr.message);
    else {
      setAvatarUrl(url);
      toast.success("Profilbild uppdaterad");
    }
  };

  const removeAvatar = async () => {
    if (!uid) return;
    setUploading(true);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", uid);
    setUploading(false);
    if (error) toast.error(error.message);
    else {
      setAvatarUrl(null);
      toast.success("Profilbild borttagen");
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 8) {
      toast.error("Minst 8 tecken");
      return;
    }
    if (newPassword !== newPassword2) {
      toast.error("Lösenorden matchar inte");
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Lösenord uppdaterat");
      setNewPassword("");
      setNewPassword2("");
    }
  };

  if (loading) return <p className="text-muted-foreground">Laddar…</p>;

  const initials =
    (name || email || "?")
      .split(/\s+|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Min profil</h1>
        <p className="text-sm text-muted-foreground">Hantera namn, kontaktuppgifter, profilbild och lösenord.</p>
      </div>

      <Card id="bild">
        <CardHeader><CardTitle className="text-base">Profilbild</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onPickAvatar}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Ladda upp bild
            </Button>
            {avatarUrl && (
              <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={uploading}>
                <Trash2 className="h-4 w-4 mr-2" /> Ta bort
              </Button>
            )}
            <p className="text-xs text-muted-foreground">JPG, PNG eller WebP. Max 5 MB.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Uppgifter</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Namn</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notificationPhone">Notifieringsnummer</Label>
            <Input id="notificationPhone" value={notificationPhone} onChange={(e) => setNotificationPhone(e.target.value)} placeholder="+46XXXXXXXXX" />
            <p className="text-xs text-muted-foreground">Telefonnummer för SMS-notifieringar om nya leads.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" value={email} readOnly disabled />
            <p className="text-xs text-muted-foreground">E-post ändras av admin.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Roll</Label>
            <Input id="role" value={role === "admin" ? "Admin" : role === "dealer" ? "Handlare" : "Säljare"} readOnly disabled />
          </div>
          <Button onClick={saveProfile} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Spara
          </Button>
        </CardContent>
      </Card>

      <Card id="losenord">
        <CardHeader><CardTitle className="text-base">Byt lösenord</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw1">Nytt lösenord</Label>
            <Input id="pw1" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw2">Upprepa</Label>
            <Input id="pw2" type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} />
          </div>
          <Button onClick={changePassword} disabled={pwSaving}>
            {pwSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Uppdatera lösenord
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
