import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

/**
 * Pre-stitch all Pexels clips + per-segment narrations into ONE master video
 * via FFmpeg, BEFORE Remotion runs. This frees Remotion from having to manage
 * 38 OffthreadVideo elements (which OOM'd Chromium on Railway).
 *
 * Output: a single mp4 with B-roll video track + concatenated narration audio.
 * Remotion then renders captions overlay on top of this single video — fast + low memory.
 */

export interface StitchInput {
  /** Output dir where intermediate + final stitched.mp4 land */
  outDir: string;
  segments: Array<{
    id: number;
    /** Path to the Pexels mp4 (in /public) */
    videoPath: string;
    /** Path to narration audio for this segment */
    audioPath: string;
    /** Audio duration in seconds (so we know how long to keep the clip) */
    audioDuration: number;
  }>;
  /** Optional path to background music file (mp3/wav) */
  musicPath?: string | null;
  musicVolume?: number;
  /** Target video resolution */
  width?: number;
  height?: number;
  fps?: number;
  /** Small buffer added to each segment so audio doesn't get clipped at cut */
  tailBufferSeconds?: number;
}

export interface StitchResult {
  /** Final stitched mp4 (video + audio in single file) */
  outPath: string;
  /** Total duration in seconds */
  totalSeconds: number;
}

/**
 * Run FFmpeg to stitch all segments into one continuous video with embedded audio.
 * Strategy: build a single complex_filter that
 *   - trims each video to its audio_duration + buffer
 *   - scales to target resolution
 *   - concatenates video clips end-to-end
 *   - concatenates audio clips end-to-end (or amix with music)
 */
export async function stitchBroll(opts: StitchInput): Promise<StitchResult> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const fps = opts.fps ?? 30;
  const tail = opts.tailBufferSeconds ?? 0.1;
  const musicVolume = opts.musicVolume ?? 0.05;

  await mkdir(opts.outDir, { recursive: true });

  const segDurations = opts.segments.map((s) => s.audioDuration + tail);
  const totalSeconds = segDurations.reduce((a, b) => a + b, 0);

  // Build FFmpeg inputs: each segment contributes a video AND an audio.
  // Then a filter_complex trims, scales, concats them.
  const inputArgs: string[] = [];
  for (const s of opts.segments) {
    inputArgs.push("-i", s.videoPath);
  }
  for (const s of opts.segments) {
    inputArgs.push("-i", s.audioPath);
  }
  if (opts.musicPath) {
    inputArgs.push("-stream_loop", "-1", "-i", opts.musicPath);
  }

  const n = opts.segments.length;
  const filters: string[] = [];

  // Trim, scale, and pad each video stream
  for (let i = 0; i < n; i++) {
    const dur = segDurations[i].toFixed(3);
    filters.push(
      `[${i}:v]trim=duration=${dur},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1[v${i}]`
    );
  }
  // Trim each audio stream to its segment duration
  for (let i = 0; i < n; i++) {
    const dur = segDurations[i].toFixed(3);
    filters.push(
      `[${n + i}:a]atrim=duration=${dur},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${i}]`
    );
  }
  // Concat
  const vInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
  const aInputs = Array.from({ length: n }, (_, i) => `[a${i}]`).join("");
  filters.push(`${vInputs}concat=n=${n}:v=1:a=0[vout]`);
  filters.push(`${aInputs}concat=n=${n}:v=0:a=1[aspeech]`);

  let mapA = "[aspeech]";
  if (opts.musicPath) {
    const musicIdx = n * 2;
    filters.push(
      `[${musicIdx}:a]volume=${musicVolume},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=duration=${totalSeconds.toFixed(3)}[amusic]`
    );
    filters.push(`[aspeech][amusic]amix=inputs=2:duration=first:dropout_transition=2,volume=1.2[aout]`);
    mapA = "[aout]";
  }

  const outPath = join(opts.outDir, "stitched-broll.mp4");

  const cmd = [
    "ffmpeg",
    "-y",
    "-hide_banner",
    "-loglevel", "warning",
    ...inputArgs,
    "-filter_complex", filters.join(";"),
    "-map", "[vout]",
    "-map", mapA,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  ];

  console.log(`[stitch] running ffmpeg on ${n} segments → ${outPath}`);
  console.log(`[stitch] target: ${width}x${height} @ ${fps}fps, ${totalSeconds.toFixed(1)}s total`);

  const t0 = Date.now();
  execSync(cmd.map((a) => (a.includes(" ") || a.includes(";") || a.includes("[") ? `'${a}'` : a)).join(" "), {
    stdio: "inherit",
  });
  console.log(`[stitch] ✅ done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  return { outPath, totalSeconds };
}
