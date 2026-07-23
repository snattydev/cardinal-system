import { loadConfig } from "./config";
import { createDb } from "./db/index";
import { createServer } from "./server";

const config = loadConfig();
const db = createDb(config.dbPath);
const server = createServer(config, db);

console.log(`cardinal-system listening on :${server.port}`);
