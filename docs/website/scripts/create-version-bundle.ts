#!/usr/bin/env bun
/**
 * Create a versioned documentation bundle from (latest).
 *
 * Copies the entire content/docs/(latest)/ directory to content/docs/v{version}/,
 * rewrites all internal links to include the version prefix, then refreshes
 * the versions list.
 *
 * Usage:
 *   bun run scripts/create-version-bundle.ts <version>
 *
 * Examples:
 *   bun run scripts/create-version-bundle.ts 0.8.0
 *   bun run scripts/create-version-bundle.ts 0.7.0
 */

import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";

const INTERNAL_LINK_PATTERNS = [
  /href="(\/[^"]*?)"/g,
  /\]\((\/[^)]*?)\)/g,
];

function rewriteLinks(content: string, versionPrefix: string): string {
  let result = content;
  for (const pattern of INTERNAL_LINK_PATTERNS) {
    result = result.replace(pattern, (match, linkPath: string) => {
      if (linkPath.startsWith("/#")) return match;
      if (/^\/v\d+\.\d+\.\d+\//.test(linkPath)) return match;
      return match.replace(linkPath, `${versionPrefix}${linkPath}`);
    });
  }
  return result;
}

async function rewriteLinksInDir(dir: string, versionPrefix: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      count += await rewriteLinksInDir(fullPath, versionPrefix);
      continue;
    }

    if (!entry.name.endsWith(".mdx") && !entry.name.endsWith(".md")) continue;

    const content = await fs.readFile(fullPath, "utf-8");
    const rewritten = rewriteLinks(content, versionPrefix);

    if (rewritten !== content) {
      await fs.writeFile(fullPath, rewritten, "utf-8");
      count++;
    }
  }

  return count;
}

async function createVersionBundle(version: string) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid version format: "${version}"\nExpected semver: X.Y.Z (e.g., 0.8.0)`
    );
  }

  const docsDir = path.join(process.cwd(), "content", "docs");
  const latestDir = path.join(docsDir, "(latest)");
  const targetDir = path.join(docsDir, `v${version}`);
  const versionPrefix = `/v${version}`;

  const latestExists = await fs.stat(latestDir).then(() => true).catch(() => false);
  if (!latestExists) {
    throw new Error(`(latest) directory not found at ${latestDir}`);
  }

  const targetExists = await fs.stat(targetDir).then(() => true).catch(() => false);
  if (targetExists) {
    console.log(`⚠️  v${version} already exists. Removing and recreating...`);
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  console.log(`📦 Creating version bundle v${version}...`);
  console.log(`   Source: ${latestDir}`);
  console.log(`   Target: ${targetDir}`);

  await fs.cp(latestDir, targetDir, { recursive: true });
  console.log(`✓ Copied (latest) → v${version}`);

  const rewrittenCount = await rewriteLinksInDir(targetDir, versionPrefix);
  console.log(`✓ Rewrote internal links in ${rewrittenCount} files`);

  console.log(`📋 Updating versions list...`);
  execSync(`bun run scripts/update-versions-list.ts v${version}`, {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  console.log(`✅ Version bundle v${version} created successfully`);
}

// CLI
const args = process.argv.slice(2);
const versionArg = args[0];

if (!versionArg || args.includes("--help") || args.includes("-h")) {
  console.log("Usage: bun run scripts/create-version-bundle.ts <version>");
  console.log("");
  console.log("Creates a versioned docs bundle from (latest).");
  console.log("Copies all content and rewrites internal links with the version prefix.");
  console.log("");
  console.log("Examples:");
  console.log("  bun run scripts/create-version-bundle.ts 0.8.0");
  console.log("  bun run scripts/create-version-bundle.ts 0.7.0");
  process.exit(versionArg ? 0 : 1);
}

createVersionBundle(versionArg).catch((err) => {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
