/**
 * Constants shared by the developer tools in tools/. Nothing here ships in the
 * extension; extension constants live in src/constants.js.
 */

/** Packages the build produces. Edge installs the chrome package. */
export const BuildTarget = Object.freeze({
  CHROME: 'chrome',
  FIREFOX: 'firefox',
});

/** Directory names relative to the repository root. */
export const SRC_DIR_NAME = 'src';
export const DIST_DIR_NAME = 'dist';

/** Zip names are `<prefix>-<target>-<version>.zip`. */
export const ZIP_NAME_PREFIX = 'steer-clear';

/** The file every store expects at the zip root. */
export const MANIFEST_FILE_NAME = 'manifest.json';

/** Files under src/ that are notes for developers, not part of the extension. */
export const EXCLUDED_FILE_SUFFIXES = Object.freeze(['.md']);
export const EXCLUDED_FILE_NAMES = Object.freeze(['.DS_Store']);

/** A common small-phone viewport, in CSS px. Every page must work at this size. */
export const MOBILE_VIEWPORT = Object.freeze({ width: 360, height: 740 });

/** Smallest tap target, in CSS px (WCAG 2.5.5 AAA, Apple and Android guidance). */
export const MIN_TOUCH_TARGET_PX = 44;
