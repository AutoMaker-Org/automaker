import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

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
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
        File: 'readonly',
        FileList: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        atob: 'readonly',
        crypto: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        requestIdleCallback: 'readonly',
        cancelIdleCallback: 'readonly',
        alert: 'readonly',
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
        HTMLLinkElement: 'readonly',
        HTMLScriptElement: 'readonly',
        Element: 'readonly',
        SVGElement: 'readonly',
        SVGSVGElement: 'readonly',
        // Event Types
        Event: 'readonly',
        KeyboardEvent: 'readonly',
        DragEvent: 'readonly',
        PointerEvent: 'readonly',
        CustomEvent: 'readonly',
        ClipboardEvent: 'readonly',
        WheelEvent: 'readonly',
        MouseEvent: 'readonly',
        UIEvent: 'readonly',
        MediaQueryListEvent: 'readonly',
        PageTransitionEvent: 'readonly',
        DataTransfer: 'readonly',
        // Web APIs
        ResizeObserver: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        IntersectionObserver: 'readonly',
        Audio: 'readonly',
        HTMLAudioElement: 'readonly',
        ScrollBehavior: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        XMLHttpRequest: 'readonly',
        Response: 'readonly',
        RequestInit: 'readonly',
        RequestCache: 'readonly',
        ServiceWorkerRegistration: 'readonly',
        // Timers
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
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
        // Structured clone (modern browser/Node API)
        structuredClone: 'readonly',
        // Vite defines
        __APP_VERSION__: 'readonly',
        __APP_BUILD_HASH__: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      'react-hooks': reactHooks,
    },
    rules: {
      ...ts.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-nocheck': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        // Service Worker globals
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Headers: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        console: 'readonly',
        // Built-in globals used in sw.js
        Date: 'readonly',
        Promise: 'readonly',
        Set: 'readonly',
        JSON: 'readonly',
        String: 'readonly',
        Array: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
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
