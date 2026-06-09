import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Run on the Node runtime; uploads happen server-side via the user's cookie
// session. This avoids the browser @supabase/ssr Web-Locks auth contention
// (multiple open tabs) that can make client-side storage uploads hang forever.
export const runtime = "nodejs";

const BUCKET = "media";
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const supabase = await createClient();

  // Require an authenticated user (admins for dashboard, logged-in customers
  // for blog covers). Prevents anonymous abuse of the media bucket.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid upload payload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const folder = ((form.get("folder") as string) || "").replace(
    /[^a-z0-9/_-]/gi,
    "",
  );

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`,
      },
      { status: 400 },
    );
  }

  const ext =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "bin";
  const fileName = `${Math.random().toString(36).substring(2, 12)}_${Date.now()}.${ext}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  // Convert to bytes so the upload is deterministic on the Node runtime.
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, bytes, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return NextResponse.json({ url: pub.publicUrl });
}
