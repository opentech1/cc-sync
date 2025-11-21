#!/usr/bin/env bun
/**
 * Deploy script for @opentech1/cc-sync
 *
 * Usage:
 *   bun run deploy           - Bump patch version and publish
 *   bun run deploy minor     - Bump minor version and publish
 *   bun run deploy major     - Bump major version and publish
 *   bun run deploy --dry-run - Show what would happen without publishing
 */

import { $ } from "bun";
import fs from "fs";
import path from "path";

const CLI_DIR = path.resolve(import.meta.dirname, "..");
const PACKAGE_JSON = path.join(CLI_DIR, "package.json");
const INDEX_TSX = path.join(CLI_DIR, "src/index.tsx");

type BumpType = "patch" | "minor" | "major";

function parseArgs(): { bumpType: BumpType; dryRun: boolean } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  let bumpType: BumpType = "patch";
  if (args.includes("major")) bumpType = "major";
  else if (args.includes("minor")) bumpType = "minor";

  return { bumpType, dryRun };
}

function bumpVersion(version: string, type: BumpType): string {
  const [major, minor, patch] = version.split(".").map(Number);

  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
}

async function main() {
  const { bumpType, dryRun } = parseArgs();

  console.log(`\n🚀 CC-Sync Deploy Script\n`);

  // 1. Read current version
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
  const currentVersion = packageJson.version;
  const newVersion = bumpVersion(currentVersion, bumpType);

  console.log(`📦 Current version: ${currentVersion}`);
  console.log(`📦 New version:     ${newVersion} (${bumpType} bump)`);

  if (dryRun) {
    console.log(`\n⚠️  Dry run mode - no changes will be made\n`);
    return;
  }

  // 2. Update package.json
  console.log(`\n📝 Updating package.json...`);
  packageJson.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(packageJson, null, 2) + "\n");

  // 3. Update CURRENT_VERSION in index.tsx
  console.log(`📝 Updating index.tsx...`);
  let indexContent = fs.readFileSync(INDEX_TSX, "utf8");
  indexContent = indexContent.replace(
    /const CURRENT_VERSION = "[^"]+";/,
    `const CURRENT_VERSION = "${newVersion}";`
  );
  fs.writeFileSync(INDEX_TSX, indexContent);

  // 4. Build
  console.log(`\n🔨 Building...`);
  await $`cd ${CLI_DIR} && bun run build`.quiet();
  console.log(`✅ Build complete`);

  // 5. Publish to npm
  console.log(`\n📤 Publishing to npm...`);
  await $`cd ${CLI_DIR} && npm publish --access public`;

  console.log(`\n✅ Successfully published @opentech1/cc-sync@${newVersion}!\n`);

  // 6. Remind about git commit
  console.log(`📌 Don't forget to commit the version bump:`);
  console.log(`   git add apps/cli/package.json apps/cli/src/index.tsx`);
  console.log(`   git commit -m "chore: bump version to ${newVersion}"`);
  console.log(`   git push\n`);
}

main().catch((error) => {
  console.error(`\n❌ Deploy failed:`, error.message);
  process.exit(1);
});
