import { z } from "zod";

// One stat figure: "30%" + "REDUCTION IN INFLAMMATION" + "Harvard Study, 2023"
export const statCalloutSchema = z.object({
  type: z.literal("stat_callout"),
  value: z.string(),
  label: z.string(),
  source: z.string().optional(),
});

// Big number reveal: "7 SIGNS OF MAGNESIUM DEFICIENCY"
export const numberRevealSchema = z.object({
  type: z.literal("number_reveal"),
  number: z.union([z.number(), z.string()]),
  text: z.string(),
});

// Bullet list with optional emojis: ["☀️ Morning sun", "💧 Cold water", ...]
export const bulletListSchema = z.object({
  type: z.literal("bullet_list"),
  title: z.string(),
  items: z.array(z.string()).max(6),
});

// WRONG | RIGHT vertical split
export const comparisonSplitSchema = z.object({
  type: z.literal("comparison_split"),
  leftTitle: z.string(),
  leftItems: z.array(z.string()).max(4),
  rightTitle: z.string(),
  rightItems: z.array(z.string()).max(4),
});

// Full-screen warning card
export const warningCardSchema = z.object({
  type: z.literal("warning_card"),
  headline: z.string(),
  body: z.string().optional(),
});

// Quote callout: "After fifty, fat absorption drops by 40%."
export const quoteCalloutSchema = z.object({
  type: z.literal("quote_callout"),
  quote: z.string(),
  source: z.string().optional(),
});

// 3-step process: "Step 1 → Step 2 → Step 3"
export const processStepsSchema = z.object({
  type: z.literal("process_steps"),
  title: z.string().optional(),
  steps: z.array(z.object({
    title: z.string(),
    desc: z.string().optional(),
  })).min(2).max(4),
});

export const animationDataSchema = z.discriminatedUnion("type", [
  statCalloutSchema,
  numberRevealSchema,
  bulletListSchema,
  comparisonSplitSchema,
  warningCardSchema,
  quoteCalloutSchema,
  processStepsSchema,
]);

export const animationSchema = z.object({
  /** Global start time in seconds. */
  start: z.number(),
  /** Duration in seconds (typically 5-10). */
  duration: z.number(),
  /** The animation payload. */
  data: animationDataSchema,
});

export type AnimationData = z.infer<typeof animationDataSchema>;
export type Animation = z.infer<typeof animationSchema>;

// Palette — wellness-modern (deep teal/cream/coral)
export const PALETTE = {
  bgDark: "#0F1923",         // primary dark background
  bgPanel: "#162232",        // card surface
  accent: "#34D399",         // emerald — affirming
  accentRed: "#F87171",      // coral — warning
  accentYellow: "#FBBF24",   // amber — highlight
  textWhite: "#FFFFFF",
  textMuted: "#94A3B8",
  textCream: "#FEF3C7",
};
