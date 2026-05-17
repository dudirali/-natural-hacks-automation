import "dotenv/config";
import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { narrateSegments } from "./narrate-segments.ts";
import { searchAndDownloadClip } from "./pexels.ts";
import { stitchBroll } from "./stitch-broll.ts";
import { generateAnimations } from "./generate-animations.ts";
import { computeAllSfxEvents } from "./sound-design.ts";
import type { Segment } from "./generate-script.ts";

interface CaptionWord {
  word: string;
  /** GLOBAL start time (across all stitched segments) */
  start: number;
  /** GLOBAL end time */
  end: number;
}

const ROOT = process.cwd();
const TOPIC = process.env.BUILD_TOPIC_ID ?? "test-topic";
const OUT_DIR = join(ROOT, "output", TOPIC);
const SEGMENTS_DIR = join(OUT_DIR, "segments");
const PUBLIC_DIR = join(ROOT, "public");
const SEGMENTS_CONFIG = process.env.BUILD_SEGMENTS_CONFIG
  ? join(ROOT, process.env.BUILD_SEGMENTS_CONFIG)
  : join(OUT_DIR, "segments.json");

const NARRATION_SPEED = parseFloat(process.env.NARRATION_SPEED ?? "1.05");
const SCENE_TAIL_BUFFER = 0.1;
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 30;

await mkdir(SEGMENTS_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });

console.log(`=== Build Pipeline (long-form, FFmpeg-stitched, ${NARRATION_SPEED}x narration) ===\n`);
const segments: Segment[] = JSON.parse(await readFile(SEGMENTS_CONFIG, "utf8"));
console.log(`Loaded ${segments.length} segments from ${SEGMENTS_CONFIG}`);

// PHASE 1 — TTS for all segments in parallel (concurrency 4)
console.log(`\n[1/5] TTS for ${segments.length} segments (concurrency=4)...`);
const tt0 = Date.now();
const narrations = await narrateSegments(segments, SEGMENTS_DIR, {
  speed: NARRATION_SPEED,
  concurrency: 4,
});
console.log(`      ✅ TTS done in ${((Date.now() - tt0) / 1000).toFixed(0)}s`);

// PHASE 2 — Pexels per segment, SEQUENTIAL so we can enforce a per-video
// usage cap and not pick the same clip more than twice in a single video.
// (Parallel workers can't share an up-to-date exclude set without coordination.)
console.log(`\n[2/5] Searching + downloading Pexels clips (seq, max 2× same clip)...`);
const ct0 = Date.now();
const MAX_REPEATS_PER_CLIP = 2;
const pexelsResults: Array<{ path: string; sourceVideoId: number; sourceUrl: string; duration: number; usedKeyword: string }> = new Array(segments.length);
const useCount = new Map<number, number>();
for (let idx = 0; idx < segments.length; idx++) {
  const seg = segments[idx];
  const audio = narrations.find((n) => n.id === seg.id)!;
  const sceneDur = audio.duration + SCENE_TAIL_BUFFER;
  const excludeVideoIds = new Set<number>();
  for (const [id, count] of useCount) {
    if (count >= MAX_REPEATS_PER_CLIP) excludeVideoIds.add(id);
  }
  try {
    const result = await searchAndDownloadClip({
      keywords: seg.visual_keywords,
      outDir: join(SEGMENTS_DIR, String(seg.id)),
      outFile: "video.mp4",
      criteria: { minDurationSeconds: sceneDur, orientation: "landscape" },
      excludeVideoIds,
    });
    pexelsResults[idx] = result;
    useCount.set(result.sourceVideoId, (useCount.get(result.sourceVideoId) ?? 0) + 1);
    const count = useCount.get(result.sourceVideoId)!;
    console.log(
      `      [seg ${seg.id}] ✅ "${result.usedKeyword}" id=${result.sourceVideoId} (use ${count}/${MAX_REPEATS_PER_CLIP}) — audio ${audio.duration.toFixed(2)}s / clip ${result.duration}s`
    );
  } catch (e) {
    console.error(`      [seg ${seg.id}] ❌ ${(e as Error).message}`);
    throw e;
  }
}
console.log(`      ✅ Pexels done in ${((Date.now() - ct0) / 1000).toFixed(0)}s`);

