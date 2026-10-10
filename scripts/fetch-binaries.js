#!/usr/bin/env node
/**
 * fetch-binaries.js — stage the third-party binaries SmartDex bundles.
 *
 * Zero dependencies. Runs on the CI runner and on Ashar's machine (Node 20+).
 * Extraction uses PowerShell's Expand-Archive on Windows, `unzip` elsewhere.
 *
 * Staged layout (must match what windows-app/src/main expects):
 *   windows-app/resources/bin/scrcpy/scrcpy.exe
 *   windows-app/resources/bin/adb/adb.exe
 *   (resources/apk/smartdex-helper.apk is delivered by the Android agent)
 *
 * Idempotent: skips anything already staged. Pass --force to re-download.
 */
"use strict";

const { createHash } = require("node:crypto");
const { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const { execFileSync, get } = require("node:child_process");
const https = require("node:https");
const http = require("node:http");

const REPO_ROOT = join(__dirname, "..");
const RESOURCES = join(REPO_ROOT, "windows-app", "resources");

const BINARIES = [
  {
    name: "scrcpy v5.0.1 (Windows 64-bit)",
    url: "https://github.com/Genymobile/scrcpy/releases/download/v5.0.1/scrcpy-win64-v5.0.1.zip",
    // Pinned by the packaging task; verified 2026-10-10 by downloading and hashing.
    algo: "sha256",
    hash: "b12a2c4ee8be317422451fc7dcf8ee20a71b5ea7ef9ad73ddd825a25316227a5",
    destDir: join(RESOURCES, "bin", "scrcpy"),
    sentinel: "scrcpy.exe",
  },
  {
    name: "Android platform-tools r37.0.1 (Windows)",
    url: "https://dl.google.com/android/repository/platform-tools_r37.0.1-win.zip",
    // Google only publishes a SHA-1 in repository2-3.xml (verified 2026-10-10).
    algo: "sha1",
    hash: "e03e78b1d80b396f1c3358e31251cb31740e1110",
    destDir: join(RESOURCES, "bin", "adb"),
    sentinel: "adb.exe",
  },
];

const FORCE = process.argv.includes("--force");

function log(msg) {
  console.log(`[fetch-binaries] ${msg}`);
}

function fail(msg) {
  console.error(`[fetch-binaries] FATAL: ${msg}`);
  process.exit(1);
}

function download(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    client
      .get(url, { headers: { "User-Agent": "smartdex-fetch-binaries" } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
          res.resume();
          return resolve(download(res.headers.location, destPath, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const out = createWriteStream(destPath);
        res.pipe(out);
        out.on("finish", () => out.close(resolve));
        out.on("error", reject);
      })
      .on("error", reject);
  });
}

function hashFile(path, algo) {
  return new Promise((resolve, reject) => {
    const h = createHash(algo);
    const stream = createReadStream(path);
    stream.on("data", (d) => h.update(d));
    stream.on("end", () => resolve(h.digest("hex")));
    stream.on("error", reject);
  });
}

function copyDir(src, dst) {
  // renameSync fails across filesystems (EXDEV); copy recursively instead.
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}
function extractZip(zipPath, destDir) {
  rmSync(destDir, { recursive: true, force: true });
  const stageDir = join(tmpdir(), `smartdex-extract-${Date.now()}`);
  mkdirSync(stageDir, { recursive: true });
  try {
    if (process.platform === "win32") {
      // Expand-Archive flattens nothing; we copy the single inner folder below.
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${stageDir.replace(/'/g, "''")}' -Force`,
        ],
        { stdio: "inherit" }
      );
    } else {
      execFileSync("unzip", ["-q", zipPath, "-d", stageDir], { stdio: "inherit" });
    }
    const entries = readdirSync(stageDir);
    // Both zips wrap their contents in one top-level folder
    // (scrcpy-win64-v5.0.1/, platform-tools/). Unwrap it.
    const inner = entries.length === 1 ? join(stageDir, entries[0]) : stageDir;
    copyDir(inner, destDir);
  } finally {
    rmSync(stageDir, { recursive: true, force: true });
  }
}

async function fetchOne(spec) {
  const sentinelPath = join(spec.destDir, spec.sentinel);
  if (!FORCE && existsSync(sentinelPath)) {
    log(`SKIP  ${spec.name} (already staged at ${spec.destDir})`);
    return;
  }
  log(`GET   ${spec.name}`);
  log(`      ${spec.url}`);
  const zipPath = join(tmpdir(), `smartdex-${Date.now()}.zip`);
  try {
    await download(spec.url, zipPath);
    const actual = await hashFile(zipPath, spec.algo);
    if (actual.toLowerCase() !== spec.hash.toLowerCase()) {
      rmSync(zipPath, { force: true });
      fail(
        `CHECKSUM MISMATCH for ${spec.name}\n` +
          `  expected ${spec.algo}: ${spec.hash}\n` +
          `  actual   ${spec.algo}: ${actual}\n` +
          `The download may be corrupted or the upstream file may have changed. Aborting.`
      );
    }
    log(`OK    checksum verified (${spec.algo})`);
    extractZip(zipPath, spec.destDir);
    log(`OK    staged -> ${spec.destDir}`);
  } finally {
    rmSync(zipPath, { force: true });
  }
}

async function main() {
  log(`repo root: ${REPO_ROOT}`);
  mkdirSync(RESOURCES, { recursive: true });
  for (const spec of BINARIES) {
    await fetchOne(spec);
  }
  log("done. Staged:");
  log(`  bin/scrcpy/${BINARIES[0].sentinel}`);
  log(`  bin/adb/${BINARIES[1].sentinel}`);
}

main().catch((err) => fail(err.message || String(err)));
