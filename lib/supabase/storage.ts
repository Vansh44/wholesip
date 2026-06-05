import { createClient } from "./client";

export type UploadOptions = {
  bucketName?: string;
  folder?: string;
};

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Uploads a file to Supabase Storage and returns its public URL
 * @param file The File object to upload
 * @param options Upload options including bucketName (default: 'media') and folder
 * @returns The public URL of the uploaded image
 */
export async function uploadImage(file: File, options: UploadOptions = {}) {
  const { bucketName = "media", folder = "" } = options;

  // Validate type and size before uploading.
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(
      `Unsupported file type: ${file.type || "unknown"}. Allowed: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    );
  }

  const supabase = createClient();

  // Create a unique file name to avoid collisions
  const fileExt = file.name.split(".").pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const filePath = folder ? `${folder}/${fileName}` : fileName;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading image:", error);
    throw error;
  }

  // Once uploaded, get the public URL
  return getImageUrl(data.path, bucketName);
}

/**
 * Gets the public URL for a file in Supabase Storage
 * @param path The path to the file in the bucket
 * @param bucketName The name of the bucket (default: 'media')
 * @returns The public URL string
 */
export function getImageUrl(path: string, bucketName: string = "media") {
  const supabase = createClient();
  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Deletes an image from Supabase Storage
 * @param path The path of the file to delete
 * @param bucketName The name of the bucket (default: 'media')
 */
export async function deleteImage(path: string, bucketName: string = "media") {
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucketName).remove([path]);

  if (error) {
    console.error("Error deleting image:", error);
    throw error;
  }
}

/**
 * Extracts the file path from a Supabase Storage public URL
 * @param url The full public URL
 * @param bucketName The name of the bucket (default: 'media')
 * @returns The path of the file within the bucket, or null if it cannot be extracted
 */
export function extractPathFromUrl(
  url: string,
  bucketName: string = "media",
): string | null {
  if (!url) return null;

  try {
    const bucketUrlPart = `/object/public/${bucketName}/`;
    const index = url.indexOf(bucketUrlPart);
    if (index !== -1) {
      return url.substring(index + bucketUrlPart.length);
    }
    return null;
  } catch {
    return null;
  }
}
