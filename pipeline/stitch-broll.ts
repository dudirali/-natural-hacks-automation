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
    const durNum = parseFloat(dur);
    const outFile = join(tmpDir, `seg-${seg.id}.mp4`);

    // === Cinematic treatment ===
    // 1) Ken Burns slow zoom (zoompan filter). First segment gets a stronger
    //    "hook" zoom for a punchier opener.
    // 2) Direction varies per segment (zoom-center / zoom-pan-right / zoom-pan-left)
    //    so the video doesn't feel monotone.
    // 3) Warm wellness color grade (eq filter).
    // 4) Subtle vignette to keep eye on center subject.
    // 5) Quick fade in/out at segment edges → smooth dip-to-black between cuts.
    const isHook = i === 0;
    const zoomIncr = isHook ? 0.0011 : 0.00045;
    const zoomCap = isHook ? 1.20 : 1.10;
    const variant = i % 3;
    // x/y expressions in zoompan: 'iw/2-(iw/zoom/2)' centers the crop.
    // For pan variants we add a slow drift on x.
    let zoomX: string;
    let zoomY: string;
    if (variant === 0 || isHook) {
      zoomX = "iw/2-(iw/zoom/2)"; // centered
      zoomY = "ih/2-(ih/zoom/2)";
    } else if (variant === 1) {
      // pan right: x slides from 0 toward iw-iw/zoom
      zoomX = `min((iw-iw/zoom),on*${(2.5).toFixed(2)})`;
      zoomY = "ih/2-(ih/zoom/2)";
    } else {
      // pan left: x slides the opposite way
      zoomX = `max(0,(iw-iw/zoom)-on*${(2.5).toFixed(2)})`;
      zoomY = "ih/2-(ih/zoom/2)";
    }
    const kenBurns = `zoompan=z='min(zoom+${zoomIncr},${zoomCap})':d=1:x='${zoomX}':y='${zoomY}':s=${width}x${height}:fps=${fps}`;
    // Warm grade: slight saturation lift + tilt toward red (gamma_r > 1, gamma_b < 1).
    const grade = `eq=saturation=1.10:gamma=0.97:gamma_r=1.03:gamma_g=0.99:gamma_b=0.96`;
    // Subtle vignette (radial darkening) — angle controls strength.
    const vig = `vignette=PI/5.5`;
    // Fade in/out (0.15s) — smooth dip-to-black at segment boundaries.
    const fadeOutStart = Math.max(0, durNum - 0.15).toFixed(3);
    const fade = `fade=t=in:st=0:d=0.15,fade=t=out:st=${fadeOutStart}:d=0.15`;
    const vfChain = [kenBurns, grade, vig, fade, "setsar=1"].join(",");

    const cmd = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-i", shellQuote(seg.videoPath),
      "-i", shellQuote(seg.audioPath),
      "-t", dur,
      // Map explicitly: video from input 0 (Pexels), audio from input 1 (HeyGen).
      // Without -map, ffmpeg's stream-picker sometimes chose the Pexels clip's
      // ambient audio track, leaving the narration entirely out of the segment.
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-vf", shellQuote(vfChain),
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

  // Build optional SFX track: a silent base + whoosh sounds placed at each
  // segment boundary. Tier-3 audio polish — adds tempo / "produced" feel.
  const ROOT = process.cwd();
  const whooshPath = join(ROOT, "assets", "sfx", "whoosh.mp3");
  let sfxTrackPath: string | null = null;
  try {
    const { existsSync } = await import("node:fs");
    if (existsSync(whooshPath) && opts.segments.length > 1) {
      sfxTrackPath = join(tmpDir, "sfx-track.wav");
      // Whoosh start times: 0.3s BEFORE each cut so the peak hits at the cut.
      const cuts: number[] = [];
      let acc = 0;
      for (let i = 0; i < opts.segments.length - 1; i++) {
        acc += segDurations[i];
        cuts.push(Math.max(0, acc - 0.3));
      }
      // Build filter: split the whoosh into N copies, delay each, mix with silence base.
      const N = cuts.length;
      const splitLabels = cuts.map((_, i) => `[w${i}]`).join("");
      const delays = cuts
        .map(
          (t, i) =>
            `[w${i}]adelay=${(t * 1000).toFixed(0)}|${(t * 1000).toFixed(0)}[d${i}]`
        )
        .join(";");
      const mixIns = ["[0:a]", ...cuts.map((_, i) => `[d${i}]`)].join("");
      const sfxFilter = `[1:a]asplit=${N}${splitLabels};${delays};${mixIns}amix=inputs=${N + 1}:duration=longest:normalize=0`;
      run(
        [
          "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
          "-f", "lavfi", "-t", totalSeconds.toFixed(3),
          "-i", "anullsrc=r=44100:cl=stereo",
          "-i", shellQuote(whooshPath),
          "-filter_complex", shellQuote(sfxFilter),
          "-ar", "44100", "-ac", "2",
          shellQuote(sfxTrackPath),
        ].join(" ")
      );
      console.log(`[stitch] sfx track built (${N} whooshes)`);
    }
  } catch (e) {
    console.warn(`[stitch] sfx build failed: ${(e as Error).message.slice(0, 120)}`);
    sfxTrackPath = null;
  }

  let finalPath = concatPath;

  if (opts.musicPath) {
    // PASS 3: mix narrator + music (+ optional SFX track).
    // Narrator gets podcast-style EQ + compression for a polished, even sound.
    // Music: loudnorm to -26 LUFS, sidechain-ducked under narrator.
    console.log(`[stitch] PASS 3: mixing narrator + music${sfxTrackPath ? " + sfx" : ""}`);
    const outWithMusic = join(opts.outDir, "stitched-broll.mp4");
    const t3 = Date.now();

    // Narrator EQ chain: highpass removes low rumble (<80Hz), lowpass tames
    // harsh top end (>12kHz), acompressor evens out dynamic range (radio sound).
    const narrChain = `highpass=f=80,lowpass=f=12000,acompressor=threshold=-18dB:ratio=3:attack=10:release=200:makeup=2`;

    const inputArgs: string[] = [
      "-i", shellQuote(concatPath),
      "-stream_loop", "-1", "-i", shellQuote(opts.musicPath),
    ];
    let filter: string;
    if (sfxTrackPath) {
      inputArgs.push("-i", shellQuote(sfxTrackPath));
      filter =
        `[0:a]${narrChain},asplit=2[narr1][narr_sc];` +
        `[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=duration=${totalSeconds.toFixed(3)},loudnorm=I=-26:LRA=11:TP=-3.0,volume=${musicVolume}[mus_raw];` +
        `[mus_raw][narr_sc]sidechaincompress=threshold=0.05:ratio=3:attack=15:release=700:makeup=1[mus_ducked];` +
        `[2:a]volume=0.55,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[sfx];` +
        `[narr1][mus_ducked][sfx]amix=inputs=3:duration=first:dropout_transition=0:normalize=0[a]`;
    } else {
      filter =
        `[0:a]${narrChain},asplit=2[narr1][narr_sc];` +
        `[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atrim=duration=${totalSeconds.toFixed(3)},loudnorm=I=-26:LRA=11:TP=-3.0,volume=${musicVolume}[mus_raw];` +
        `[mus_raw][narr_sc]sidechaincompress=threshold=0.05:ratio=3:attack=15:release=700:makeup=1[mus_ducked];` +
        `[narr1][mus_ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
    }

    run(
      [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        ...inputArgs,
        "-filter_complex", shellQuote(filter),
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