// PHASE 3 — pick music
console.log(`\n[3/5] Picking music...`);
const MUSIC_DIR = join(ROOT, "assets", "music", "peaceful");
let musicSourcePath: string | null = null;
try {
  const tracks = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|wav|m4a|aac)$/i.test(f));
  if (tracks.length > 0) {
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    musicSourcePath = join(MUSIC_DIR, pick);
    console.log(`      Music: ${pick}`);
  } else {
    console.log(`      (no music tracks found)`);
  }
} catch {
  console.log(`      (no music dir)`);
}

// === Pre-stitch: compute global word timings, animations, and SFX events ===
// Animations and SFX both need timings — generate animations BEFORE stitch
// so SFX can be timed to anim entries / item reveals / exits.

const globalWordTimings: Array<{ word: string; start: number; end: number }> = [];
const segmentTimingsForAnim: Array<{ id: number; start: number; end: number }> = [];
const segDurationsList: number[] = [];
{
  let cum = 0;
  for (const seg of segments) {
    const n = narrations.find((x) => x.id === seg.id)!;
    const segStart = cum;
    for (const w of n.words) {
      globalWordTimings.push({ word: w.word, start: cum + w.start, end: cum + w.end });
    }
    const sceneDur = n.duration + SCENE_TAIL_BUFFER;
    segDurationsList.push(sceneDur);
    cum += sceneDur;
    segmentTimingsForAnim.push({ id: seg.id, start: segStart, end: cum });
  }
}
const totalSecondsPlan = segmentTimingsForAnim[segmentTimingsForAnim.length - 1]?.end ?? 0;

// Generate animations BEFORE stitch so SFX can map their entry/items/exit timing.
console.log(`\n[3.5/5] Generating animations from script (Claude motion-graphics director)...`);
const at0 = Date.now();
let animations: Awaited<ReturnType<typeof generateAnimations>> = [];
try {
  animations = await generateAnimations(segments, segmentTimingsForAnim);
  console.log(`      ✅ ${animations.length} animations in ${((Date.now() - at0) / 1000).toFixed(0)}s`);
  for (const a of animations) {
    console.log(`         ${a.start.toFixed(1)}s +${a.duration}s  ${a.data.type}`);
  }
} catch (e) {
  console.warn(`      ⚠️  animations generation failed: ${(e as Error).message.slice(0, 120)} — continuing without`);
}

// Build SFX events via the central sound language. All timing decisions live
// in pipeline/sound-design.ts — same event types always get the same sound.
const sfxEvents = computeAllSfxEvents({
  segDurations: segDurationsList,
  globalWords: globalWordTimings,
  animations,
  totalSeconds: totalSecondsPlan,
});

