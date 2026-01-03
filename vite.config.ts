import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Prevents crash when accessing process.env in browser
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Polyfill process for other potential usages (though specific key replacement is safer)
      'process.env': {} 
    },
    server: {
      port: 3000,
      open: true
    }
  };
});