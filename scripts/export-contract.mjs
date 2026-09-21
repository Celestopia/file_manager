import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

mkdirSync("target", { recursive: true });
const result = spawnSync(
  "cargo",
  ["test", "--locked", "export_frontend_contract", "--", "--ignored"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FILE_MANAGER_CONTRACT: resolve("target/frontend-contract.json"),
    },
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
