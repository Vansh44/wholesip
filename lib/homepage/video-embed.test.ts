import { describe, expect, it } from "vitest";
import { videoEmbedUrl } from "./video-embed";

describe("videoEmbedUrl", () => {
  it("converts every common YouTube URL shape to a nocookie muted-autoplay embed with controls", () => {
    const expected = (id: string) =>
      `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&playsinline=1&rel=0`;
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=aoc6aPPRqVY")).toBe(
      expected("aoc6aPPRqVY"),
    );
    // Share links carry tracking params after the id.
    expect(videoEmbedUrl("https://youtu.be/aoc6aPPRqVY?si=-2jB3abc")).toBe(
      expected("aoc6aPPRqVY"),
    );
    expect(videoEmbedUrl("https://www.youtube.com/shorts/aoc6aPPRqVY")).toBe(
      expected("aoc6aPPRqVY"),
    );
    expect(videoEmbedUrl("https://www.youtube.com/embed/aoc6aPPRqVY")).toBe(
      expected("aoc6aPPRqVY"),
    );
    // watch URLs where v= is not the first query param.
    expect(
      videoEmbedUrl(
        "https://www.youtube.com/watch?feature=share&v=aoc6aPPRqVY",
      ),
    ).toBe(expected("aoc6aPPRqVY"));
  });

  it("converts Vimeo links to a muted-autoplay player with controls", () => {
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789?autoplay=1&muted=1&loop=1",
    );
    expect(videoEmbedUrl("https://vimeo.com/video/123456789")).toBe(
      "https://player.vimeo.com/video/123456789?autoplay=1&muted=1&loop=1",
    );
  });

  it("returns null for direct video files (they play via <video>) and junk", () => {
    expect(videoEmbedUrl("https://cdn.example.com/clip.mp4")).toBeNull();
    expect(videoEmbedUrl("/videos/local.webm")).toBeNull();
    expect(videoEmbedUrl("")).toBeNull();
    expect(videoEmbedUrl("not a url")).toBeNull();
    // A hostile id can't smuggle characters past the strict charset.
    expect(videoEmbedUrl('https://youtu.be/"><script>')).toBeNull();
  });
});
