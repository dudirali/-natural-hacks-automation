import "dotenv/config";
import { narrate, type WordTimestamp } from "./narrate.ts";
import { join } from "node:path";

export interface SegmentNarration {
  id: number;
  audioPath: string;
  words: WordTimestamp[];
  duration: number;
}

/**
 * TTS for all segments in parallel.
 * To avoid overwhelming HeyGen + the network, we cap concurrency.
 */
export async function narrateSegments(
  segments: { id: number; text: string }[],
  segmentsRoot: string,
  options: { speed?: number; concurrency?: number } = {}
): Promise<SegmentNarration[]> {
  const speed = options.speed ?? 1.0;
  const concurrency = options.concurrency ?? 8;
  const results: SegmentNarration[] = new Array(segments.length);

  let cursor = 0;
  async function worker(workerId: number) {
    while (true) {
      const myIndex = cursor++;
      if (myIndex >= segments.length) return;
      const s = segments[myIndex];
      const outDir = join(segmentsRoot, String(s.id));
      const result = await narrate(s.text, outDir, { speed });
      results[myIndex] = {
        id: s.id,
        audioPath: result.audioPath,
        words: result.words,
        duration: result.duration,
      };
    }
  }
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  return results;
}
