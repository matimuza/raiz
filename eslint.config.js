// Lint mínimo para app.js — pensado para atrapar la clase de bugs que ya
// encontramos a mano (función redeclarada, variable sin usar, referencia a
// un global que no existe), no para imponer estilo.
export default [
  {
    files: ['app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        caches: 'readonly',
        self: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        FormData: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        Image: 'readonly',
        FileReader: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        PasswordCredential: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
      },
    },
    rules: {
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-undef': 'error',
      // "vars: local" ignora top-level (funciones/consts invocadas desde
      // onclick="..." en el HTML generado, invisibles para ESLint en un
      // solo archivo); sigue marcando variables locales sin usar dentro
      // de funciones, que si son limpieza real.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', vars: 'local', varsIgnorePattern: '^_' }],
      'no-fallthrough': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-dupe-class-members': 'error',
    },
  },
];
