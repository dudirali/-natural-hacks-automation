import "dotenv/config";
import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

const PORT = 3030;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
// youtube.upload + youtube.readonly so we can both upload + verify channel
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const ENV_PATH = join(process.cwd(), ".env");

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("❌ YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET missing.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent select_account", // forces account/channel picker
});

console.log("\n=== YouTube OAuth Setup (Natural Hacks channel) ===\n");
console.log(`Opening browser. IMPORTANT:`);
console.log(`  1. Choose your Google account.`);
console.log(`  2. When YouTube prompts to choose a CHANNEL, pick "@naturalhacks_official".`);
console.log(`  3. Click Allow.\n`);

try {
  execSync(`open '${authUrl}'`);
} catch {
  console.log(`(Couldn't auto-open. Open this URL manually:)\n${authUrl}\n`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(`<h1>OAuth error</h1><pre>${error}</pre>`);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(400).end("missing code");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      throw new Error(
        "No refresh_token returned. Revoke at https://myaccount.google.com/permissions and retry."
      );
    }

    // Confirm which channel we got
    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    const channels = await youtube.channels.list({
      part: ["snippet"],
      mine: true,
    });
    const ch = channels.data.items?.[0];
    const channelTitle = ch?.snippet?.title ?? "(unknown)";
    const channelHandle = ch?.snippet?.customUrl ?? "(no handle)";

    let envContent = "";
    try {
      await access(ENV_PATH);
      envContent = await readFile(ENV_PATH, "utf8");
    } catch {}
    const tokenLine = `YOUTUBE_REFRESH_TOKEN=${refreshToken}`;
    if (envContent.match(/^YOUTUBE_REFRESH_TOKEN=.*$/m)) {
      envContent = envContent.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, tokenLine);
    } else {
      envContent = envContent.replace(/\n*$/, "\n") + tokenLine + "\n";
    }
    await writeFile(ENV_PATH, envContent);

    const expectedHandle = "naturalhacks_official";
    const match = channelHandle.toLowerCase().includes(expectedHandle.toLowerCase());

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html><body style="font-family:system-ui;padding:40px;max-width:640px;">
        <h1>${match ? "✅" : "⚠️"} OAuth complete</h1>
        <p><b>Channel:</b> ${channelTitle}</p>
        <p><b>Handle:</b> ${channelHandle}</p>
        ${
          match
            ? "<p>Looks like the right channel. Refresh token saved to .env. You can close this tab.</p>"
            : "<p style='color:#c00;'>This does <b>NOT</b> appear to be @naturalhacks_official. You may have authenticated with a different channel. Re-run <code>npm run yt:oauth</code> and pick the correct channel in the Google account picker.</p>"
        }
      </body></html>
    `);

    console.log(`\nChannel: ${channelTitle}  ${channelHandle}`);
    console.log(match ? `✅ refresh_token saved to .env` : `⚠️  Channel mismatch — re-run if needed`);
    server.close();
    process.exit(0);
  } catch (e: unknown) {
    console.error("❌", (e as Error).message);
    res.writeHead(500).end((e as Error).message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for Google redirect at ${REDIRECT_URI}...`);
});
