import { useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { API_BASE_URL, post } from "../api";

const apiOrigin = new URL(API_BASE_URL, window.location.href).origin;

export function mediaImageSrc(value?: string | null) {
  if (!value) return "";
  return value.startsWith("/uploads/") ? `${apiOrigin}${value}` : value;
}

async function compressedDataUrl(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ImageUpload({
  value,
  onChange,
  onBusyChange,
  label = "Product image"
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const upload = async (file?: File) => {
    if (!file) return;
    setError("");
    if (!/image\/(png|jpeg|webp)/.test(file.type))
      return setError("Choose a JPEG, PNG, or WebP image.");
    if (file.size > 12 * 1024 * 1024)
      return setError("Choose an image under 12 MB. It will be optimized before upload.");
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setBusy(true);
    onBusyChange?.(true);
    try {
      const image = await compressedDataUrl(file);
      const result = await post<{ url: string }>("/media/images", { image });
      onChange(result.url);
      setPreview("");
    } catch (cause) {
      URL.revokeObjectURL(objectUrl);
      setPreview("");
      setError(cause instanceof Error ? cause.message : "Image upload failed. Try again.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const imageSource = preview || mediaImageSrc(value);
  return <div className="rounded-2xl border border-dashed border-zawana-950/15 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-black">{label}</p>
        <p className="mt-1 text-xs text-zawana-500">JPEG, PNG, or WebP · optimized on upload</p>
      </div>
      <label
        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-black ${busy ? "pointer-events-none opacity-50" : "hover:bg-zawana-950/5"}`}
      >
        {busy ?
          <LoaderCircle className="animate-spin" size={15} /> : value ?
          <RotateCcw size={15} /> :
          <ImagePlus size={15} />}
        {busy ? "Uploading…" : value ? "Replace" : "Upload"}
        <input
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={e => {
            void upload(e.currentTarget.files?.[0]);
            e.currentTarget.value = "";
          }}
        />
      </label>
    </div>
    {imageSource ?
      <div className="relative mt-4 h-40 overflow-hidden rounded-xl bg-zawana-50">
        <img
          src={imageSource}
          alt={`${label} preview`}
          className="h-full w-full object-cover"
          onError={e => {
            e.currentTarget.style.display = "none";
          }}
        />
        {!busy && value &&
          <button
            type="button"
            aria-label="Remove image"
            onClick={() => {
              onChange(null);
              setPreview("");
            }}
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-xl bg-white/90 text-red-600 shadow"
          >
            <Trash2 size={16} />
          </button>}
        {busy &&
          <div className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-bold">
            <LoaderCircle className="mr-2 inline animate-spin" size={16} />Uploading image</div>}
      </div> :
      <div className="mt-4 grid h-32 place-items-center rounded-xl bg-zawana-50 text-sm text-zawana-400">
        <span>
          <ImagePlus className="mx-auto mb-2" size={22} />No image selected</span>
      </div>}
    {error &&
      <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
        {error}
      </p>}
  </div>;
}
