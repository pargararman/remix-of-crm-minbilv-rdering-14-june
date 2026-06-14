// File uploader + grid (client-side HEIC convert + thumbnail).
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Eye, EyeOff, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listFiles, registerFile, updateFile, deleteFile, bulkSetDealerVisibility } from "@/lib/files.functions";

const PHOTO_CATEGORIES: { value: string; label: string }[] = [
  { value: "framifran", label: "Framifrån" },
  { value: "bakifran", label: "Bakifrån" },
  { value: "vanster_sida", label: "Vänster sida" },
  { value: "hoger_sida", label: "Höger sida" },
  { value: "interior", label: "Interiör" },
  { value: "matarstallning", label: "Mätarställning" },
  { value: "servicebok", label: "Servicebok" },
  { value: "skador", label: "Skador" },
  { value: "ovrigt", label: "Övrigt" },
];

const MAX_IMG = 10 * 1024 * 1024;
const MAX_PDF = 20 * 1024 * 1024;

async function makeThumbnail(file: Blob): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(400 / img.width, 300 / img.height, 1);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8));
}

async function imageSize(file: Blob): Promise<{ w: number; h: number }> {
  const img = await createImageBitmap(file);
  return { w: img.width, h: img.height };
}

export function FilesPanel({ leadId }: { leadId: string }) {
  const listFn = useServerFn(listFiles);
  const registerFn = useServerFn(registerFile);
  const updateFn = useServerFn(updateFile);
  const deleteFn = useServerFn(deleteFile);
  const bulkFn = useServerFn(bulkSetDealerVisibility);
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["files", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["files", leadId] });

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const list = Array.from(files).slice(0, 10);
    setUploading(list.map((f) => ({ name: f.name, progress: 0 })));
    for (const file of list) {
      try {
        let blob: Blob = file;
        let type = file.type || "application/octet-stream";
        let ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";

        const isHeic = /heic|heif/i.test(file.type) || /heic|heif/i.test(file.name);
        if (isHeic) {
          const heic2any = (await import("heic2any")).default;
          const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
          blob = Array.isArray(converted) ? converted[0] : (converted as Blob);
          type = "image/jpeg"; ext = "jpg";
        }
        const isImage = type.startsWith("image/");
        if (isImage && blob.size > MAX_IMG) throw new Error(`Bild för stor (>10MB)`);
        if (!isImage && blob.size > MAX_PDF) throw new Error(`Fil för stor (>20MB)`);

        const uuid = crypto.randomUUID();
        const path = `${leadId}/${uuid}.${ext}`;
        const bucket = isImage ? "lead-photos" : "lead-documents";
        const { error: upErr } = await supabase.storage.from(bucket).upload(path, blob, { contentType: type });
        if (upErr) throw upErr;

        let thumbPath: string | null = null;
        let dims: { w: number; h: number } | null = null;
        if (isImage) {
          dims = await imageSize(blob);
          const thumb = await makeThumbnail(blob);
          thumbPath = `${leadId}/thumbs/${uuid}.jpg`;
          await supabase.storage.from("lead-photos").upload(thumbPath, thumb, { contentType: "image/jpeg" });
        }

        await registerFn({
          data: {
            leadId,
            storage_path: path,
            thumbnail_path: thumbPath,
            file_type: type,
            file_size_bytes: blob.size,
            category: "ovrigt",
            visible_to_dealer: false,
            width: dims?.w ?? null,
            height: dims?.h ?? null,
          },
        });
      } catch (e: any) {
        alert(`Fel vid uppladdning av ${file.name}: ${e.message ?? e}`);
      }
    }
    setUploading([]);
    invalidate();
  }

  const files = q.data?.files ?? [];

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/20"
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm">Dra filer hit eller <span className="text-primary">välj filer</span></p>
        <p className="text-xs text-muted-foreground mt-1">Max 10 MB/bild, 20 MB/PDF. HEIC konverteras automatiskt.</p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,application/pdf,.heic,.heif"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploading.length > 0 && (
        <div className="text-sm text-muted-foreground">Laddar upp {uploading.length} fil(er)…</div>
      )}

      {files.length > 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={async () => { await bulkFn({ data: { leadId, visible: true } }); invalidate(); }}>
            Godkänn alla för handlare
          </Button>
          <Button size="sm" variant="outline" onClick={async () => { await bulkFn({ data: { leadId, visible: false } }); invalidate(); }}>
            Dölj alla
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {files.map((f: any, idx: number) => {
          const isImg = f.file_type?.startsWith("image/");
          return (
            <div key={f.id} className="relative border rounded overflow-hidden group">
              {isImg ? (
                <button onClick={() => setLightbox(idx)} className="block w-full aspect-[4/3] bg-muted">
                  {f.thumb_signed_url ? (
                    <img src={f.thumb_signed_url} alt={f.caption ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </button>
              ) : (
                <a href={f.signed_url} target="_blank" rel="noreferrer" className="block w-full aspect-[4/3] bg-muted flex items-center justify-center">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </a>
              )}
              <div className="p-2 text-xs">
                <div className="font-semibold truncate">{PHOTO_CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category}</div>
                <div className="flex items-center justify-between mt-1">
                  <button
                    onClick={async () => { await updateFn({ data: { fileId: f.id, visible_to_dealer: !f.visible_to_dealer } }); invalidate(); }}
                    title={f.visible_to_dealer ? "Synlig för handlare" : "Intern"}
                  >
                    {f.visible_to_dealer ? <Eye className="h-3.5 w-3.5 text-green-500" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                  <button
                    className="text-destructive"
                    onClick={async () => { if (confirm("Radera fil?")) { await deleteFn({ data: { fileId: f.id } }); invalidate(); } }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {lightbox !== null && files[lightbox] && (
        <Lightbox
          files={files}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onChange={async (id, patch) => { await updateFn({ data: { fileId: id, ...patch } }); invalidate(); }}
        />
      )}
    </div>
  );
}

function Lightbox({
  files, index, onClose, onChange,
}: {
  files: any[];
  index: number;
  onClose: () => void;
  onChange: (id: string, patch: { category?: string; caption?: string | null; visible_to_dealer?: boolean }) => void;
}) {
  const [i, setI] = useState(index);
  const f = files[i];
  if (!f) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <img src={f.signed_url} alt="" className="max-h-[70vh] mx-auto" />
        <div className="bg-background p-4 mt-2 rounded space-y-2">
          <div className="flex gap-2 items-center">
            <select
              value={f.category ?? "ovrigt"}
              onChange={(e) => onChange(f.id, { category: e.target.value })}
              className="bg-background border rounded px-2 py-1 text-sm"
            >
              {PHOTO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => onChange(f.id, { visible_to_dealer: !f.visible_to_dealer })}>
              {f.visible_to_dealer ? <Eye className="h-3.5 w-3.5 mr-1" /> : <EyeOff className="h-3.5 w-3.5 mr-1" />}
              {f.visible_to_dealer ? "Synlig" : "Intern"}
            </Button>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setI((i - 1 + files.length) % files.length)}>←</Button>
            <Button size="sm" variant="ghost" onClick={() => setI((i + 1) % files.length)}>→</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Stäng</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
