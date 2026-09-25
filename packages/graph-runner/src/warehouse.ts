import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CarrierRun } from "./carrier.js";

const connectorDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../connectors/warehouse_x_receipt");

export type WarehouseFixture = {
  name: string;
  status: "RECEIVED" | "NOT_FOUND";
};

export function loadWarehouseFixture(name: string): WarehouseFixture {
  return JSON.parse(readFileSync(path.join(connectorDir, "fixtures", `${name}.json`), "utf8")) as WarehouseFixture;
}

export function runWarehouseFixture(fixture: WarehouseFixture): CarrierRun {
  return {
    jobStatus: "succeeded",
    outputs: { status: fixture.status },
    graphVersion: "v1.0.0-g1",
  };
}
