import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Animation } from "./types";
import { StatCalloutAnim } from "./StatCalloutAnim";
import { NumberRevealAnim } from "./NumberRevealAnim";
import { BulletListAnim } from "./BulletListAnim";
import { ComparisonSplitAnim } from "./ComparisonSplitAnim";
import { WarningCardAnim } from "./WarningCardAnim";
import { QuoteCalloutAnim } from "./QuoteCalloutAnim";
import { ProcessStepsAnim } from "./ProcessStepsAnim";

export type { Animation, AnimationData } from "./types";
export { animationSchema } from "./types";

interface Props {
  animations: Animation[];
}

/**
 * Renders the active animation (if any) for the current frame.
 * Animations have opaque backgrounds, so when one is active it completely
 * covers the B-roll underneath (this is by design — user wants animations
 * to REPLACE footage, not overlay on top of it).
 */
export const AnimationDispatcher: React.FC<Props> = ({ animations }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const active = animations.find((a) => t >= a.start && t < a.start + a.duration);
  if (!active) return null;

  const localFrame = frame - Math.floor(active.start * fps);
  const common = { localFrame, fps, duration: active.duration };

  switch (active.data.type) {
    case "stat_callout":
      return <StatCalloutAnim {...active.data} {...common} />;
    case "number_reveal":
      return <NumberRevealAnim {...active.data} {...common} />;
    case "bullet_list":
      return <BulletListAnim {...active.data} {...common} />;
    case "comparison_split":
      return <ComparisonSplitAnim {...active.data} {...common} />;
    case "warning_card":
      return <WarningCardAnim {...active.data} {...common} />;
    case "quote_callout":
      return <QuoteCalloutAnim {...active.data} {...common} />;
    case "process_steps":
      return <ProcessStepsAnim {...active.data} {...common} />;
    default:
      return null;
  }
};
