import { loadConfig } from "@cardinal/core";
import { createDb } from "@cardinal/db";
import { createServer } from "./server";

const config = loadConfig();
const db = createDb(config.dbPath);
const server = createServer(config, db);

console.log(`cardinal-system listening on :${server.port}`);
