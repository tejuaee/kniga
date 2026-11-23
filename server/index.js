import { openDb } from './db/index.js';
import { createApp } from './app.js';

// `npm start` passes --production (works on Windows too, unlike NODE_ENV=production in the script).
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

const port = Number(process.env.PORT ?? 3001);
const db = await openDb();

createApp(db).listen(port, () => {
  console.log(`Kniga API listening on http://localhost:${port} (database: ${db.client})`);
  if (!process.env.NODE_ENV) console.log('Open the web app at the "Local:" address Vite prints (not this port).');
});
