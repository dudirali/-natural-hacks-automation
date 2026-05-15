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

export async function narrate(
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

  // Retry-on-transient-error pattern (network timeouts under cloud egress)
  const MAX_ATTEMPTS = 3;
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
        signal: AbortSignal.timeout(90_000),
      });
      body = await res.text();
      break;
    } catch (e) {
      const err = e as Error & { cause?: { code?: string }; code?: string };
      const code = err.cause?.code ?? err.code ?? err.name;
      const transient =
        code === "UND_ERR_HEADERS_TIMEOUT" ||
        code === "UND_ERR_BODY_TIMEOUT" ||
        code === "UND_ERR_SOCKET" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "AbortError" ||
        code === "TimeoutError";
      if (!transient || attempt === MAX_ATTEMPTS) throw e;
      const delay = Math.pow(2, attempt - 1) * 1500;
      console.warn(
        `[narrate] ⚠️  attempt ${attempt}/${MAX_ATTEMPTS} failed (${code}). Retrying in ${delay}ms...`
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
  const audioRes = await fetch(data.audio_url);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const ext = data.audio_url.includes(".wav") ? "wav" : "mp3";
  const audioPath = join(outDir, `narration.${ext}`);
  await writeFile(audioPath, buf);

  const rawWords = data.word_timestamps ?? [];
  const words = rawWords.filter((w) => !w.word.startsWith("<") && !w.word.endsWith(">"));

  return {
    audioPath,
    duration: data.duration,
    words,
    voice: { voice_id: v.voice_id, name: v.name },
  };
}
