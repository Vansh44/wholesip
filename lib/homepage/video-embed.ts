// Detect YouTube / Vimeo links pasted into a section's video_url and turn
// them into background-embed URLs (autoplay, muted, looping, no controls).
// Direct video files (.mp4/.webm) return null and play via <video> instead.
//
// SAFETY: the embed URL is CONSTRUCTED here from the extracted id (strictly
// [A-Za-z0-9_-] / digits) — the merchant string itself is never placed in the
// iframe src, so no scheme/host injection is possible.

const YT_RE =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/;

const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d{6,12})/;

export function videoEmbedUrl(url: string): string | null {
  if (!url) return null;

  const yt = url.match(YT_RE);
  if (yt) {
    const id = yt[1];
    // Autoplay MUTED (browsers block autoplay-with-sound) but keep the player
    // CONTROLS visible so a visitor can unmute and hear the audio. playlist=id
    // is YouTube's required trick for looping a single video.
    return (
      `https://www.youtube-nocookie.com/embed/${id}` +
      `?autoplay=1&mute=1&loop=1&playlist=${id}&playsinline=1&rel=0`
    );
  }

  const vimeo = url.match(VIMEO_RE);
  if (vimeo) {
    // Autoplay muted, looping, with controls (no background=1 — that mode
    // strips the unmute control, so the visitor could never hear it).
    return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1&muted=1&loop=1`;
  }

  return null;
}
