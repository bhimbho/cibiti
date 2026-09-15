// Round-trips a small object through object storage. Usage: npm run storage:check
import { checkStorage, deleteObject, getObject, putObject } from "../src/server/storage";

async function main() {
  await checkStorage();
  const key = `healthcheck/${Date.now()}.txt`;
  const payload = `cibiti storage ok ${new Date().toISOString()}`;
  await putObject(key, new TextEncoder().encode(payload), "text/plain");
  const { body } = await getObject(key);
  const text = await new Response(body).text();
  await deleteObject(key);
  if (text !== payload) throw new Error("Storage returned different bytes than were written.");
  console.log("Storage OK:", text);
}

main().catch((error) => {
  console.error("Storage check failed:", error);
  process.exit(1);
});
