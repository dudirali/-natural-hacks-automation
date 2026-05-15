import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface Topic {
  id: string;
  title: string;
  premise: string;
  category: string;
  audience: string;
  visual_tone: string;
}

export interface UsedEntry {
  id: string;
  videoId?: string;
  publishedAt?: string;
  url?: string;
  note?: string;
}

const ROOT = process.cwd();
const TOPIC_BANK_PATH = join(ROOT, "config", "topic-bank.json");
const STATE_DIR = process.env.STATE_DIR ?? join(ROOT, "state");
const USED_PATH = join(STATE_DIR, "used-topics.json");

export async function loadTopics(): Promise<Topic[]> {
  return JSON.parse(await readFile(TOPIC_BANK_PATH, "utf8"));
}

export async function loadUsed(): Promise<{ used: UsedEntry[] }> {
  try {
    return JSON.parse(await readFile(USED_PATH, "utf8"));
  } catch {
    try {
      return JSON.parse(await readFile(join(ROOT, "state", "used-topics.json"), "utf8"));
    } catch {
      return { used: [] };
    }
  }
}

export async function pickNextTopic(): Promise<Topic> {
  const topics = await loadTopics();
  const { used } = await loadUsed();
  const usedIds = new Set(used.map((u) => u.id));
  const next = topics.find((t) => !usedIds.has(t.id));
  if (!next) {
    throw new Error(`No unused topics in topic-bank.json! Add more or reset state.`);
  }
  return next;
}

export async function markTopicUsed(entry: UsedEntry): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true });
  const current = await loadUsed();
  current.used = current.used.filter((u) => u.id !== entry.id);
  current.used.push(entry);
  await writeFile(USED_PATH, JSON.stringify(current, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  pickNextTopic()
    .then((t) => console.log(JSON.stringify(t, null, 2)))
    .catch((e) => {
      console.error("❌", e.message);
      process.exit(1);
    });
}
