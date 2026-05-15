import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Topic } from "./pick-topic.ts";

/**
 * Long-form (5 min) script for the Natural Hacks channel.
 * Output: 35-45 segments. Each segment is one narration "beat" (~6-10s of audio)
 * with explicit Pexels search keywords that map tightly to what the narrator says.
 */

export interface Segment {
  id: number;
  /** Story-arc role */
  role: "hook" | "problem" | "context" | "science" | "tip" | "transition" | "cta";
  /** Narration text the host reads. ~15-25 words. */
  text: string;
  /** Ordered list of 3-5 Pexels search keywords, most specific first. The Pexels
   * module tries them in order until it finds a clip ≥ the segment's audio length. */
  visual_keywords: string[];
}

export async function generateScript(topic: Topic): Promise<Segment[]> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 600_000,
    maxRetries: 2,
  });

  const systemPrompt = `You write 5-minute YouTube scripts for "Natural Hacks" — a faceless channel about home remedies, natural cures, and wellness wisdom.

Audience: adults 40+ who care about their health and want practical, science-flavored tips they can apply at home with everyday ingredients.

CHANNEL STYLE (study carefully):
  • Hook with curiosity + science authority: "Scientists just discovered…", "Doctors don't tell you…", "One ingredient hiding in your kitchen…"
  • Calm informative tone — soothing, never shouty (the visuals + caps in the TITLE do the heavy lifting; the narration is gentle)
  • Specific actionable tips with named ingredients/practices (turmeric, ginger, magnesium, breathwork, walking-after-meals, etc.)
  • Light scientific framing ("research shows", "studies suggest") without medical claims
  • Always include a disclaimer at the very end ("information not medical advice")

OUTPUT FORMAT — A JSON ARRAY OF 36-42 SEGMENTS:

Each segment has:
  • id (1-based)
  • role: one of "hook" | "problem" | "context" | "science" | "tip" | "transition" | "cta"
  • text: 15-25 words of narration. A complete sentence or two. No commas inside? Commas are FINE here (this is long-form, not shorts) but keep sentences clean.
  • visual_keywords: array of 3-5 Pexels search phrases. MOST SPECIFIC FIRST.

STRUCTURE OF A 5-MINUTE VIDEO (~300s of audio):
  Segments  1-2   (HOOK, ~15s): bold opener with curiosity gap
  Segments  3-6   (PROBLEM, ~40s): the ailment / unwanted experience, made relatable
  Segments  7-10  (CONTEXT, ~40s): brief history / why this matters / what science is finding
  Segments 11-15  (SCIENCE, ~50s): the mechanism — why the body works this way
  Segments 16-32  (TIPS, ~150s): 3-5 specific recommendations with how-to detail
  Segments 33-38  (CTA + DISCLAIMER, ~30s): summarize, subscribe prompt, disclaimer

VISUAL_KEYWORDS RULES:
  Specific, visually concrete. Pexels search returns videos, so describe what the CLIP would show.
  ✓ "fresh turmeric root being grated onto cutting board"
  ✓ "elderly woman drinking warm tea by window"
  ✓ "olive oil drizzled onto green salad slow motion"
  ✗ "health" / "food" / "wellness" (too generic)

  Avoid words Pexels won't have content for (specific brand names, AI imagery).
  Use sensory-rich phrases: "close-up", "slow motion", "morning light", "smiling".

  Provide 3-5 keywords per segment — they're tried in priority order, so the first should be your best fit.

Return ONLY a valid JSON array. No markdown fences. No commentary.`;

  const userPrompt = `Topic: ${topic.title}

Premise: ${topic.premise}

Category: ${topic.category}
Audience cue: ${topic.audience}
Visual tone: ${topic.visual_tone}

Write the full 36-42 segment script. Calm voice, science-flavored authority, practical tips.

Remember: VISUAL_KEYWORDS must be vivid + Pexels-searchable. No emoji, no markdown.

Return ONLY the JSON array.`;

  console.log(`[script] generating long-form script for "${topic.title}"...`);
  const t0 = Date.now();

  const res = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 12000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let segments: Segment[];
  try {
    segments = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned unparseable JSON:\n${text.slice(0, 800)}`);
  }
  if (!Array.isArray(segments) || segments.length < 30 || segments.length > 50) {
    throw new Error(`Expected 36-42 segments (allowing 30-50), got ${segments?.length ?? "non-array"}`);
  }
  for (const s of segments) {
    if (!s.id || !s.text || !Array.isArray(s.visual_keywords) || s.visual_keywords.length < 2) {
      throw new Error(`Segment ${s.id ?? "?"} missing required fields (id/text/visual_keywords)`);
    }
  }

  console.log(
    `[script] ✅ ${segments.length} segments in ${((Date.now() - t0) / 1000).toFixed(0)}s — ` +
      `in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`
  );
  return segments;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pickNextTopic, loadTopics } = await import("./pick-topic.ts");
  const arg = process.argv[2] ?? "next";
  const outPath = process.argv[3] ?? join(process.cwd(), "config", "segments-generated.json");
  let topic;
  if (arg === "next") {
    topic = await pickNextTopic();
  } else {
    const all = await loadTopics();
    const match = all.find((t) => t.id === arg);
    if (!match) throw new Error(`No topic id="${arg}"`);
    topic = match;
  }
  console.log(`[script] Topic: ${topic.title}\n`);
  const segments = await generateScript(topic);
  await writeFile(outPath, JSON.stringify(segments, null, 2));
  console.log(`\nSaved ${segments.length} segments → ${outPath}\n`);
  for (const s of segments.slice(0, 8)) {
    console.log(`  ${s.id} (${s.role}): "${s.text}"`);
    console.log(`     keywords: ${s.visual_keywords.slice(0, 3).join(" / ")}`);
  }
  console.log(`  ... and ${segments.length - 8} more`);
}
