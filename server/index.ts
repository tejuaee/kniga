import { openDb } from './db.ts';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3001);
const db = openDb(process.env.DATABASE_PATH ?? 'data/kniga.db');

createApp(db).listen(port, () => {
  console.log(`Kniga API listening on http://localhost:${port}`);
});
