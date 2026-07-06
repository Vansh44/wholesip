import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

// Signed-URL flow for VIDEO uploads. Videos are far too big to proxy through
// a serverless route (Vercel caps request bodies at ~4.5 MB), so instead:
//   1. the client POSTs metadata here; we authenticate, rate-limit, validate;
//   2. we mint a one-time signed upload URL (service role) for a random path;
//   3. the client uploads the file DIRECTLY to Supabase Storage with it.
// The token only authorizes that single path, so the client can't write
// anywhere else in the bucket.
export const runtime = "nodejs";

const BUCKET = "media";
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Tighter than images — videos are large; 10/min is plenty for editing.
  const { allowed } = await rateLimit(`upload-video:${user.id}`, {
    max: 10,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please slow down and try again shortly." },
      { status: 429 },
    );
  }

  let body: { type?: string; size?: number; folder?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const type = typeof body.type === "string" ? body.type : "";
  const size = Number(body.size);
  const folder = (typeof body.folder === "string" ? body.folder : "").replace(
    /[^a-z0-9/_-]/gi,
    "",
  );

  if (!ALLOWED_VIDEO_TYPES.includes(type)) {
    return NextResponse.json(
      {
        error: `Unsupported video type: ${type || "unknown"}. Use MP4 or WebM.`,
      },
      { status: 400 },
    );
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      {
        error: `Video too large. Maximum is ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`,
      },
      { status: 400 },
    );
  }

  const fileName = `${Math.random().toString(36).substring(2, 12)}_${Date.now()}.${EXT_BY_TYPE[type]}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(filePath);
  if (error || !data) {
    console.error("Signed upload URL error:", error);
    return NextResponse.json(
      { error: "Could not start the upload. Please try again." },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(filePath);
  return NextResponse.json({
    path: data.path,
    token: data.token,
    publicUrl: pub.publicUrl,
  });
}
