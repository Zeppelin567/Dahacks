import { dbKind } from "./db";
import { runMigrations } from "./db/migrate";
import { env } from "./env";
import { startServer } from "./server";

await runMigrations();
const { port } = await startServer(env.PORT);

console.log(`api  http://localhost:${port}  (${env.NODE_ENV}, db: ${dbKind})`);
console.log(`docs http://localhost:${port}/docs`);
console.log(`ws   ws://localhost:${port}/api/ws`);
