import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Project rule: no `any` unless justified with an eslint-disable comment.
      "@typescript-eslint/no-explicit-any": "error",
      // Security: never inject HTML or evaluate strings.
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
          message:
            "Do not assign innerHTML/outerHTML. Render text with React instead.",
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message:
            "Do not use insertAdjacentHTML. Render text with React instead.",
        },
      ],
    },
  },
  // Turns off stylistic rules that conflict with Prettier. Keep last.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    ".data/**",
    "public/vendor/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