// Log a breakdown by sound-language key so we can sanity-check the mix.
{
  const counts = new Map<string, number>();
  for (const e of sfxEvents) {
    const name = e.sfxPath.split("/").pop() ?? "?";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const summary = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}×${k.replace("sfx-", "").replace(".mp3", "")}`)
    .join("  ");
  console.log(`      sfx events: ${sfxEvents.length} total — ${summary}`);
}

// PHASE 4 — FFmpeg stitch B-roll + audio into ONE master video
console.log(`\n[4/5] FFmpeg stitching ${segments.length} segments → one video...`);

const st0 = Date.now();
const stitch = await stitchBroll({
  outDir: OUT_DIR,
  segments: segments.map((s) => {
    const n = narrations.find((x) => x.id === s.id)!;
    const p = pexelsResults[segments.indexOf(s)];
    return {
      id: s.id,
      videoPath: p.path,
      audioPath: n.audioPath,
      audioDuration: n.duration,
    };
  }),
  musicPath: musicSourcePath,
  musicVolume: 1.0,
  width: TARGET_WIDTH,
  height: TARGET_HEIGHT,
  fps: TARGET_FPS,
  tailBufferSeconds: SCENE_TAIL_BUFFER,
  sfxEvents,
});
console.log(`      ✅ Stitched in ${((Date.now() - st0) / 1000).toFixed(0)}s → ${stitch.outPath}`);

// PHASE 4b — verify the stitched audio has no large silent windows.
// If silence > 2.5s exists, the pipeline introduced it after TTS — bug to
// surface in logs (not yet failing the run, just diagnostic).
console.log(`\n[4b/5] Scanning stitched audio for silent windows >= 2.5s...`);
try {
  const silOut = execSync(
    `ffmpeg -hide_banner -nostats -i "${stitch.outPath}" -af "silencedetect=noise=-40dB:duration=2.5" -f null - 2>&1 | grep -E "silence_(start|end)" || true`,
    { encoding: "utf8", shell: "/bin/bash" } as any
  );
  const windows: Array<{ start: number; end: number; dur: number }> = [];
  let lastStart: number | null = null;
  for (const line of silOut.split("\n")) {
    const sm = line.match(/silence_start:\s*([\d.]+)/);
    const em = line.match(/silence_end:\s*([\d.]+)/);
    if (sm) lastStart = parseFloat(sm[1]);
    else if (em && lastStart != null) {
      const end = parseFloat(em[1]);
      windows.push({ start: lastStart, end, dur: end - lastStart });
      lastStart = null;
    }
  }
  if (windows.length === 0) {
    console.log(`      ✅ no silent windows >= 2.5s in stitched audio`);
  } else {
    console.log(`      ⚠️  FOUND ${windows.length} silent window(s) >= 2.5s:`);
    for (const w of windows) {
      console.log(`         silence: ${w.start.toFixed(2)}s → ${w.end.toFixed(2)}s  (${w.dur.toFixed(2)}s long)`);
    }
  }
} catch (e) {
  console.warn(`      stitched silence scan failed: ${(e as Error).message.slice(0, 100)}`);
}

// PHASE 5 — copy stitched video to public/ + compute GLOBAL caption timings
console.log(`\n[5/5] Staging stitched video + computing global caption timings...`);
const stitchedPublicName = "stitched-broll.mp4";
await copyFile(stitch.outPath, join(PUBLIC_DIR, stitchedPublicName));

// Build global word timings: offset each segment's local words by cumulative segment start
const globalWords: CaptionWord[] = [];
let cumulative = 0;
for (const seg of segments) {
  const narration = narrations.find((n) => n.id === seg.id)!;
  for (const w of narration.words) {
    globalWords.push({
      word: w.word,
      start: cumulative + w.start,
      end: cumulative + w.end,
    });
  }
  cumulative += narration.duration + SCENE_TAIL_BUFFER;
}

const totalSeconds = stitch.totalSeconds;
const durationFrames = Math.ceil(totalSeconds * TARGET_FPS);

// Animations were already generated before stitch (so SFX could be timed to them).
const renderProps = {
  /** Single stitched video file (B-roll + audio + music baked in) */
  videoFile: stitchedPublicName,
  /** Global word timings for the entire video */
  words: globalWords,
  fps: TARGET_FPS,
  durationFrames,
  totalSeconds,
  width: TARGET_WIDTH,
  height: TARGET_HEIGHT,
  /** Infographic animations that replace B-roll during their windows. */
  animations,
  /** Title shown permanently in the top banner. */
  videoTitle: process.env.BUILD_TOPIC_TITLE ?? "",
};
await writeFile(join(OUT_DIR, "render-props.json"), JSON.stringify(renderProps, null, 2));

console.log(`\n=== Ready ===`);
console.log(`Stitched video: ${stitch.outPath} (${totalSeconds.toFixed(1)}s = ${(totalSeconds / 60).toFixed(2)}min)`);
console.log(`Global caption words: ${globalWords.length}`);
console.log(`\nRun: npx remotion render remotion/src/index.ts Long ${OUT_DIR}/final.mp4 --props=${OUT_DIR}/render-props.json`);
