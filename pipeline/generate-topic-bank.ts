import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Generate N natural-health "what hidden trick" topics and append to topic-bank.json. */

interface Topic {
  id: string;
  title: string;
  premise: string;
  category: string;
  audience: string;
  visual_tone: string;
}

const ROOT = process.cwd();
const BANK_PATH = join(ROOT, "config", "topic-bank.json");

const BATCH_SIZE = 50; // ~150 tokens per topic × 50 = ~7500 tokens of output, fits comfortably

async function main() {
  const target = parseInt(process.argv[2] ?? "50", 10);

  let existing: Topic[] = [];
  try {
    existing = JSON.parse(await readFile(BANK_PATH, "utf8"));
  } catch {
    existing = [];
  }

  console.log(`[topic-gen] Existing: ${existing.length}. Target: +${target} new (batches of ${BATCH_SIZE}).`);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 600_000,
    maxRetries: 2,
  });

  const systemPrompt = `You generate viral topics for "Natural Hacks" — a faceless YouTube channel about home remedies, natural cures, food-as-medicine, and wellness routines.

REAL TITLES from this channel (study the style — clickbait educational with caps):
- "The 1 Artery-Cleansing Food Your Doctor NEVER Mentioned"
- "Scientists Find a SHOCKING Tinnitus Link in Your Kitchen"
- "5 Diet Mistakes That Are SECRETLY Blocking Weight Loss"
- "Put a Rolled Towel Here For AMAZING Back Pain Relief"
- "A Neuroscientist's SECRET to Falling Asleep in 2 Minutes"
- "The #1 Olive Oil Mistake That GUARANTEES Brain Fog"
- "5 Reasons Your Legs Are Getting Weaker AFTER 60"
- "Eat These 3 Foods After 50 to Crush Inflammation"

Each topic object must have:
  id (kebab-case slug, unique),
  title (clickbait style with strategic CAPS like the examples above, ends with appropriate punctuation),
  premise (2-3 sentence explanation of what the 5-min video would cover),
  category (one of: skin, sleep, joints, weight-loss, diet-mistakes, longevity-50plus, brain-fog, inflammation, gut-health, heart-artery, eyes, vision, energy, hormones, breathwork, walking-movement, specific-food, specific-spice, deficiency, posture, detox),
  audience (e.g. "adults 40+", "people over 60", "women over 50", "anyone with chronic pain"),
  visual_tone (1 line — what kind of B-roll fits, e.g. "warm kitchen close-ups, fresh herbs, gentle hands preparing tea").

DIVERSITY: spread across all categories. Avoid clustering.

Return ONLY a JSON array. No markdown fences, no commentary.`;

  // Batch loop — each call asks for BATCH_SIZE topics, avoiding all titles
  // already in the bank (including prior batches in this same run).
  let acquired = 0;
  while (acquired < target) {
    const want = Math.min(BATCH_SIZE, target - acquired);
    const batchNum = Math.floor(acquired / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(target / BATCH_SIZE);
    console.log(`\n[topic-gen] Batch ${batchNum}/${totalBatches} — requesting ${want} topics...`);

    const userPrompt = `Generate ${want} brand-new topics for the channel. AVOID titles that already exist (full list):
${existing.map((t) => `- ${t.title}`).join("\n") || "(none yet)"}

Cover variety: gut health, sleep, joint pain, energy, brain fog, vision, skin, weight loss, heart health, breathing, gentle movement, deficiencies, specific foods/spices/seeds, age-specific (50+, 60+) tips, kitchen tricks, common mistakes.

Return ONLY a valid JSON array of ${want} objects.`;

    const t0 = Date.now();
    const res = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 12000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let newTopics: Topic[];
    try {
      newTopics = JSON.parse(cleaned);
    } catch (e) {
      console.error(`[topic-gen] batch ${batchNum} JSON parse failed; raw head:\n${cleaned.slice(0, 400)}`);
      throw e;
    }

    const existingIds = new Set(existing.map((t) => t.id));
    const existingTitles = new Set(existing.map((t) => t.title.toLowerCase().trim()));
    const fresh = newTopics.filter(
      (t) => !existingIds.has(t.id) && !existingTitles.has(t.title.toLowerCase().trim())
    );

    console.log(
      `[topic-gen] batch ${batchNum} → ${fresh.length}/${newTopics.length} unique in ${((Date.now() - t0) / 1000).toFixed(0)}s ` +
        `(tok in/out ${res.usage.input_tokens}/${res.usage.output_tokens})`
    );

    existing.push(...fresh);
    acquired += fresh.length;

    // Save incrementally so a mid-run failure doesn't lose work.
    await writeFile(BANK_PATH, JSON.stringify(existing, null, 2));

    if (fresh.length === 0) {
      console.warn(`[topic-gen] batch returned zero new topics — Claude is duplicating. Stopping early.`);
      break;
    }
  }

  console.log(`\n[topic-gen] Bank now has ${existing.length} topics (+${acquired} added).`);
  console.log(`Sample of newest:`);
  for (const t of existing.slice(-8)) console.log(`  • ${t.title}`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
