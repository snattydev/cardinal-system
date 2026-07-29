import { json } from "@cardinal/core";
import rootPkg from "../../../package.json";

export function handleHealth(): Response {
  return json({ status: "ok", version: rootPkg.version });
}
