import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface NarrationResult {
  audioPath: string;
  duration: number;
  words: WordTimestamp[];
  voice: { voice_id: string; name: string };
}

interface VoiceConfig {
  narrator_primary: {
    voice_id: string;
    name: string;
    locale?: string;
    endpoint?: string;
  };
}

interface TTSResponse {
  data?: {
    audio_url: string;
    duration: number;
    request_id?: string | null;
    word_timestamps?: WordTimestamp[] | null;
  };
  error?: unknown;
}

const VOICE_CONFIG_PATH = join(process.cwd(), "config", "voices.json");

// Wrap the entire TTS-call-then-download flow in an outer retry loop so we
// can re-issue a fresh TTS request if HeyGen returns metadata that looks
// correct but the actual audio is broken (silent, truncated, etc).
const TTS_OUTER_ATTEMPTS = 3;
const MIN_ACCEPTABLE_LUFS = -35; // anything quieter is "dead air"

export async function narrate(
  text: string,
  outDir: string,
  options: { speed?: number } = {}
): Promise<NarrationResult> {
  let lastError: Error | null = null;
  for (let outer = 1; outer <= TTS_OUTER_ATTEMPTS; outer++) {
    try {
      const result = await narrateOnce(text, outDir, options);
      return result;
    } catch (e) {
      lastError = e as Error;
      if (outer < TTS_OUTER_ATTEMPTS) {
        console.warn(
          `  [narrate] ⚠️  outer attempt ${outer}/${TTS_OUTER_ATTEMPTS} failed: ${lastError.message}. Re-issuing TTS request...`
        );
        await new Promise((r) => setTimeout(r, 3000 * outer));
      }
    }
  }
  throw lastError ?? new Error("narrate failed after all attempts");
}

