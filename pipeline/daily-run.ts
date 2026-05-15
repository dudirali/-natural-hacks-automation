// EARLY DIAGNOSTIC LOGGING — fires BEFORE any imports that might fail.
// If the container crashes silently, at least we'll see "BOOT" in logs.
console.log(`\n[BOOT] daily-run.ts starting at ${new Date().toISOString()}`);
console.log(`[BOOT] node ${process.version} / platform=${process.platform} / cwd=${process.cwd()}`);
console.log(`[BOOT] env presence: ANTHROPIC=${!!process.env.ANTHROPIC_API_KEY} HEYGEN=${!!process.env.HEYGEN_API_KEY} PEXELS=${!!process.env.PEXELS_API_KEY} YT_REFRESH=${!!process.env.YOUTUBE_REFRESH_TOKEN} STATE_DIR=${process.env.STATE_DIR}`);

import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { pickNextTopic, markTopicUsed } from "./pick-topic.ts";
import { generateScript } from "./generate-script.ts";
import { generateMetadata } from "./generate-metadata.ts";
import { uploadToYouTube } from "./youtube-upload.ts";

console.log(`[BOOT] all imports loaded`);

const ROOT = process.cwd();

async function notify(title: string, message: string, isError = false) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Natural Hacks",
          content: `${isError ? "🚨" : "🌿"} **${title}**\n${message}`,
        }),
      });
      return;
    } catch (e) {
      console.warn("[notify] Discord failed:", (e as Error).message);
    }
  }
  if (process.platform === "darwin") {
    try {
      const escaped = (s: string) => s.replace(/"/g, '\\"');
      execSync(
        `osascript -e 'display notification "${escaped(message)}" with title "${escaped(title)}" sound name "${isError ? "Sosumi" : "Glass"}"'`
      );
      return;
    } catch {
      // fall through
    }
  }
  console.log(`[notify] ${title} — ${message}`);
}

function logHeader(label: string) {
  const line = "━".repeat(60);
  console.log(`\n${line}\n  ${label}\n${line}`);
}

async function main() {
  const runStart = Date.now();
  logHeader("Daily Run — Natural Hacks");
  console.log(`Started at: ${new Date().toISOString()}`);

  // 1) Pick topic
  logHeader("Step 1/7 — Pick next topic");
  const topic = await pickNextTopic();
  console.log(`Topic: ${topic.id} — "${topic.title}"`);
  const TOPIC_OUT_DIR = join(ROOT, "output", topic.id);
  await mkdir(TOPIC_OUT_DIR, { recursive: true });

  // 2) Generate script (Claude)
  logHeader("Step 2/7 — Generate long-form script (Claude)");
  const segments = await generateScript(topic);
  const segmentsPath = join(TOPIC_OUT_DIR, "segments.json");
  await writeFile(segmentsPath, JSON.stringify(segments, null, 2));
  console.log(`Saved ${segments.length} segments → ${segmentsPath}`);
  for (const s of segments.slice(0, 5)) {
    console.log(`  ${s.id} (${s.role}): "${s.text.slice(0, 70)}..."`);
  }

  // 3) Build pipeline (TTS + Pexels + render-props)
  logHeader("Step 3/7 — Build (TTS + Pexels + render-props)");
  execSync(`npx tsx pipeline/build-from-segments.ts`, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_TOPIC_ID: topic.id,
      BUILD_SEGMENTS_CONFIG: `output/${topic.id}/segments.json`,
    },
  });

  // 4) Remotion render (Long composition)
  logHeader("Step 4/7 — Remotion render");
  const finalMp4 = join(TOPIC_OUT_DIR, "final.mp4");
  const propsPath = join(TOPIC_OUT_DIR, "render-props.json");
  execSync(
    `npx remotion render remotion/src/index.ts Long ${finalMp4} --props=${propsPath}`,
    { cwd: ROOT, stdio: "inherit" }
  );
  console.log(`✅ Rendered → ${finalMp4}`);

  // 5) Generate YouTube metadata
  logHeader("Step 5/7 — Generate YouTube metadata");
  const metadata = await generateMetadata(topic, segments);
  console.log(`Title:    ${metadata.title}`);
  console.log(`Tags:     ${metadata.tags.slice(0, 8).join(", ")}...`);
  await writeFile(join(TOPIC_OUT_DIR, "metadata.json"), JSON.stringify(metadata, null, 2));

  // 6) Upload to YouTube as PUBLIC
  logHeader("Step 6/7 — Upload to YouTube (public)");
  const uploadResult = await uploadToYouTube({
    videoPath: finalMp4,
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
    privacyStatus: "public",
    categoryId: "27", // Education
  });
  console.log(`✅ Watch:  ${uploadResult.url}`);
  console.log(`   Studio: ${uploadResult.studioUrl}`);

  // 7) Mark topic used
  logHeader("Step 7/7 — Mark topic used");
  await markTopicUsed({
    id: topic.id,
    videoId: uploadResult.videoId,
    publishedAt: new Date().toISOString(),
    url: uploadResult.url,
  });
  console.log(`✅ ${topic.id} marked as used`);

  const totalMin = ((Date.now() - runStart) / 60_000).toFixed(1);
  logHeader(`Done in ${totalMin}min — ${uploadResult.url}`);
  await notify(
    "Natural Hacks video published",
    `${topic.title}\n${uploadResult.url}\n${totalMin}min`
  );
}

main().catch(async (e: unknown) => {
  const err = e as Error;
  console.error("\n❌ Daily run failed:", err.message);
  console.error(err.stack);
  await notify("Natural Hacks FAILED", err.message.slice(0, 300), true);
  process.exit(1);
});
