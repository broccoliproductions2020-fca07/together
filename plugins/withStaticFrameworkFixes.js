const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const SETTING = 'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES';
const IMPORT_LINE = /^\s*#(import|include)\b/;
const REACT_IMPORT = /^\s*#import <React\//;

/**
 * `useFrameworks: 'static'` (required by react-native-firebase) turns every pod
 * into a framework module. React-Core's headers are not modular, so a pod
 * header that uses an RCT type without importing its own React header can leak
 * that declaration into its own module. Clang then rejects the next file that
 * uses the type:
 *
 *   "include of non-modular header inside framework module 'RNFBApp...'"
 *
 * The fix is mechanical:
 * every source file that USES an RCT type must import that type's React header
 * itself, and those imports must come FIRST (before <Firebase/Firebase.h> and
 * friends, which otherwise resolve the module ahead of React).
 *
 * Only surfaces in Release builds of some pods, which is why a Debug
 * development build can succeed while staging fails. node_modules is
 * disposable and reinstalled per EAS build, so this re-applies during prebuild.
 * Idempotent.
 * Upstream: invertase/react-native-firebase#8988, expo/expo#39607.
 */
const TYPE_HEADERS = {
  RCTBridgeModule: 'React/RCTBridgeModule.h',
  RCTPromiseRejectBlock: 'React/RCTBridgeModule.h',
  RCTResponseSenderBlock: 'React/RCTBridgeModule.h',
  RCTPromiseResolveBlock: 'React/RCTBridgeModule.h',
  RCTViewManager: 'React/RCTViewManager.h',
  RCTConvert: 'React/RCTConvert.h',
  RCTComponent: 'React/RCTComponent.h',
  RCTEventEmitter: 'React/RCTEventEmitter.h',
};

/** Packages whose iOS sources need the treatment. */
const PACKAGES = ['@react-native-firebase'];

function patchPodfile(platformProjectRoot) {
  const podfile = path.join(platformProjectRoot, 'Podfile');
  if (!fs.existsSync(podfile)) return;
  let contents = fs.readFileSync(podfile, 'utf8');
  if (contents.includes(SETTING)) return;
  contents = contents.replace(
    /post_install do \|installer\|/,
    [
      'post_install do |installer|',
      '    installer.pods_project.targets.each do |target|',
      '      target.build_configurations.each do |config|',
      `        config.build_settings['${SETTING}'] = 'YES'`,
      '      end',
      '    end',
    ].join('\n'),
  );
  fs.writeFileSync(podfile, contents);
}

function collectSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSources(full, out);
    else if (/\.(h|m|mm)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Ensures every RCT type the file uses has its React header imported, and that
 * all React imports lead the file's import block.
 */
function fixReactImports(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');

  const needed = new Set();
  for (const [type, header] of Object.entries(TYPE_HEADERS)) {
    // Word-boundary match so RCTConvert doesn't also match RCTConvertFoo.
    if (new RegExp(`\\b${type}\\b`).test(contents)) needed.add(header);
  }
  if (needed.size === 0) return false;

  const lines = contents.split('\n');
  const firstImport = lines.findIndex((line) => IMPORT_LINE.test(line));
  if (firstImport === -1) return false;

  const existing = lines.filter((line) => REACT_IMPORT.test(line)).map((line) => line.trim());
  for (const header of existing) needed.add(header.replace(/^#import <|>$/g, ''));

  const wanted = [...needed].sort().map((header) => `#import <${header}>`);
  const alreadyCorrect =
    existing.length === wanted.length &&
    wanted.every((line, index) => lines[firstImport + index]?.trim() === line);
  if (alreadyCorrect) return false;

  const withoutReact = lines.filter((line) => !REACT_IMPORT.test(line));
  const insertAt = withoutReact.findIndex((line) => IMPORT_LINE.test(line));
  withoutReact.splice(insertAt === -1 ? 0 : insertAt, 0, ...wanted);
  fs.writeFileSync(filePath, withoutReact.join('\n'));
  return true;
}

function patchPackages(projectRoot) {
  let patched = 0;
  for (const packageName of PACKAGES) {
    const root = path.join(projectRoot, 'node_modules', packageName);
    if (!fs.existsSync(root)) continue;
    // @react-native-firebase is a scope containing many packages.
    const roots = packageName.startsWith('@')
      ? fs.readdirSync(root).map((child) => path.join(root, child))
      : [root];
    for (const packageRoot of roots) {
      const iosDir = path.join(packageRoot, 'ios');
      if (!fs.existsSync(iosDir)) continue;
      for (const file of collectSources(iosDir)) {
        if (fixReactImports(file)) patched += 1;
      }
    }
  }
  return patched;
}

module.exports = function withStaticFrameworkFixes(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      patchPodfile(modConfig.modRequest.platformProjectRoot);
      const patched = patchPackages(modConfig.modRequest.projectRoot);
      console.log(`[withStaticFrameworkFixes] React imports normalized in ${patched} file(s).`);
      return modConfig;
    },
  ]);
};

module.exports.patchPackages = patchPackages;
module.exports.patchPodfile = patchPodfile;
