/**
 * Sound Design Language v1.0 — single source of truth for all SFX placement.
 *
 * Principles:
 *   - Every visual event type maps to ONE specific sound. Same event = same
 *     sound, every video, forever. This is what "sound language" means.
 *   - Volumes are calibrated so the busiest moment (animation entry + first
 *     item click) doesn't drown the narrator (loudnorm'd) or the music
 *     (loudnorm'd to -26 LUFS).
 *   - The language has 5 categories:
 *       T = transitions (footage state changes)
 *       A = animation entries (one sound per animation TYPE)
 *       I = within-animation item events (each bullet/step/etc.)
 *       E = narration emphasis (numbers, urgent words)
 *       U = UI overlays (popups)
 *
 * To add a new sound, update SOUND_LANG below and pick the matching mp3.
 */

import { join } from "node:path";
import type { AnimationEntry } from "./generate-animations.ts";

const ROOT = process.cwd();
const SFX_DIR = join(ROOT, "assets", "sfx");
function p(file: string): string {
  return join(SFX_DIR, file);
}

/**
 * The complete sound language. Adding a new key here is the ONLY way to
 * introduce a new sound — all consumers go through this map.
 */
export const SOUND_LANG = {
  // ─── Category T: Transitions ───
  T_CUT: { path: p("sfx-whoosh.mp3"), volume: 0.40 },         // B-roll → B-roll (every segment cut)
  T_ANIM_IN: { path: p("sfx-swoosh-cinematic.mp3"), volume: 0.55 }, // B-roll → Animation
  T_ANIM_OUT: { path: p("sfx-swoosh-light.mp3"), volume: 0.38 },    // Animation → B-roll

  // ─── Category A: Animation entries (each type has its identity) ───
  A_NUMBER: { path: p("sfx-pop.mp3"), volume: 0.55 },         // number_reveal
  A_STAT: { path: p("sfx-rise.mp3"), volume: 0.50 },          // stat_callout
  A_WARNING: { path: p("sfx-impact.mp3"), volume: 0.65 },     // warning_card
  A_QUOTE: { path: p("sfx-shine.mp3"), volume: 0.50 },        // quote_callout
  A_LIST: { path: p("sfx-magic.mp3"), volume: 0.50 },         // bullet_list intro shimmer
  A_STEPS: { path: p("sfx-magic.mp3"), volume: 0.50 },        // process_steps intro shimmer
  A_COMPARE: { path: p("sfx-swoosh-heavy.mp3"), volume: 0.55 }, // comparison_split

  // ─── Category I: Within-animation item events ───
  I_LIST_ITEM: { path: p("sfx-click.mp3"), volume: 0.30 },    // each bullet appearing
  I_STEP: { path: p("sfx-click.mp3"), volume: 0.32 },         // each process step
  I_COMPARE_LEFT: { path: p("sfx-glitch.mp3"), volume: 0.28 }, // wrong-side items
  I_COMPARE_RIGHT: { path: p("sfx-sparkle.mp3"), volume: 0.30 }, // right-side items

  // ─── Category E: Narration emphasis ───
  E_NUMBER: { path: p("sfx-click.mp3"), volume: 0.26 },       // spoken numbers / %
  E_STRONG: { path: p("sfx-impact.mp3"), volume: 0.38 },      // WARNING / NEVER / STUDY / SECRET

  // ─── Category U: UI overlays ───
  U_SUBSCRIBE: { path: p("sfx-twinkle.mp3"), volume: 0.45 },  // subscribe popup at 28s
  U_ENDSCREEN: { path: p("sfx-success.mp3"), volume: 0.50 },  // end-screen entrance
} as const;

export type SoundKey = keyof typeof SOUND_LANG;

export interface SfxEvent {
  time: number;
  sfxPath: string;
  volume?: number;
}

/** Convert one SOUND_LANG key + time to an SfxEvent. */
export function sfx(key: SoundKey, time: number): SfxEvent {
  const def = SOUND_LANG[key];
  return { time, sfxPath: def.path, volume: def.volume };
}

/**
 * Animation entry sound — mapped from animation TYPE to the A_* sounds.
 * Wraps the assignment in one place so it stays consistent.
 */
export function animationEntryKey(type: AnimationEntry["data"]["type"]): SoundKey {
  switch (type) {
    case "number_reveal": return "A_NUMBER";
    case "stat_callout": return "A_STAT";
    case "warning_card": return "A_WARNING";
    case "quote_callout": return "A_QUOTE";
    case "bullet_list": return "A_LIST";
    case "process_steps": return "A_STEPS";
    case "comparison_split": return "A_COMPARE";
  }
}

const REMOTION_FPS = 30;

/**
 * Compute per-item event times within an animation, relative to the animation
 * start. The math here MIRRORS each animation component's internal reveal
 * timing, so the SFX hit exactly when the visual item appears on screen.
 *
 * Keep these in sync with the animation .tsx files in
 * remotion/src/components/animations/.
 */