async function narrateOnce(
  text: string,
  outDir: string,
  options: { speed?: number } = {}
): Promise<NarrationResult> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY missing in .env");

  const voiceCfg: VoiceConfig = JSON.parse(await readFile(VOICE_CONFIG_PATH, "utf8"));
  const v = voiceCfg.narrator_primary;
  const endpoint = v.endpoint ?? "https://api.heygen.com/v3/voices/speech";

  const speed = options.speed ?? 1.0;

  // Retry-on-transient-error pattern. HeyGen TTS under cloud egress can stall.
  // 5 attempts × 180s timeout each. Worst case: ~30 min per segment if EVERY attempt times out.
  const MAX_ATTEMPTS = 5;
  const PER_ATTEMPT_TIMEOUT_MS = 180_000;
  let res: Response | null = null;
  let body = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "Content-Type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          text,
          voice_id: v.voice_id,
          input_type: "text",
          speed,
          locale: v.locale ?? "en-US",
        }),
        signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
      });
      body = await res.text();
      break;
    } catch (e) {
      const err = e as Error & { cause?: { code?: string | number }; code?: string | number };
      // Coerce to string for unified comparison. DOMException.code is a NUMBER (23 = TIMEOUT_ERR);
      // undici errors use string codes (UND_ERR_HEADERS_TIMEOUT, ECONNRESET, etc.). err.name is "TimeoutError" / "AbortError".
      const nameStr = String(err.name ?? "");
      const codeStr = String(err.cause?.code ?? err.code ?? "");
      const transient =
        // Name-based (DOMException, AbortController)
        nameStr === "TimeoutError" ||
        nameStr === "AbortError" ||
        // String code (undici / Node)
        codeStr === "UND_ERR_HEADERS_TIMEOUT" ||
        codeStr === "UND_ERR_BODY_TIMEOUT" ||
        codeStr === "UND_ERR_SOCKET" ||
        codeStr === "UND_ERR_CONNECT_TIMEOUT" ||
        codeStr === "ECONNRESET" ||
        codeStr === "ETIMEDOUT" ||
        codeStr === "EAI_AGAIN" ||
        // Numeric code (DOMException: 23 = TIMEOUT_ERR, 20 = ABORT_ERR)
        codeStr === "23" ||
        codeStr === "20";
      if (!transient || attempt === MAX_ATTEMPTS) {
        console.error(`[narrate] ❌ giving up after ${attempt} attempt(s). name=${nameStr} code=${codeStr}`);
        throw e;
      }
      const delay = Math.min(15_000, Math.pow(2, attempt - 1) * 2000);
      console.warn(
        `[narrate] ⚠️  attempt ${attempt}/${MAX_ATTEMPTS} failed (name=${nameStr} code=${codeStr}). Retrying in ${delay}ms...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!res) throw new Error("HeyGen TTS exhausted all retries");
  if (!res.ok) throw new Error(`HeyGen TTS failed: HTTP ${res.status} — ${body.slice(0, 500)}`);

  const tts = JSON.parse(body) as TTSResponse;
  const data = tts.data;
  if (!data?.audio_url) throw new Error(`No audio_url in TTS response: ${body.slice(0, 300)}`);

  await mkdir(outDir, { recursive: true });

  // Download with integrity check. Retry up to 3 times if the downloaded
  // file's actual duration (per ffprobe) is more than 0.5s shorter than
  // HeyGen's claimed duration — this catches network-truncated downloads
  // that would otherwise leave silent gaps in the stitched video.
  const ext = data.audio_url.includes(".wav") ? "wav" : "mp3";
  const audioPath = join(outDir, `narration.${ext}`);
  const claimedDuration = data.duration;
  const DOWNLOAD_RETRIES = 4;
  let actualDuration = 0;
  for (let attempt = 1; attempt <= DOWNLOAD_RETRIES; attempt++) {
    const audioRes = await fetch(data.audio_url, {
      signal: AbortSignal.timeout(90_000),
    });
    if (!audioRes.ok) {
      throw new Error(`Audio download failed: HTTP ${audioRes.status}`);
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    await writeFile(audioPath, buf);
    // Measure actual duration via ffprobe
    try {
      const { execSync } = await import("node:child_process");
      const out = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
        { encoding: "utf8" }
      ).trim();
      actualDuration = parseFloat(out);
    } catch {
      actualDuration = 0;
    }
    const shortBy = claimedDuration - actualDuration;
    if (actualDuration >= claimedDuration - 0.5) {
      if (attempt > 1) {
        console.log(
          `  [narrate] ✓ download OK on attempt ${attempt} (actual ${actualDuration.toFixed(2)}s / claimed ${claimedDuration.toFixed(2)}s)`
        );
      }
      break;
    }
    if (attempt === DOWNLOAD_RETRIES) {
      throw new Error(
        `Audio truncated after ${DOWNLOAD_RETRIES} attempts: got ${actualDuration.toFixed(2)}s, expected ${claimedDuration.toFixed(2)}s`
      );
    }
    console.warn(
      `  [narrate] ⚠️  truncated download (actual ${actualDuration.toFixed(2)}s / claimed ${claimedDuration.toFixed(2)}s — short by ${shortBy.toFixed(2)}s). Retrying ${attempt + 1}/${DOWNLOAD_RETRIES}...`
    );
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }

  // Dead-air detection — TWO metrics, since ebur128 alone misses partial
  // silence due to its gating algorithm (gates out silent parts so a file
  // that's 70% silent still reports -16 LUFS integrated).
  //
  //   metric 1: silencedetect — count total contiguous silence above 0.3s.
  //             If > 40% of the file is silence, it's broken narration.
  //   metric 2: volumedetect mean_volume — should be > -40 dBFS for a real
  //             narration. A mostly-silent file has mean_volume < -50.
  try {
    const { execSync } = await import("node:child_process");
    // silencedetect
    const silOut = execSync(
      `ffmpeg -hide_banner -nostats -i "${audioPath}" -af "silencedetect=noise=-40dB:duration=0.3" -f null - 2>&1 | grep -E "silence_(start|end)" || true`,
      { encoding: "utf8", shell: "/bin/bash" } as any
    );
    let silenceTotal = 0;
    let lastStart: number | null = null;
    for (const line of silOut.split("\n")) {
      const sm = line.match(/silence_start:\s*([\d.]+)/);
      const em = line.match(/silence_end:\s*([\d.]+)/);
      if (sm) lastStart = parseFloat(sm[1]);
      else if (em && lastStart != null) {
        silenceTotal += parseFloat(em[1]) - lastStart;
        lastStart = null;
      }
    }
    if (lastStart != null) silenceTotal += actualDuration - lastStart;
    const silenceRatio = actualDuration > 0 ? silenceTotal / actualDuration : 0;

    // volumedetect mean
    const meanOut = execSync(
      `ffmpeg -hide_banner -nostats -i "${audioPath}" -af volumedetect -f null - 2>&1 | grep mean_volume || true`,
      { encoding: "utf8", shell: "/bin/bash" } as any
    );
    const meanMatch = meanOut.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    const meanDb = meanMatch ? parseFloat(meanMatch[1]) : 0;

    if (silenceRatio > 0.4) {
      throw new Error(
        `narration mostly silent: ${(silenceRatio * 100).toFixed(0)}% silence (${silenceTotal.toFixed(1)}s of ${actualDuration.toFixed(1)}s), mean=${meanDb}dB. Text: "${text.slice(0, 60)}..."`
      );
    }
    if (meanDb < -45) {
      throw new Error(
        `narration mean volume too low: ${meanDb}dB (expected > -40). Likely dead audio. Text: "${text.slice(0, 60)}..."`
      );
    }
  } catch (e) {
    if ((e as Error).message.includes("narration ")) throw e;
    console.warn(`  [narrate] dead-air check skipped: ${(e as Error).message.slice(0, 100)}`);
  }

  const rawWords = data.word_timestamps ?? [];
  const words = rawWords.filter((w) => !w.word.startsWith("<") && !w.word.endsWith(">"));

  return {
    audioPath,
    // Use the ACTUAL measured duration, not HeyGen's claim. Even if both
    // were equal at download time, future pipeline math should reference
    // what's in the file.
    duration: actualDuration > 0 ? actualDuration : claimedDuration,
    words,
    voice: { voice_id: v.voice_id, name: v.name },
  };
}
