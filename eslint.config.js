import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

// typescript-eslint does not support TypeScript 7 yet. Babel parses TS so lint still covers apps/ and packages/.
export default [
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.venv-camoufox/**"] },
  js.configs.recommended,
  {
    files: ["apps/**/*.ts", "packages/**/*.ts"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          presets: [["@babel/preset-typescript", { onlyRemoveTypeImports: true }]],
          plugins: ["@babel/plugin-syntax-typescript"],
        },
        sourceType: "module",
      },
      globals: globals.node,
    },
    rules: {
      // Babel's ESLint parser does not drop TypeScript types from scope. tsc covers those.
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
