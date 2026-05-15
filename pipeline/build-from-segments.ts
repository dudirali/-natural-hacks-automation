import "dotenv/config";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { narrateSegments } from "./narrate-segments.ts";
import { searchAndDownloadClip } from "./pexels.ts";
import type { Segment } from "./generate-script.ts";

interface ResolvedSegment {
  id: number;
  role: string;
  text: string;
  duration_seconds: number;
  audioFile: string;
  videoFile: string;
  words: { word: string; start: number; end: number }[];
  audioDuration: number;
  pexelsSource?: { videoId: number; url: string; usedKeyword: string };
}

const ROOT = process.cwd();
const TOPIC = process.env.BUILD_TOPIC_ID ?? "test-topic";
const OUT_DIR = join(ROOT, "output", TOPIC);
const SEGMENTS_DIR = join(OUT_DIR, "segments");
const PUBLIC_DIR = join(ROOT, "public");
const SEGMENTS_CONFIG = process.env.BUILD_SEGMENTS_CONFIG
  ? join(ROOT, process.env.BUILD_SEGMENTS_CONFIG)
  : join(OUT_DIR, "segments.json");

// 1.05x — narrator stays calm. The shorts channel runs 1.3x; this is long-form wellness, gentle.
const NARRATION_SPEED = parseFloat(process.env.NARRATION_SPEED ?? "1.05");
const SCENE_TAIL_BUFFER = 0.1; // 100ms extra so audio doesn't get clipped at boundary

await mkdir(SEGMENTS_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });

console.log(`=== Build Pipeline (long-form, ${NARRATION_SPEED}x narration) ===\n`);
const segments: Segment[] = JSON.parse(await readFile(SEGMENTS_CONFIG, "utf8"));
console.log(`Loaded ${segments.length} segments from ${SEGMENTS_CONFIG}`);

// PHASE 1 — TTS for all segments in parallel (capped concurrency)
console.log(`\n[1/4] TTS for ${segments.length} segments (concurrency=8)...`);
const tt0 = Date.now();
const narrations = await narrateSegments(segments, SEGMENTS_DIR, {
  speed: NARRATION_SPEED,
  concurrency: 8,
});
console.log(`      ✅ TTS done in ${((Date.now() - tt0) / 1000).toFixed(0)}s`);

// PHASE 2 — for each segment, search Pexels and download a clip ≥ audio duration
console.log(`\n[2/4] Searching + downloading Pexels clips...`);
const ct0 = Date.now();
const PEXELS_CONCURRENCY = 6; // free tier 200/hour, no need to spam
let cursor = 0;
const pexelsResults: Awaited<ReturnType<typeof searchAndDownloadClip>>[] = new Array(segments.length);

async function pexelsWorker() {
  while (true) {
    const idx = cursor++;
    if (idx >= segments.length) return;
    const seg = segments[idx];
    const audio = narrations.find((n) => n.id === seg.id)!;
    const sceneDur = audio.duration + SCENE_TAIL_BUFFER;
    try {
      const result = await searchAndDownloadClip({
        keywords: seg.visual_keywords,
        outDir: join(SEGMENTS_DIR, String(seg.id)),
        outFile: "video.mp4",
        criteria: { minDurationSeconds: sceneDur, orientation: "landscape" },
      });
      pexelsResults[idx] = result;
      console.log(
        `      [seg ${seg.id}] ✅ "${result.usedKeyword}" → ${(audio.duration).toFixed(2)}s audio / clip ${result.duration}s (id=${result.sourceVideoId})`
      );
    } catch (e) {
      console.error(`      [seg ${seg.id}] ❌ ${(e as Error).message}`);
      throw e;
    }
  }
}
await Promise.all(Array.from({ length: PEXELS_CONCURRENCY }, () => pexelsWorker()));
console.log(`      ✅ Pexels done in ${((Date.now() - ct0) / 1000).toFixed(0)}s`);

// PHASE 3 — copy assets to public/ + assemble resolved segments
console.log(`\n[3/4] Staging assets in public/...`);
const resolved: ResolvedSegment[] = [];
for (let i = 0; i < segments.length; i++) {
  const seg = segments[i];
  const narration = narrations.find((n) => n.id === seg.id)!;
  const pexels = pexelsResults[i];
  const audioBase = basename(narration.audioPath);
  const audioExt = audioBase.endsWith(".wav") ? "wav" : "mp3";
  const audioPublicName = `narration-${seg.id}.${audioExt}`;
  const videoPublicName = `scene-${seg.id}.mp4`;
  await copyFile(narration.audioPath, join(PUBLIC_DIR, audioPublicName));
  await copyFile(pexels.path, join(PUBLIC_DIR, videoPublicName));
  resolved.push({
    id: seg.id,
    role: seg.role,
    text: seg.text,
    duration_seconds: Number((narration.duration + SCENE_TAIL_BUFFER).toFixed(3)),
    audioFile: audioPublicName,
    videoFile: videoPublicName,
    words: narration.words,
    audioDuration: narration.duration,
    pexelsSource: {
      videoId: pexels.sourceVideoId,
      url: pexels.sourceUrl,
      usedKeyword: pexels.usedKeyword,
    },
  });
}
console.log(`      ✅ ${resolved.length} segments staged`);

// PHASE 4 — music + render-props
console.log(`\n[4/4] Picking music + writing render-props...`);
const MUSIC_DIR = join(ROOT, "assets", "music", "peaceful");
let musicFile: string | null = null;
try {
  const tracks = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|wav|m4a|aac)$/i.test(f));
  if (tracks.length > 0) {
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    const dstName = `music-${pick.replace(/\s+/g, "_")}`;
    await copyFile(join(MUSIC_DIR, pick), join(PUBLIC_DIR, dstName));
    musicFile = dstName;
    console.log(`      Music: ${pick}`);
  } else {
    console.log(`      (no music tracks found — rendering without music)`);
  }
} catch {
  console.log(`      (no music dir — rendering without music)`);
}

const fps = 30;
const totalSeconds = resolved.reduce((a, b) => a + b.duration_seconds, 0);
const durationFrames = Math.ceil(totalSeconds * fps);
const renderProps = {
  segments: resolved,
  musicFile,
  musicVolume: 0.05, // very low for wellness — narrator is hero
  fps,
  durationFrames,
  totalSeconds,
};
await writeFile(join(OUT_DIR, "render-props.json"), JSON.stringify(renderProps, null, 2));

console.log(`\n=== Ready ===`);
console.log(`Total duration:  ${totalSeconds.toFixed(2)}s (${(totalSeconds / 60).toFixed(2)} min)`);
console.log(`Segments:        ${resolved.length}`);
console.log(`Music:           ${musicFile ?? "(none)"}`);
console.log(`\nRun: npx remotion render remotion/src/index.ts Long ${OUT_DIR}/final.mp4 --props=${OUT_DIR}/render-props.json`);
