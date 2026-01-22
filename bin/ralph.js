#!/usr/bin/env node
const { spawnSync } = require("child_process");
const { join } = require("path");
const result = spawnSync("bun", [join(__dirname, "..", "cli.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status);
