import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://shadowapi:shadowapi@localhost:5432/shadowapi";
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

const migrationClient = postgres(url, { max: 1 });
const db = drizzle(migrationClient);

await migrate(db, { migrationsFolder });
await migrationClient.end();

console.log("Migrations applied.");
