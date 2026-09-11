module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // react-native-dotenv reads .env at build time and injects env vars
      // as compile-time constants importable from '@env'.
      //
      // Why dotenv over expo-constants?
      //   - expo-constants requires listing every var in app.json under
      //     "extra", which couples secrets to the app config and needs a
      //     prebuild for each new key.
      //   - react-native-dotenv inlines values at bundle time — simpler for
      //     a small project and works identically in Expo Go + dev builds.
      //   - Downside: values are baked into the JS bundle (same as constants),
      //     so they're not "secret" — only use the anon/publishable key here,
      //     never the service_role key.
      ['module:react-native-dotenv', { moduleName: '@env', path: '.env', safe: false, allowUndefined: true }],
    ],
  };
};
