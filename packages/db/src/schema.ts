import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
]);

export const runModeEnum = pgEnum("run_mode", ["live", "cached"]);

export const usageKindEnum = pgEnum("usage_kind", ["cached_read", "live_run"]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("api_keys_key_hash_idx").on(t.keyHash),
    index("api_keys_tenant_id_idx").on(t.tenantId),
  ],
);

export const connectorVersions = pgTable(
  "connector_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorId: text("connector_id").notNull(),
    connectorVersion: text("connector_version").notNull(),
    graphVersion: text("graph_version").notNull(),
    manifest: jsonb("manifest").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connector_versions_unique").on(t.connectorId, t.connectorVersion),
    index("connector_versions_connector_id_idx").on(t.connectorId),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    connectorVersion: text("connector_version"),
    graphVersion: text("graph_version"),
    status: jobStatusEnum("status").notNull().default("queued"),
    runMode: runModeEnum("run_mode").notNull().default("live"),
    sessionId: text("session_id"),
    inputs: jsonb("inputs").notNull().default({}),
    outputs: jsonb("outputs"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    idempotencyKey: text("idempotency_key"),
    idempotencyExpiresAt: timestamp("idempotency_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_tenant_id_idx").on(t.tenantId),
    index("jobs_status_idx").on(t.status),
    uniqueIndex("jobs_idempotency_idx").on(t.tenantId, t.idempotencyKey),
  ],
);

export const vaultSessions = pgTable(
  "vault_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    connectorId: text("connector_id").notNull(),
    sessionId: text("session_id").notNull(),
    sessionGeneration: integer("session_generation").notNull().default(1),
    encryptedStorageState: text("encrypted_storage_state").notNull(),
    proxyStickyKey: text("proxy_sticky_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vault_sessions_unique").on(t.tenantId, t.connectorId, t.sessionId),
    index("vault_sessions_tenant_idx").on(t.tenantId),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    connectorId: text("connector_id").notNull(),
    kind: usageKindEnum("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_events_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_tenant_created_idx").on(t.tenantId, t.createdAt)],
);
