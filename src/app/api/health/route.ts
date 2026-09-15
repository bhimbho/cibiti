import IORedis from "ioredis";
import { prisma } from "@/lib/prisma";
import { redisConnection } from "@/server/queue";
import { checkStorage } from "@/server/storage";

async function probe(check: () => Promise<unknown>): Promise<"ok" | "down"> {
  try {
    await Promise.race([check(), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
    return "ok";
  } catch {
    return "down";
  }
}

async function pingRedis() {
  const { host, port, username, password } = redisConnection() as { host: string; port: number; username?: string; password?: string };
  const client = new IORedis({ host, port, username, password, lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 2000 });
  try {
    await client.connect();
    await client.ping();
  } finally {
    client.disconnect();
  }
}

// Used by the LAN installer, load balancers and the centre console. Reports status only.
export async function GET() {
  const [database, queue, storage] = await Promise.all([probe(() => prisma.$queryRaw`SELECT 1`), probe(pingRedis), probe(checkStorage)]);
  const healthy = database === "ok" && queue === "ok" && storage === "ok";
  return Response.json({ status: healthy ? "ok" : "degraded", database, queue, storage }, { status: healthy ? 200 : 503 });
}
