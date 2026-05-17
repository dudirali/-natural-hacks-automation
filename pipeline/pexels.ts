import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const SEARCH_URL = "https://api.pexels.com/videos/search";
const PHOTO_SEARCH_URL = "https://api.pexels.com/v1/search";

interface PexelsPhotoSrc {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  landscape: string;
  portrait: string;
}

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  src: PexelsPhotoSrc;
  photographer: string;
}

interface PexelsPhotoResponse {
  photos: PexelsPhoto[];
}

/**
 * Search Pexels PHOTOS (stills, not videos) and download the first match.
 * Designed for thumbnail hero images where a sharp posed shot beats a
 * random video frame. Returns the JPEG file path.
 */
export async function searchAndDownloadPhoto(opts: {
  keywords: string[];
  outDir: string;
  outFile: string; // basename e.g. "thumbnail-hero.jpg"
  orientation?: "landscape" | "portrait" | "square";
}): Promise<{ path: string; sourceId: number; sourceUrl: string; usedKeyword: string } | null> {
  if (!PEXELS_API_KEY) throw new Error("PEXELS_API_KEY missing in .env");
  if (!opts.keywords.length) return null;

  await mkdir(opts.outDir, { recursive: true });

  for (const keyword of opts.keywords) {
    const url = new URL(PHOTO_SEARCH_URL);
    url.searchParams.set("query", keyword);
    url.searchParams.set("orientation", opts.orientation ?? "landscape");
    url.searchParams.set("size", "large");
    url.searchParams.set("per_page", "10");

    const res = await fetch(url.toString(), {
      headers: { Authorization: PEXELS_API_KEY },
    });
    if (!res.ok) {
      console.warn(`  [pexels:photo] "${keyword}" HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as PexelsPhotoResponse;
    const photos = data.photos ?? [];
    if (photos.length === 0) continue;

    const pick = photos[0];
    // Prefer the "large2x" or "landscape" variant — they're sized to 1500×1000 or
    // 1200×627 respectively, both bigger than our 1280×720 target.
    const srcUrl = pick.src.large2x ?? pick.src.landscape ?? pick.src.original;

    const imgRes = await fetch(srcUrl);
    if (!imgRes.ok) {
      console.warn(`  [pexels:photo] download failed (HTTP ${imgRes.status})`);
      continue;
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const outPath = join(opts.outDir, opts.outFile);
    await writeFile(outPath, buf);

    return {
      path: outPath,
      sourceId: pick.id,
      sourceUrl: pick.url,
      usedKeyword: keyword,
    };
  }
  return null;
}

interface PexelsVideoFile {
  id: number;
  quality: "hd" | "sd" | "uhd";
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number; // seconds
  url: string; // page URL
  image: string;
  video_files: PexelsVideoFile[];
  user: { name: string; url: string };
}

interface PexelsSearchResponse {
  videos: PexelsVideo[];
  total_results?: number;
}

interface PickCriteria {
  /** Minimum duration in seconds we need from the clip */
  minDurationSeconds: number;
  /** "landscape" for 16:9 health videos */
  orientation: "landscape" | "portrait" | "square";
}

/**
 * Search Pexels and download the BEST clip for a given set of keywords.
 * Tries keywords in order until a suitable clip is found.
 *
 * Returns the path to the downloaded mp4 file + metadata. Throws if no keyword returned a good clip.
 */
export async function searchAndDownloadClip(opts: {
  keywords: string[];
  outDir: string;
  outFile: string; // basename, e.g. "scene-1.mp4"
  criteria: PickCriteria;
  /** IDs that have already been used too many times in this video — skip them. */
  excludeVideoIds?: Set<number>;
}): Promise<{ path: string; sourceVideoId: number; sourceUrl: string; duration: number; usedKeyword: string }> {
  if (!PEXELS_API_KEY) throw new Error("PEXELS_API_KEY missing in .env");
  if (!opts.keywords.length) throw new Error("No keywords provided");

  await mkdir(opts.outDir, { recursive: true });

  const exclude = opts.excludeVideoIds ?? new Set<number>();

  for (const keyword of opts.keywords) {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", keyword);
    url.searchParams.set("orientation", opts.criteria.orientation);
    url.searchParams.set("size", "large"); // prefer 4K/1080p
    url.searchParams.set("per_page", "15");

    const res = await fetch(url.toString(), {
      headers: { Authorization: PEXELS_API_KEY },
    });
    if (!res.ok) {
      console.warn(`  [pexels] "${keyword}" HTTP ${res.status} — skipping`);
      continue;
    }
    const data = (await res.json()) as PexelsSearchResponse;
    const candidates = (data.videos ?? []).filter(
      (v) => v.duration >= opts.criteria.minDurationSeconds + 0.5 && !exclude.has(v.id)
    );
    if (candidates.length === 0) {
      console.warn(`  [pexels] "${keyword}" → no fresh clips (after exclusion)`);
      continue;
    }

    // Pick the first non-excluded candidate. Pexels returns most-relevant first.
    const pick = candidates[0];

    // Inside the pick, choose the highest-quality 1080p+ mp4 file
    const files = pick.video_files
      .filter((f) => f.file_type === "video/mp4" && f.width >= 1280)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
    const chosen = files[0] ?? pick.video_files[0];
    if (!chosen) {
      console.warn(`  [pexels] "${keyword}" → no usable file in video ${pick.id}`);
      continue;
    }

    // Download
    const videoRes = await fetch(chosen.link);
    if (!videoRes.ok) {
      console.warn(`  [pexels] download failed (HTTP ${videoRes.status}) for video ${pick.id}`);
      continue;
    }
    const buf = Buffer.from(await videoRes.arrayBuffer());
    const path = join(opts.outDir, opts.outFile);
    await writeFile(path, buf);

    return {
      path,
      sourceVideoId: pick.id,
      sourceUrl: pick.url,
      duration: pick.duration,
      usedKeyword: keyword,
    };
  }

  throw new Error(
    `No Pexels clip found for any of: ${opts.keywords.join(" / ")} (minDuration=${opts.criteria.minDurationSeconds}s)`
  );
}
