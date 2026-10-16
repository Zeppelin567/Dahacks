// `npm run db:seed` entry point. Kept separate from seed.ts so the seed
// function can be imported by tests without side effects, and so we never
// have to compare import.meta.url against argv (which differs on Windows).
import { closeDb, dbKind } from "./index";
import { DEMO_USER, seed } from "./seed";

const result = await seed();
console.log(`seeded (${dbKind}):`, result);
console.log(`demo login: ${DEMO_USER.email} / ${DEMO_USER.password}`);
await closeDb();
