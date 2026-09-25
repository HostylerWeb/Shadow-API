import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export type DbHandle = {
  db: Db;
  close: () => Promise<void>;
};

export function createDb(databaseUrl: string): DbHandle {
  const client = postgres(databaseUrl, { max: 10 });
  const db = drizzle(client, { schema });
  return {
    db,
    close: async () => {
      await client.end();
    },
  };
}
