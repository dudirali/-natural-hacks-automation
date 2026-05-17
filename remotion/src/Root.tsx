import React from "react";
import { Composition } from "remotion";
import { Long, longSchema, DEFAULT_PROPS } from "./Long";
import { Thumbnail, thumbnailSchema, DEFAULT_THUMBNAIL_PROPS } from "./Thumbnail";

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Long"
        component={Long}
        schema={longSchema}
        defaultProps={DEFAULT_PROPS}
        durationInFrames={DEFAULT_PROPS.durationFrames}
        fps={DEFAULT_PROPS.fps}
        width={1280}
        height={720}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationFrames,
          fps: props.fps,
        })}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        schema={thumbnailSchema}
        defaultProps={DEFAULT_THUMBNAIL_PROPS}
        durationInFrames={1}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
