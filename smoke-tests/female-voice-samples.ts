import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Generates samples for 4 candidate female narrators from HeyGen Starfish for the natural-health channel.
// The text matches the channel's style (calm, informative, science-cited).

const TEST_TEXT =
  "Scientists at Harvard recently discovered something remarkable about the way your body processes inflammation. " +
  "One simple ingredient hiding in your kitchen could change everything.";

interface Candidate {
  name: string;
  voice_id: string;
  why: string;
}

// Pre-selected from our earlier exploration of HeyGen Starfish English Female voices.
// These tend to read calm + warm — fits a wellness narrator.
const CANDIDATES: Candidate[] = [
  { name: "Aria",   voice_id: "007e1378fc454a9f976db570ba6164a7", why: "Warm American mainstream" },
  { name: "Caryns", voice_id: "0082e70326864107823605db0d77f5e0", why: "Soft, gentle delivery" },
  { name: "Saffron", voice_id: "0258bbc2cd8648cfa357adfb833f6d7b", why: "Feminine, soothing" },
  { name: "Rose - UGC", voice_id: "0495e14c2bd74eb3aeeef03583e0bce5", why: "Conversational, lifelike" },
];

interface TTSResponse {
  data?: { audio_url: string; duration: number };
  error?: unknown;
}

async function run() {
  const key = process.env.HEYGEN_API_KEY!;
  const outDir = join(process.cwd(), "output", "voice-samples");
  await mkdir(outDir, { recursive: true });

  console.log(`Generating ${CANDIDATES.length} female narrator samples...\n`);
  console.log(`Test text: "${TEST_TEXT}"\n`);

  for (const c of CANDIDATES) {
    process.stdout.write(`→ ${c.name.padEnd(14)} `);
    const t0 = Date.now();
    const res = await fetch("https://api.heygen.com/v3/voices/speech", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: TEST_TEXT,
        voice_id: c.voice_id,
        input_type: "text",
        speed: 1.05, // slightly above natural — wellness pace, calm but moving
        locale: "en-US",
      }),
    });
    if (!res.ok) {
      console.log(`❌ HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as TTSResponse;
    const url = data.data?.audio_url;
    if (!url) {
      console.log(`❌ no audio_url`);
      continue;
    }
    const audio = Buffer.from(await (await fetch(url)).arrayBuffer());
    const safe = c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const fname = `${safe}.${url.includes(".wav") ? "wav" : "mp3"}`;
    await writeFile(join(outDir, fname), audio);
    console.log(`✅ ${((Date.now() - t0) / 1000).toFixed(0)}s, ${data.data!.duration.toFixed(1)}s audio → ${fname}`);
  }

  console.log(`\n💾 Saved to ${outDir}`);
  console.log(`\nOpen the folder and listen — pick which voice sounds right for the wellness channel.`);
}

run().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
