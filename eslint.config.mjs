import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";

/** Los configs de plugins declaran severidades "warn"; la política del repo es
 *  cero warnings (--max-warnings=0), así que los normalizamos a "error" para
 *  que el reporte refleje la política real. */
const errorsOnly = (config) => ({
  ...config,
  rules: Object.fromEntries(
    Object.entries(config.rules).map(([rule, severity]) => [
      rule,
      severity === "warn" ? "error" : severity,
    ]),
  ),
});

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.pnpm-store/**",
      "**/.worktrees/**",
      "**/.pytest_cache/**",
      "**/.claude/**",
      "**/.superpowers/**",
      "docs/**",
      "agents/**",
      "packages/shared/**",
      "**/*.js",
      "**/*.mjs",
      "**/*.cjs",
      "**/*.sql",
    ],
  },
  // Base para todo el TS del repo (incluye tests).
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Type-aware SOLO para código fuente que vive en un tsconfig.
  // Tests quedan fuera: en e2e, res.json() -> any y el type-aware solo castiga
  // estilo (2.200 falsos positivos), no caza bugs.
  {
    files: ["apps/api/**/*.{ts,tsx}", "apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/api/test/**", "apps/web/tests/**", "**/*.test.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Reglas de Next.js + React 19 para el front.
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    ignores: ["apps/web/tests/**", "**/*.test.ts"],
    extends: [
      errorsOnly(nextPlugin.configs["core-web-vitals"]),
      errorsOnly(reactHooks.configs.flat["recommended-latest"]),
    ],
    rules: {
      // No aplica en App Router; sin pages/ solo imprime ruido en stderr.
      "@next/next/no-html-link-for-pages": "off",
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["apps/api/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  // Tests e2e: any de res.json() es aceptable por diseño (decisión del dueño).
  {
    files: ["apps/api/test/**/*.ts", "apps/web/tests/**/*.ts", "**/*.test.ts"],
    rules: {
      // no-explicit-any off: res.json() en e2e es any por diseño; tipar respuestas de test no protege producción
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
