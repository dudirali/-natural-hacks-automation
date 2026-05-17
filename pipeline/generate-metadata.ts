import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Topic } from "./pick-topic.ts";
import type { Segment } from "./generate-script.ts";

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  /** Short punchy thumbnail line (3-6 words, ALL CAPS). e.g. "7 SILENT SIGNS" or "DRINK BEFORE BED". */
  thumbnail_hook: string;
  /** One bold accent word/number from the hook that should stand out. */
  thumbnail_accent: string;
  /** Small uppercase kicker shown above the hook. e.g. "WARNING", "DOCTORS HIDE", "STUDY:". 1-2 words. */
  thumbnail_kicker: string;
  /** Pexels PHOTO search query for a hero image emphasising emotion/relevance.
   *  e.g. "concerned senior woman looking", "doctor pointing diagram", "close up tired eyes". */
  thumbnail_image_query: string;
}

const DISCLAIMER = `
DISCLAIMER - The information presented on this channel is for general educational and informational purposes only. It is not a substitute for professional medical advice or treatment. We do not intend to diagnose, treat, cure, or prevent any disease. Always consult a licensed healthcare professional with questions about a medical condition.`.trim();

export async function generateMetadata(topic: Topic, segments: Segment[]): Promise<YouTubeMetadata> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const narration = segments.map((s) => s.text).join(" ").slice(0, 1500);

  const systemPrompt = `You generate YouTube metadata for "Natural Hacks" — a faceless wellness channel.

STYLE (match the channel exactly):
  • Title: clickbait educational with strategic CAPS. Max 95 chars. End with " #shorts" REMOVED (this channel is long-form).
    Real channel examples:
    - "The 1 Artery-Cleansing Food Your Doctor NEVER Mentioned"
    - "Scientists Find a SHOCKING Tinnitus Link in Your Kitchen"
    - "5 Diet Mistakes That Are SECRETLY Blocking Weight Loss"
  • Description structure (mandatory):
    1. 2-sentence summary of what viewer will learn.
    2. "Timestamps" section with 5-7 timestamps and labels.
    3. 5x5 grid of relevant hashtags (25 hashtags total, one cluster per line).
    4. (the disclaimer will be appended by code, you do not write it)
  • Tags: array of 12-18 lowercase phrases — mix of broad (health, natural remedies) + specific (turmeric, knee pain, etc.)
  • thumbnail_hook: 3-6 ALL-CAPS words, snappy and curiosity-driving. Strip filler ("THE", "A", "OF") when possible. Examples:
    - "7 SILENT SIGNS" (for "7 SILENT Signs of Magnesium Deficiency...")
    - "BANANA PEEL TRICK" (for "Rub a Banana Peel HERE for Instant Knee Pain Relief")
    - "MAGNESIUM AFTER 60" (when topic is more important than action)
  • thumbnail_accent: one word OR number from thumbnail_hook that should pop in a different color.
    Pick what's most visually arresting — usually the number, the body part, or the surprising noun.
    Examples: "7", "BANANA", "MAGNESIUM"
  • thumbnail_kicker: 1-2 ALL-CAPS words shown above the hook as a small "label". Creates urgency/curiosity.
    Examples: "WARNING", "DOCTORS HIDE", "STUDY:", "ALERT", "EXPOSED", "AGE 50+", "NEW RESEARCH"
  • thumbnail_image_query: a Pexels PHOTO search query (3-6 words) that will return a CLOSE-UP shot
    with strong human emotion or a clear body part / hero object.
    Prefer: faces of senior adults (concerned/surprised/touching their body), close-up body parts,
    hero foods/herbs. AVOID: wide landscapes, abstract textures, doctors in offices.
    Examples:
    - "concerned senior woman touching back close up"
    - "elderly man holding stomach worried close up"
    - "close up hand holding lemon and water glass"
    - "senior woman shocked face looking close up"

Return ONLY valid JSON with ALL these fields populated.`;

  const userPrompt = `Topic: ${topic.title}
Premise: ${topic.premise}
Category: ${topic.category}
Audience: ${topic.audience}

Narration excerpt (for context only, don't quote verbatim):
${narration}

Generate the metadata now. The description MUST include timestamps and a 5x5 hashtag grid.`;

  const res = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let meta: YouTubeMetadata = JSON.parse(cleaned);

  if (meta.title.length > 95) meta.title = meta.title.slice(0, 92) + "...";
  meta.tags = meta.tags.map((t) => t.toLowerCase().trim());

  // Defensive: ensure thumbnail fields exist even if Claude omitted them.
  if (!meta.thumbnail_hook) meta.thumbnail_hook = meta.title.toUpperCase().slice(0, 30);
  meta.thumbnail_hook = meta.thumbnail_hook.toUpperCase().trim();
  if (!meta.thumbnail_accent) {
    const words = meta.thumbnail_hook.split(/\s+/);
    meta.thumbnail_accent = words.find((w) => /^\d+$/.test(w)) ?? words[0];
  }
  meta.thumbnail_accent = meta.thumbnail_accent.toUpperCase().trim();
  if (!meta.thumbnail_kicker) meta.thumbnail_kicker = "WARNING";
  meta.thumbnail_kicker = meta.thumbnail_kicker.toUpperCase().trim();
  if (!meta.thumbnail_image_query) meta.thumbnail_image_query = "concerned senior person close up";

  // Append boilerplate disclaimer
  meta.description = meta.description.trim() + "\n\n" + DISCLAIMER;

  return meta;
}
