import * as fs from 'node:fs/promises';
import { updateSource } from '../desktop/update-feed.mjs';
const value = process.argv[2];
if (value === undefined) throw new Error('Usage: npm run configure:updates -- https://your-release-host/path');
const baseUrl = value ? updateSource(value).baseUrl : '';
await fs.writeFile(new URL('../desktop/release-config.json', import.meta.url), JSON.stringify({baseUrl,autoCheck:!!baseUrl}, null, 2) + '\n');
process.stdout.write(baseUrl ? 'Update address configured for the next build.\n' : 'Online updates disabled for the next build.\n');
