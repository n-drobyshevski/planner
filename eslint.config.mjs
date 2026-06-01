import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // `react-hooks/set-state-in-effect` (eslint-plugin-react-hooks v6, bundled
      // with Next 16) is error-level by default and flags several legitimate,
      // pre-existing patterns in this codebase: "after-mount" gates
      // (`setMounted(true)`), media-query subscriptions (use-mobile, now-line,
      // theme-toggle), and "reset form state when a dialog (re)opens"
      // (event/task/schedule dialogs). Keep it visible as a warning instead of
      // failing `next build`, pending an incremental migration to render-phase
      // or keyed resets.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
