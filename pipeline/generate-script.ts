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
  role: "hook" | "problem" | "context" | "science" | "tip" | "transition" | "cta" | "rehook";
  /** Narration text the host reads. ~15-25 words. */
  text: string;
  /** Ordered list of 3-5 Pexels search keywords, most specific first. The Pexels
   * module tries them in order until it finds a clip ≥ the segment's audio length. */
  visual_keywords: string[];
  /** Optional 1-based section index — populated by Claude or inferred at runtime. */
  section_id?: number;
}

export interface Section {
  /** 1-based. */
  id: number;
  /** Short ALL-CAPS title for the SectionBadge ("SIGN 1", "TIP 2", "REASON 3"). */
  title: string;
  /** Tagline for ComingUpCard ("Brittle Fingernails", "Bloating After Meals"). */
  subtitle: string;
  /** First segment ID belonging to this section. */
  first_seg_id: number;
  /** Last segment ID belonging to this section. */
  last_seg_id: number;
}

export interface ScriptResult {
  segments: Segment[];
  sections: Section[];
  /** Segment ID where Claude inserted a mid-video re-hook (e.g. "but the next is the most shocking…"). */
  rehook_seg_id?: number;
}

export async function generateScript(topic: Topic): Promise<ScriptResult> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 600_000,
    maxRetries: 2,
  });

  const systemPrompt = `You write 5-minute YouTube scripts for "Natural Hacks" — a faceless channel about home remedies, natural cures, and wellness wisdom.

Audience: adults 40+ who care about their health and want practical, science-flavored tips they can apply at home with everyday ingredients.

CHANNEL STYLE (study carefully):
  • Calm informative tone — soothing, never shouty (the visuals + caps in the TITLE do the heavy lifting; the narration is gentle)
  • Specific actionable tips with named ingredients/practices
  • Light scientific framing ("research shows", "studies suggest") without medical claims
  • Always include a disclaimer at the very end

═══════ RETENTION DESIGN RULES (CRITICAL — these drive watch-time) ═══════

1. OPENING HOOK (segments 1-2, role="hook") — MAX 15 seconds.
   • Open with a SHOCKING FACT or STATISTIC. NOT a question.
   ✗ BAD: "What if everything you knew about acid was wrong?"
   ✓ GOOD: "One in three adults over 60 has low stomach acid — and reflux pills make it worse."
   ✓ GOOD: "Doctors are now reversing diabetes with a 50-cent kitchen spice."
   Then tease: "Stay until sign #3 — it's the one most people miss entirely."

2. NUMBERED SECTIONS — split the body into 3-7 clearly-numbered SECTIONS.
   • For a "5 signs" video → 5 sections. "7 foods" → 7. "3 mistakes" → 3.
   • Each section gets a short ALL-CAPS title ("BRITTLE FINGERNAILS", "MORNING BLOAT").
   • The narration in segments belonging to a section should weave the section number
     naturally: "The second sign is…", "Tip three is the most overlooked one…".

3. MID-VIDEO RE-HOOK (one segment with role="rehook") at roughly 50% of the way
   through the body (NOT in section 1 or the last section). It teases what's
   coming: "But the next sign is the one most doctors completely miss…" or
   "Before the most important tip, you need to know one more thing…".

4. CTA / DISCLAIMER tail (~25-30 seconds) at the end.

OUTPUT FORMAT — VALID JSON OBJECT (NOT just an array):
{
  "segments": [
    {
      "id": 1,
      "role": "hook" | "problem" | "context" | "science" | "tip" | "transition" | "cta" | "rehook",
      "text": "15-25 words of narration. Clean sentences.",
      "visual_keywords": ["most specific first", "fallback 1", "fallback 2"],
      "section_id": 0 or 1..N    // 0 means "not in any numbered section" (hook/rehook/cta/disclaimer)
    },
    ...
  ],
  "sections": [
    {
      "id": 1,
      "title": "SIGN 1" | "TIP 1" | "REASON 1",  // ALL CAPS, very short
      "subtitle": "Brittle Fingernails",          // descriptive 2-4 words
      "first_seg_id": 9,
      "last_seg_id": 13
    },
    ...
  ],
  "rehook_seg_id": 22    // the segment with role="rehook"
}

STRUCTURE (~300s of audio):
  Segments  1-2  (HOOK, ~12s): shocking fact + "stay until sign #X" tease
  Segments  3-8  (PROBLEM + CONTEXT, ~50s)
  Segments  9-30 (THE NUMBERED SECTIONS, ~190s) — split into 3-7 sections
   One single segment in here is role="rehook" at ~50% mark
  Segments 31-38 (CTA + DISCLAIMER, ~30s)

VISUAL_KEYWORDS RULES (unchanged): vivid + Pexels-searchable. 3-5 phrases, specific-first.

Return ONLY the JSON object. No markdown fences. No commentary.`;

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

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned unparseable JSON:\n${text.slice(0, 800)}`);
  }

  // Accept either the new object form ({segments, sections, rehook_seg_id})
  // or the legacy bare array (graceful migration during prompt evolution).
  let segments: Segment[];
  let sections: Section[] = [];
  let rehook_seg_id: number | undefined;
  if (Array.isArray(parsed)) {
    segments = parsed;
  } else if (parsed && Array.isArray(parsed.segments)) {
    segments = parsed.segments;
    sections = Array.isArray(parsed.sections) ? parsed.sections : [];
    rehook_seg_id = typeof parsed.rehook_seg_id === "number" ? parsed.rehook_seg_id : undefined;
  } else {
    throw new Error(`Claude output not in expected shape:\n${text.slice(0, 600)}`);
  }

  if (!Array.isArray(segments) || segments.length < 30 || segments.length > 50) {
    throw new Error(`Expected 36-42 segments (allowing 30-50), got ${segments?.length ?? "non-array"}`);
  }
  for (const s of segments) {
    if (!s.id || !s.text || !Array.isArray(s.visual_keywords) || s.visual_keywords.length < 2) {
      throw new Error(`Segment ${s.id ?? "?"} missing required fields (id/text/visual_keywords)`);
    }
  }

  // Fallback: if Claude didn't include sections, infer them by grouping consecutive
  // "tip" segments. Each contiguous run of "tip" becomes one section.
  if (sections.length === 0) {
    const tipRuns: Array<{ first: number; last: number }> = [];
    let runStart: number | null = null;
    for (const s of segments) {
      if (s.role === "tip") {
        if (runStart === null) runStart = s.id;
      } else {
        if (runStart !== null) {
          tipRuns.push({ first: runStart, last: segments.find((x) => x.id === runStart!)!.id });
        }
        runStart = null;
      }
    }
    if (runStart !== null) tipRuns.push({ first: runStart, last: segments[segments.length - 1].id });
    sections = tipRuns.map((r, i) => ({
      id: i + 1,
      title: `TIP ${i + 1}`,
      subtitle: `Step ${i + 1}`,
      first_seg_id: r.first,
      last_seg_id: r.last,
    }));
  }

  // Fallback: tag each segment with section_id if missing.
  for (const seg of segments) {
    if (seg.section_id === undefined) {
      const inSec = sections.find((s) => seg.id >= s.first_seg_id && seg.id <= s.last_seg_id);
      seg.section_id = inSec ? inSec.id : 0;
    }
  }

  // Fallback rehook: pick a "transition" or "context" segment near 50%.
  if (rehook_seg_id === undefined) {
    const mid = Math.floor(segments.length / 2);
    const candidate = segments
      .slice(Math.max(0, mid - 4), mid + 4)
      .find((s) => s.role === "transition" || s.role === "context");
    if (candidate) rehook_seg_id = candidate.id;
  }

  console.log(
    `[script] ✅ ${segments.length} segments / ${sections.length} sections in ${((Date.now() - t0) / 1000).toFixed(0)}s — ` +
      `in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`
  );
  if (sections.length) {
    for (const s of sections) {
      console.log(`         ${s.title}: ${s.subtitle} (segs ${s.first_seg_id}-${s.last_seg_id})`);
    }
  }
  if (rehook_seg_id) console.log(`         rehook: segment ${rehook_seg_id}`);

  return { segments, sections, rehook_seg_id };
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
  const result = await generateScript(topic);
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved ${result.segments.length} segments → ${outPath}\n`);
  for (const s of result.segments.slice(0, 8)) {
    console.log(`  ${s.id} (${s.role}): "${s.text}"`);
    console.log(`     keywords: ${s.visual_keywords.slice(0, 3).join(" / ")}`);
  }
  console.log(`  ... and ${result.segments.length - 8} more`);
}
