import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

/**
 * Memory-efficient FFmpeg stitching:
 *   PASS 1 — for each segment, trim + scale its video and mux with its audio into seg-N.mp4
 *            (each ffmpeg call has only 2 inputs, super low memory)
 *   PASS 2 — concat all seg-N.mp4 using concat demuxer (-f concat, almost zero memory)
 *   PASS 3 — (optional) overlay background music with amix
 *
 * This avoids the single-filter_complex-with-76-inputs approach that OOM'd Railway.
 */

export interface StitchInput {
  outDir: string;
  segments: Array<{
    id: number;
    videoPath: string;
    audioPath: string;
    audioDuration: number;
  }>;
  musicPath?: string | null;
  musicVolume?: number;
  width?: number;
  height?: number;
  fps?: number;
  tailBufferSeconds?: number;
}

export interface StitchResult {
  outPath: string;
  totalSeconds: number;
}

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function stitchBroll(opts: StitchInput): Promise<StitchResult> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const fps = opts.fps ?? 30;
  const tail = opts.tailBufferSeconds ?? 0.1;
  const musicVolume = opts.musicVolume ?? 0.05;

  const tmpDir = join(opts.outDir, ".stitch-tmp");
  await mkdir(tmpDir, { recursive: true });

  const segDurations = opts.segments.map((s) => s.audioDuration + tail);
  const totalSeconds = segDurations.reduce((a, b) => a + b, 0);

  console.log(
    `[stitch] PASS 1: building ${opts.segments.length} per-segment mp4s (${width}x${height}@${fps}fps)`
  );
  const segMp4Paths: string[] = [];
  const t1 = Date.now();
  for (let i = 0; i < opts.segments.length; i++) {
    const seg = opts.segments[i];
    const dur = segDurations[i].toFixed(3);
    const outFile = join(tmpDir, `seg-${seg.id}.mp4`);
    const cmd = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-i", shellQuote(seg.videoPath),
      "-i", shellQuote(seg.audioPath),
      "-t", dur,
      // Map explicitly: video from input 0 (Pexels), audio from input 1
      // (HeyGen narration). Without -map, ffmpeg's stream-picker sometimes
      // chose the Pexels clip's silent/ambient audio track, leaving the
      // narration entirely out of the segment — that was the source of
      // the "narrator missing" silent windows in stitched concat.
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-vf", shellQuote(
        `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1`
      ),
      // Pad audio with silence to match the full segment duration (dur).
      "-af", shellQuote(`apad=whole_dur=${dur}`),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-g", String(fps),
      "-keyint_min", String(fps),
      "-sc_threshold", "0",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ac", "2",
      "-ar", "44100",
      "-movflags", "+faststart",
      shellQuote(outFile),
    ].join(" ");
    run(cmd);
    segMp4Paths.push(outFile);
    if ((i + 1) % 10 === 0 || i === opts.segments.length - 1) {
      console.log(`  [stitch] PASS 1: ${i + 1}/${opts.segments.length} segments done`);
    }
  }
  console.log(`[stitch] PASS 1 done in ${((Date.now() - t1) / 1000).toFixed(0)}s`);

  // PASS 2: concat all seg-N.mp4 using concat demuxer (-f concat — memory near zero)
  console.log(`[stitch] PASS 2: concat demuxer on ${segMp4Paths.length} files`);
  const listPath = join(tmpDir, "concat-list.txt");
  await writeFile(
    listPath,
    segMp4Paths.map((p) => `file ${shellQuote(p)}`).join("\n") + "\n"
  );

  const concatPath = opts.musicPath
    ? join(tmpDir, "concat-no-music.mp4")
    : join(opts.outDir, "stitched-broll.mp4");

  const t2 = Date.now();
  // Re-encode audio (not video) during concat. With "-c copy" the AAC priming
  // samples (~24ms per segment) at each join become audible silence/glitches
  // — ~900ms total lost across 38 segments, drifting captions out of sync.
  // Re-encoding audio in one pass produces a single continuous AAC stream.
  run(
    [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-f", "concat",
      "-safe", "0",
      "-i", shellQuote(listPath),
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      "-movflags", "+faststart",
      shellQuote(concatPath),
    ].join(" ")
  );
  console.log(`[stitch] PASS 2 done in ${((Date.now() - t2) / 1000).toFixed(0)}s`);

  // Diagnostic: silence scan on the NARRATOR-ONLY track (before music mix).
  // This catches "narrator-silent" regions that get masked by music in the
  // final output — the user's actual complaint.
  try {
    const silOut = execSync(
      `ffmpeg -hide_banner -nostats -i ${shellQuote(concatPath)} -af "silencedetect=noise=-30dB:duration=1.5" -f null - 2>&1 | grep -E "silence_(start|end)" || true`,
      { encoding: "utf8", shell: "/bin/bash" } as unknown as { shell: string }
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
      console.log(`[stitch] ✅ narrator-only audio has no silent windows >= 1.5s`);
    } else {
      console.log(`[stitch] ⚠️  NARRATOR-ONLY audio has ${windows.length} silent window(s) >= 1.5s:`);
      for (const w of windows) {
        console.log(`         silence: ${w.start.toFixed(2)}s → ${w.end.toFixed(2)}s  (${w.dur.toFixed(2)}s long)`);
      }
    }
  } catch (e) {
    console.warn(`[stitch] narrator silence scan failed: ${(e as Error).message.slice(0, 100)}`);
  }

  let finalPath = concatPath;

  if (opts.musicPath) {
    // PASS 3: mix in background music (only 2 inputs → low memory)
    console.log(`[stitch] PASS 3: mixing in background music at volume ${musicVolume}`);
    const outWithMusic = join(opts.outDir, "stitched-broll.mp4");
    const t3 = Date.now();
    run(
      [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", shellQuote(concatPath),
        "-stream_loop", "-1",
        "-i", shellQuote(opts.musicPath),
        // Narrator goes through unchanged (no loudnorm — single-pass loudnorm
        // on a long stitched track can cause uneven gain reductions). HeyGen
        // output is already consistent enough.
        // Music: loudnorm to -26 LUFS, sidechain-ducked under narrator.
        "-filter_complex", shellQuote(
          `[0:a]asplit=2[narr1][narr_sc];` +
          `[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=duration=${totalSeconds.toFixed(3)},loudnorm=I=-26:LRA=11:TP=-3.0,volume=${musicVolume}[mus_raw];` +
          `[mus_raw][narr_sc]sidechaincompress=threshold=0.05:ratio=3:attack=15:release=700:makeup=1[mus_ducked];` +
          `[narr1][mus_ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`
        ),
        "-map", "0:v",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        shellQuote(outWithMusic),
      ].join(" ")
    );
    console.log(`[stitch] PASS 3 done in ${((Date.now() - t3) / 1000).toFixed(0)}s`);
    finalPath = outWithMusic;
  }

  // Cleanup intermediate per-segment mp4s + list to save disk
  for (const p of segMp4Paths) {
    try { await unlink(p); } catch {}
  }
  try { await unlink(listPath); } catch {}
  if (opts.musicPath) {
    try { await unlink(concatPath); } catch {}
  }

  return { outPath: finalPath, totalSeconds };
}
