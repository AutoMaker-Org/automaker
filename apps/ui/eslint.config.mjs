import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const eslintConfig = defineConfig([
  js.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.cjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        // Browser/DOM APIs
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        WebSocket: 'readonly',
        XMLHttpRequest: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        Buffer: 'readonly',
        atob: 'readonly',
        crypto: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        // DOM Element Types
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLSpanElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLHeadingElement: 'readonly',
        HTMLParagraphElement: 'readonly',
        HTMLImageElement: 'readonly',
        Element: 'readonly',
        EventTarget: 'readonly',
        // Event Types
        Event: 'readonly',
        MouseEvent: 'readonly',
        KeyboardEvent: 'readonly',
        DragEvent: 'readonly',
        PointerEvent: 'readonly',
        CustomEvent: 'readonly',
        ClipboardEvent: 'readonly',
        WheelEvent: 'readonly',
        MediaQueryListEvent: 'readonly',
        ProgressEvent: 'readonly',
        DataTransfer: 'readonly',
        // Web APIs
        ResizeObserver: 'readonly',
        AbortSignal: 'readonly',
        Audio: 'readonly',
        ScrollBehavior: 'readonly',
        // Timers
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        // Node.js (for scripts and Electron)
        process: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        NodeJS: 'readonly',
        // React
        React: 'readonly',
        JSX: 'readonly',
        // Electron
        Electron: 'readonly',
        // Console
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
    },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  globalIgnores([
    'dist/**',
    'dist-electron/**',
    'node_modules/**',
    'server-bundle/**',
    'release/**',
    'src/routeTree.gen.ts',
  ]),
]);

export default eslintConfig;
