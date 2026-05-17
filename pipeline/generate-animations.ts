import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Segment } from "./generate-script.ts";

export interface GlobalWord {
  word: string;
  start: number;
  end: number;
}

export interface AnimationEntry {
  start: number;
  duration: number;
  data:
    | { type: "stat_callout"; value: string; label: string; source?: string }
    | { type: "number_reveal"; number: number | string; text: string }
    | { type: "bullet_list"; title: string; items: string[] }
    | { type: "comparison_split"; leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] }
    | { type: "warning_card"; headline: string; body?: string }
    | { type: "quote_callout"; quote: string; source?: string }
    | { type: "process_steps"; title?: string; steps: Array<{ title: string; desc?: string }> };
}

/**
 * Given the full segment list with cumulative timings, ask Claude to design
 * a set of full-screen animations / infographics that REPLACE the B-roll
 * during their window. Target: ~1 animation every 15-20 seconds.
 */
export async function generateAnimations(
  segments: Segment[],
  segmentTimings: Array<{ id: number; start: number; end: number }>
): Promise<AnimationEntry[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const scriptWithTimings = segments
    .map((s) => {
      const t = segmentTimings.find((x) => x.id === s.id);
      const range = t ? ` [${t.start.toFixed(1)}s–${t.end.toFixed(1)}s]` : "";
      return `(${s.id})${range}: ${s.text}`;
    })
    .join("\n");

  const totalSeconds = segmentTimings.length
    ? segmentTimings[segmentTimings.length - 1].end
    : 300;

  const system = `You are a motion-graphics director for a wellness YouTube channel.

Your job: read the narration script (with timings) and design FULL-SCREEN ANIMATIONS that REPLACE the B-roll during their window. These animations make the video feel professionally edited and educational.

RULES:
1. Generate one animation every ~15–20 seconds of video. For a ${totalSeconds.toFixed(0)}-second video that's roughly ${Math.round(totalSeconds / 17)} animations.
2. Each animation is 5–9 seconds long.
3. Pick the animation TYPE that best fits what the narrator is saying AT THAT MOMENT.
4. Animations must be SPECIFIC to the narration — pull actual numbers, lists, contrasts, and warnings from the script.
5. Spread animations across the full video — beginning, middle, AND end.
6. Do NOT place animations in the first 4 seconds or the last 10 seconds (those are intro hook / end screen).
7. Animations should not overlap.

ANIMATION TYPES + WHEN TO USE:

(a) "stat_callout" — when the narration mentions a specific number, %, or ratio.
    Props: { value: "30%", label: "REDUCTION IN INFLAMMATION", source?: "Harvard 2023" }

(b) "number_reveal" — when the narration introduces a count (e.g. "7 signs of...", "3 tips").
    Props: { number: 7, text: "SIGNS OF MAGNESIUM DEFICIENCY" }

(c) "bullet_list" — when the narration lists 3–5 items / foods / symptoms.
    Props: { title: "TOP FOODS", items: ["Oatmeal", "Avocado", "Walnuts"] }

(d) "comparison_split" — when narrator contrasts wrong vs right approach.
    Props: { leftTitle: "AVOID", leftItems: ["Cold lemon water", "Empty stomach"], rightTitle: "DO INSTEAD", rightItems: ["Warm water first", "After breakfast"] }

(e) "warning_card" — when narrator emphasizes a critical "NEVER do this".
    Props: { headline: "NEVER mix with coffee", body: "Coffee blocks vitamin D absorption for hours." }

(f) "quote_callout" — for striking facts or research quotes.
    Props: { quote: "After fifty, fat absorption drops by up to 40%.", source: "Journal of Nutrition" }

(g) "process_steps" — when narrator describes a 2–4 step recipe / routine.
    Props: { title: "MORNING ROUTINE", steps: [{title:"Soak chia overnight"},{title:"Add lemon + cinnamon"},{title:"Drink before food"}] }

OUTPUT FORMAT — VALID JSON ONLY, no prose:
{
  "animations": [
    { "start": 12.4, "duration": 7, "data": { "type": "number_reveal", "number": 7, "text": "SIGNS OF MAGNESIUM DEFICIENCY" } },
    { "start": 38.0, "duration": 6, "data": { "type": "stat_callout", "value": "30%", "label": "DEFICIENT WORLDWIDE" } },
    ...
  ]
}

CRITICAL:
- "start" must align with when the narration says it (use the [Xs–Ys] timings).
- All strings should be SHORT and PUNCHY — labels max 40 chars, items max 35 chars.
- Pick the BEST type per context — don't repeat the same type back-to-back.
- Use ALL CAPS for emphasis text where natural.`;

  const user = `Total video duration: ${totalSeconds.toFixed(1)}s.

Script with cumulative segment timings:

${scriptWithTimings}

Design the animations array now.`;

  const res = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let parsed: { animations?: AnimationEntry[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn(`[animations] JSON parse failed: ${(e as Error).message.slice(0, 200)}`);
    console.warn(`[animations] raw response (truncated): ${cleaned.slice(0, 400)}`);
    return [];
  }

  const list = Array.isArray(parsed.animations) ? parsed.animations : [];

  // Clamp to safe windows and sort by start time.
  const cleaned2 = list
    .filter((a) => a && typeof a.start === "number" && typeof a.duration === "number" && a.data)
    .map((a) => ({
      ...a,
      start: Math.max(4, Math.min(a.start, totalSeconds - 10)),
      duration: Math.max(3, Math.min(a.duration, 10)),
    }))
    .sort((a, b) => a.start - b.start);

  // Drop overlaps (keep earlier one).
  const out: AnimationEntry[] = [];
  for (const a of cleaned2) {
    const last = out[out.length - 1];
    if (last && a.start < last.start + last.duration) continue;
    out.push(a);
  }
  return out;
}
