import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server-user";
import { rateLimit } from "@/lib/rate-limit";
import { gcsConfigured, gcsUploadObject } from "@/lib/storage/gcs";
import { processImageUpload } from "@/lib/storage/process-image";
import { logError } from "@/lib/observability/logger";

// Run on the Node runtime: uploads are optimized with sharp and stored to
// Google Cloud Storage server-side.
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Require an authenticated user (admins for dashboard, logged-in customers
  // for blog covers). Prevents anonymous abuse of the media bucket.
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Throttle per user — image processing is CPU-bound, so cap how fast a single
  // account can drive uploads. 60 / minute is generous for real editing.
  const { allowed } = await rateLimit(`upload:${user.id}`, {
    max: 60,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many uploads. Please slow down and try again shortly." },
      { status: 429 },
    );
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

  // Validate + optimize (shared with the media-library action).
  const processed = await processImageUpload(file);
  if (!processed.ok) {
    return NextResponse.json(
      { error: processed.error },
      { status: processed.status },
    );
  }
  const { bytes, contentType, ext } = processed.data;

  const fileName = `${Math.random().toString(36).substring(2, 12)}_${Date.now()}.${ext}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  if (!gcsConfigured) {
    logError("upload: GCS not configured", new Error("GCS_BUCKET unset"), {
      path: filePath,
    });
    return NextResponse.json(
      { error: "Uploads are not configured." },
      { status: 500 },
    );
  }
  try {
    const url = await gcsUploadObject(filePath, bytes, contentType);
    return NextResponse.json({ url });
  } catch (err) {
    logError("upload: GCS upload failed", err, { path: filePath });
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 },
    );
  }
}