export function computeItemEvents(animation: AnimationEntry): SfxEvent[] {
  const { start, duration, data } = animation;
  const totalFrames = duration * REMOTION_FPS;
  const events: SfxEvent[] = [];

  if (data.type === "bullet_list") {
    // BulletListAnim: items at frame `18 + i * perItem`, where perItem =
    // (totalFrames - 30) / items.length.
    const itemsWindowFrames = Math.max(1, totalFrames - 30);
    const perItem = itemsWindowFrames / Math.max(1, data.items.length);
    for (let i = 0; i < data.items.length; i++) {
      const tLocal = (18 + i * perItem) / REMOTION_FPS;
      events.push(sfx("I_LIST_ITEM", start + tLocal));
    }
  } else if (data.type === "process_steps") {
    // ProcessStepsAnim: steps at frame `18 + i * perStep`, perStep = max(12, (totalFrames-36)/steps).
    const perStep = Math.max(12, Math.floor((totalFrames - 36) / data.steps.length));
    for (let i = 0; i < data.steps.length; i++) {
      const tLocal = (18 + i * perStep) / REMOTION_FPS;
      events.push(sfx("I_STEP", start + tLocal));
    }
  } else if (data.type === "comparison_split") {
    // ComparisonSplitAnim: leftItems reveal from frame 18, rightItems from 24.
    const itemsWindow = (totalFrames - 30) / 2;
    const perLeft = itemsWindow / Math.max(1, data.leftItems.length);
    const perRight = itemsWindow / Math.max(1, data.rightItems.length);
    for (let i = 0; i < data.leftItems.length; i++) {
      events.push(sfx("I_COMPARE_LEFT", start + (18 + i * perLeft) / REMOTION_FPS));
    }
    for (let i = 0; i < data.rightItems.length; i++) {
      events.push(sfx("I_COMPARE_RIGHT", start + (24 + i * perRight) / REMOTION_FPS));
    }
  }
  // stat_callout / number_reveal / warning_card / quote_callout have no
  // additional item events — only the entry sound from A_*.

  return events;
}

export interface ComputeSfxOpts {
  /** Cumulative durations including tail buffers, in order of segment idx. */
  segDurations: number[];
  /** Global word timeline (segment-cumulative timings). */
  globalWords: Array<{ word: string; start: number; end: number }>;
  /** Animations (already generated, with global start times). */
  animations: AnimationEntry[];
  /** Total video length in seconds (for end-screen timing). */
  totalSeconds: number;
}

/** Word forms that get the E_STRONG impact sound when spoken. */
const STRONG_RE = /^(warning|never|always|secret|hidden|study|research|proven|shocking|dangerous|crucial|critical|deadly|stop|avoid|doctors?|scientists?)[.,!?:;]?$/i;
const NUMBER_RE = /^(\d+%?|\d+(?:st|nd|rd|th))[.,!?:;]?$/i;

/**
 * Build the full SFX event list for one video. This is the only place
 * timings get computed — call once with all inputs.
 */
export function computeAllSfxEvents(opts: ComputeSfxOpts): SfxEvent[] {
  const events: SfxEvent[] = [];

  // T_CUT — whoosh on every segment-to-segment cut. 0.3s before the cut so
  // the peak hits at the boundary.
  let cum = 0;
  for (let i = 0; i < opts.segDurations.length - 1; i++) {
    cum += opts.segDurations[i];
    events.push(sfx("T_CUT", Math.max(0, cum - 0.3)));
  }

  // T_ANIM_IN / T_ANIM_OUT — animation transitions
  for (const a of opts.animations) {
    events.push(sfx("T_ANIM_IN", a.start));
    events.push(sfx("T_ANIM_OUT", a.start + a.duration - 0.25));
  }

  // A_* — animation entry sounds (slightly delayed so the cinematic swoosh
  // peaks first, then the type-specific sound layers on top).
  for (const a of opts.animations) {
    events.push(sfx(animationEntryKey(a.data.type), a.start + 0.18));
  }

  // I_* — within-animation item events
  for (const a of opts.animations) {
    events.push(...computeItemEvents(a));
  }

  // E_STRONG + E_NUMBER — narration emphasis, throttled.
  // Max 14 emphasis SFX total, min 3.5s apart, prefer STRONG over NUMBER.
  const strongTimes = opts.globalWords.filter((w) => STRONG_RE.test(w.word)).map((w) => w.start);
  const numberTimes = opts.globalWords.filter((w) => NUMBER_RE.test(w.word)).map((w) => w.start);
  const candidates: Array<{ t: number; key: SoundKey }> = [
    ...strongTimes.map((t) => ({ t, key: "E_STRONG" as SoundKey })),
    ...numberTimes.map((t) => ({ t, key: "E_NUMBER" as SoundKey })),
  ].sort((a, b) => a.t - b.t);
  let lastEmphT = -Infinity;
  let emphCount = 0;
  for (const c of candidates) {
    if (emphCount >= 14) break;
    if (c.t - lastEmphT < 3.5) continue;
    // Also skip if it's within 1.5s of an animation (sounds would clash).
    const nearAnim = opts.animations.some(
      (a) => c.t >= a.start - 1.5 && c.t <= a.start + a.duration + 1.0
    );
    if (nearAnim) continue;
    events.push(sfx(c.key, c.t));
    lastEmphT = c.t;
    emphCount++;
  }

  // U_SUBSCRIBE — popup at 28s + 0.05s
  events.push(sfx("U_SUBSCRIBE", 28.05));

  // U_ENDSCREEN — end-screen entrance at totalSeconds - 8 + 0.2s buffer
  events.push(sfx("U_ENDSCREEN", Math.max(0, opts.totalSeconds - 7.8)));

  // Sort by time
  events.sort((a, b) => a.time - b.time);
  return events;
}
