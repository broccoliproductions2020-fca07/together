const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Never watch Gradle build output: intermediates contain resource paths that
// crash Metro's file watcher on Windows (lstat on malformed '?' paths) — seen
// after every native rebuild.
config.resolver.blockList = [/android[\\/](app[\\/])?build[\\/]/, /functions[\\/]node_modules[\\/]/];

module.exports = withNativewind(config, { inlineRem: 16 });
