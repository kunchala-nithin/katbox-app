module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      'babel-preset-expo',
      'nativewind/babel', // ✅ MUST be a preset
    ],
    plugins: [
      'react-native-reanimated/plugin', // ✅ must be last
    ],
  }
}
