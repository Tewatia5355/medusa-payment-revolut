module.exports = {
  transform: { "^.+\\.[jt]s$": ["@swc/jest", { jsc: { target: "es2022" } }] },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts"],
  testMatch: ["**/__tests__/**/*.spec.ts"],
}
