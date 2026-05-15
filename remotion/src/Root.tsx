import React from "react";
import { Composition } from "remotion";
import { Long, longSchema, DEFAULT_PROPS } from "./Long";

export const Root: React.FC = () => {
  return (
    <Composition
      id="Long"
      component={Long}
      schema={longSchema}
      defaultProps={DEFAULT_PROPS}
      durationInFrames={DEFAULT_PROPS.durationFrames}
      fps={DEFAULT_PROPS.fps}
      width={1920}
      height={1080}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.durationFrames,
        fps: props.fps,
      })}
    />
  );
};
