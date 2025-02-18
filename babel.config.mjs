export default {
    reporters: [
      "default",
      ["jest-junit", { outputDirectory: "test-results", outputName: "jest-report.xml" }]
    ],
    collectCoverage: true,
    coverageDirectory: "coverage",
    coverageReporters: ["json", "lcov", "text", "clover"],
    presets: [
      '@babel/preset-env'
    ],
    plugins: [],
    sourceType: "module"
  };
  