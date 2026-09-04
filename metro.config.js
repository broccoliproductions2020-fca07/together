const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Never watch Gradle build output: intermediates contain resource paths that
// crash Metro's file watcher on Windows (lstat on malformed '?' paths) — seen
// after every native rebuild.
//
// `landing/` is a separate npm project inside this repo and is blocked for the
// same class of reason: installing there deletes and recreates temp folders
// under its `node_modules`, and Metro's watcher dies on the vanished path
// ("ENOENT: watch ... .metro-XXXX"). The app bundle never imports anything
// from the landing, so nothing is lost — only the crash.
config.resolver.blockList = [
  /android[\\/](app[\\/])?build[\\/]/,
  /functions[\\/]node_modules[\\/]/,
  /landing[\\/]node_modules[\\/]/,
  /landing[\\/]\.next[\\/]/,
];

module.exports = withNativewind(config, { inlineRem: 16 });
