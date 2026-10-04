/** Unit tests for pure TS logic (schema conversion etc.). Only *.spec.ts is picked up; legacy *.test.ts files are standalone tsx scripts. */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: { module: "commonjs", moduleResolution: "node", target: "es2020", esModuleInterop: true, isolatedModules: true, strict: false } },
    ],
  },
};
