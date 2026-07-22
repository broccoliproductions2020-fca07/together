module.exports = function (api) {
  api.cache(true);

  return {
    // `babel-preset-expo` handles the React Compiler and the
    // react-native-worklets/reanimated plugin automatically.
    // `nativewind/babel` enables `className` on React Native components.
    // `@/*` path resolution comes from tsconfig.json (resolved by Expo's Metro).
    presets: [['babel-preset-expo'], 'nativewind/babel'],
  };
};
