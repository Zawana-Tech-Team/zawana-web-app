import { createRequire } from "node:module";
const require = createRequire(
  new URL("./tooling/gym/package.json", import.meta.url),
);
const tseslint = require("typescript-eslint");
const hooks = require("eslint-plugin-react-hooks");
export default [
  {
    files: [
      "src/pages/StaffPrivateCourses.tsx",
      "backend/src/services/privateCourseFinance.ts",
      "backend/src/routes/privateCourseFinance.ts",
      "backend/tests/private-course-finance.test.ts",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin, "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-unreachable": "error",
      "no-duplicate-case": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    files: [
      "src/App.tsx",
      "src/components/RoleLayout.tsx",
      "src/layouts/Layouts.tsx",
      "src/pages/PrivateCourseAdmin.tsx",
      "src/pages/Bookings.tsx",
      "backend/src/server.ts",
      "backend/src/routes/bookingQueries.ts",
      "backend/tests/private-course.test.ts",
      "backend/tests/private-course-browser-fixture.ts",
      "scripts/test-private-course-browser.mjs",
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: { "no-unreachable": "error", "no-duplicate-case": "error" },
  },
];
