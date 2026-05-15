import "dotenv/config";
import { google } from "googleapis";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export interface YouTubeUploadOptions {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  /** "26" = Howto & Style; "27" = Education. Natural Hacks fits Education best. */
  categoryId?: string;
  privacyStatus?: "private" | "unlisted" | "public";
  madeForKids?: boolean;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  studioUrl: string;
}

function makeOAuth2Client() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error(
      "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN missing. Run `npm run yt:oauth` (pick @naturalhacks_official channel)."
    );
  }
  const client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    "http://localhost:3030/callback"
  );
  client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
  return client;
}

export async function uploadToYouTube(opts: YouTubeUploadOptions): Promise<YouTubeUploadResult> {
  const stats = await stat(opts.videoPath);
  const fileSizeBytes = stats.size;
  console.log(`[upload] file=${opts.videoPath}  size=${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB`);
  console.log(`[upload] title="${opts.title}"`);
  console.log(`[upload] privacy=${opts.privacyStatus ?? "public"}`);

  const auth = makeOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth });

  const t0 = Date.now();
  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: opts.title,
          description: opts.description,
          tags: opts.tags ?? [],
          categoryId: opts.categoryId ?? "27",
        },
        status: {
          privacyStatus: opts.privacyStatus ?? "public",
          selfDeclaredMadeForKids: opts.madeForKids ?? false,
        },
      },
      media: { body: createReadStream(opts.videoPath) },
    },
    {
      onUploadProgress: (evt) => {
        const pct = ((evt.bytesRead / fileSizeBytes) * 100).toFixed(1);
        process.stdout.write(`\r[upload] ${pct}%  (${(evt.bytesRead / 1024 / 1024).toFixed(1)}MB)`);
      },
    }
  );
  console.log();

  const videoId = res.data.id;
  if (!videoId) throw new Error(`YouTube returned no video id`);

  console.log(`[upload] ✅ done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return {
    videoId,
    url: `https://youtube.com/watch?v=${videoId}`,
    studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
  };
}
