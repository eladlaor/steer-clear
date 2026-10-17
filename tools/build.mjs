#!/usr/bin/env node
/**
 * Build the store packages from src/.
 *
 * For each target (chrome, which Edge also installs, and firefox):
 *   1. copy src/ to dist/<target>/, leaving out developer notes (*.md) and
 *      .DS_Store;
 *   2. overwrite its manifest.json with the derived per-browser manifest;
 *   3. zip the directory's contents, so manifest.json sits at the zip root, to
 *      dist/steer-clear-<target>-<version>.zip;
 *   4. list the zip and fail if the manifest is not at the root or an
 *      excluded file slipped in.
 *
 * dist/<target>/ doubles as the folder to load unpacked for manual checks and
 * the folder `web-ext lint` reads.
 *
 * Usage:  node tools/build.mjs
 * Needs:  Node 20+ and the system `zip` and `unzip` commands. No npm packages.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveManifest } from './manifest_targets.mjs';
import { isPackagedPath, zipListingProblems } from './package_rules.mjs';
import {
  BuildTarget,
  DIST_DIR_NAME,
  MANIFEST_FILE_NAME,
  SRC_DIR_NAME,
  ZIP_NAME_PREFIX,
} from './tool_constants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, SRC_DIR_NAME);
const DIST_DIR = path.join(ROOT, DIST_DIR_NAME);

/**
 * Read and parse src/manifest.json.
 *
 * @returns {object}
 */
function readBaseManifest() {
  const manifestPath = path.join(SRC_DIR, MANIFEST_FILE_NAME);
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read ${path.relative(ROOT, manifestPath)}: ${error.message}`);
  }
}

/**
 * Copy src/ into a fresh target directory and write its derived manifest.
 *
 * @param {object} base The source manifest.
 * @param {string} target A BuildTarget value.
 * @returns {string} The target directory.
 */
function stageTarget(base, target) {
  const targetDir = path.join(DIST_DIR, target);
  rmSync(targetDir, { recursive: true, force: true });

  cpSync(SRC_DIR, targetDir, {
    recursive: true,
    filter: (source) => isPackagedPath(path.relative(SRC_DIR, source)),
  });

  const manifest = deriveManifest(base, target);
  writeFileSync(path.join(targetDir, MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  return targetDir;
}

/**
 * Zip a staged directory's contents and verify the result.
 *
 * @param {string} targetDir
 * @param {string} zipPath
 */
function zipTarget(targetDir, zipPath) {
  rmSync(zipPath, { force: true });
  // Run inside the directory and zip ".", so entries have no leading folder.
  // -X drops extra file attributes that differ between machines.
  execFileSync('zip', ['-qrX', zipPath, '.'], { cwd: targetDir, stdio: 'inherit' });

  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  const problems = zipListingProblems(entries);
  if (problems.length > 0) {
    throw new Error(`${path.relative(ROOT, zipPath)} is malformed:\n  ${problems.join('\n  ')}`);
  }
}

/** Build every target, printing one line per zip. */
function main() {
  const base = readBaseManifest();
  if (typeof base.version !== 'string' || base.version === '') {
    throw new Error(`${SRC_DIR_NAME}/${MANIFEST_FILE_NAME} has no version`);
  }

  mkdirSync(DIST_DIR, { recursive: true });

  for (const target of Object.values(BuildTarget)) {
    const targetDir = stageTarget(base, target);
    const zipPath = path.join(DIST_DIR, `${ZIP_NAME_PREFIX}-${target}-${base.version}.zip`);
    zipTarget(targetDir, zipPath);
    console.log(`[build] ${target}: ${path.relative(ROOT, zipPath)} (unpacked: ${path.relative(ROOT, targetDir)}/)`);
  }
}

try {
  main();
} catch (error) {
  console.error(`[build] failed: ${error.message}`);
  process.exit(1);
}
