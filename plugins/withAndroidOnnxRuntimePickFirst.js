const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withAndroidOnnxRuntimePickFirst(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes("**/libonnxruntime.so")) {
      return config;
    }

    const packagingOptions = /(packagingOptions\s*\{\s*jniLibs\s*\{)/;
    if (!packagingOptions.test(contents)) {
      throw new Error("Could not find Android jniLibs packaging options.");
    }

    config.modResults.contents = contents.replace(
      packagingOptions,
      '$1\n            pickFirsts += ["**/libonnxruntime.so"]',
    );
    return config;
  });
};
