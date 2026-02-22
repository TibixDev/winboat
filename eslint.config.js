import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import vueParser from 'vue-eslint-parser'
import prettier from '@vue/eslint-config-prettier'

export default [
  {
    ignores: [
      'src/renderer/public/**',
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**'
    ]
  },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    // Main process - Node.js environment
    files: ['src/main/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './src/main/tsconfig.json'
      },
      globals: {
        process: 'readonly',
        global: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description' }
      ]
    }
  },
  {
    // Root types.ts
    files: ['src/types.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      ...ts.configs.recommended.rules
    }
  },
  {
    // Renderer - Browser + Vue environment
    files: ['src/renderer/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        console: 'readonly',
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        CustomEvent: 'readonly',
        // Node.js globals used by renderer lib files
        require: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        NodeJS: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      'vue/multi-word-component-names': 'warn'
    }
  },
  {
    // Renderer TypeScript files
    files: ['src/renderer/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './src/renderer/tsconfig.json'
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        console: 'readonly',
        // Node.js globals used by renderer lib files
        require: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        NodeJS: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': ts
    },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  prettier
]
