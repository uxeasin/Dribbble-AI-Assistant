// Watch-mode development build for both bundles. Reload the extension from
// chrome://extensions after changes to the background or content script;
// reopening the popup is enough for popup changes.
import { rm } from 'node:fs/promises';
import { build } from 'vite';

const common = { mode: 'development', build: { watch: {} } };

await rm('dist', { recursive: true, force: true });
await build({ ...common, configFile: 'vite.config.ts' });
await build({ ...common, configFile: 'vite.content.config.ts' });
console.log('\nWatching for changes. Load ./dist as an unpacked extension.');
