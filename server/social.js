import { Router } from 'express';
import { now } from './db/index.js';
import { HttpError, h } from './http.js';
import { requireAuth, currentUser } from './auth.js';
import { SELECT_ENTRY, hydrate } from './logs.js';

// Social features (week 12): activity feed, likes / dislikes + comments, notifications.
// Likes and comments work on a "target": target_type 'entry' (a log / review) today; 'list' is reserved for lists.

export const COMMENT_MAX = 1000;
const FEED_PAGE = 20;
const NOTIFICATION_PAGE = 50;

// ---------- notifications
/** Tell `to` that `actor` did something. Nobody gets notified about their own actions. */
export async function notify(db, { to, actor, type, targetType = null, targetId = null, commentId = null }) {
  if (to === actor) return;
  await db.run(
    `INSERT INTO notifications (user_id, actor_id, type, target_type, target_id, comment_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [to, actor, type, targetType, targetId, commentId, now()],
  );
}

/** Take a notification back (unlike, unfollow), so it doesn't linger. */
export async function unnotify(db, { to, actor, type, targetType = null, targetId = null }) {
  await db.run(
    `DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ?
       AND COALESCE(target_type, '') = COALESCE(?, '') AND COALESCE(target_id, 0) = COALESCE(?, 0)`,
    [to, actor, type, targetType, targetId],
  );
}

// ---------- helpers
const inList = (ids) => ids.map(() => '?').join(',');

/** Like / dislike / comment counts for some entries, and whether the viewer liked or disliked each one. */
async function socialFor(db, viewerId, entryIds) {
  const out = new Map(
    entryIds.map((id) => [id, { likes: 0, dislikes: 0, comments: 0, likedByMe: false, dislikedByMe: false }]),
  );
  if (!entryIds.length) return out;
  for (const [table, key] of [
    ['likes', 'likes'],
    ['dislikes', 'dislikes'],
    ['comments', 'comments'],
  ]) {
    const rows = await db.all(
      `SELECT target_id, COUNT(*) AS n FROM ${table} WHERE target_type = 'entry' AND target_id IN (${inList(entryIds)})
       GROUP BY target_id`,
      entryIds,
    );
    for (const r of rows) out.get(r.target_id)[key] = r.n;
  }
  for (const [table, key] of [
    ['likes', 'likedByMe'],
    ['dislikes', 'dislikedByMe'],
  ]) {
    const mine = await db.all(
      `SELECT target_id FROM ${table} WHERE user_id = ? AND target_type = 'entry' AND target_id IN (${inList(entryIds)})`,
      [viewerId, ...entryIds],
    );
    for (const r of mine) out.get(r.target_id)[key] = true;
  }
  return out;
}

/** Entries (any reader's) with who wrote them and their likes/comments. */
async function entriesWithSocial(db, viewerId, rows) {
  const entries = await hydrate(db, rows);
  const social = await socialFor(
    db,
    viewerId,
    entries.map((e) => e.id),
  );
  return entries.map((e, i) => ({
    ...e,
    user: { username: rows[i].username, avatarUrl: rows[i].avatar_url },
    social: social.get(e.id),
  }));
}

const SELECT_ENTRY_WITH_USER = SELECT_ENTRY.replace(
  'SELECT e.*,',
  'SELECT e.*, u.username, u.avatar_url,',
).replace('JOIN books b ON b.id = e.book_id', 'JOIN books b ON b.id = e.book_id JOIN users u ON u.id = e.user_id');

async function findEntry(db, id) {
  const row = await db.get(`${SELECT_ENTRY_WITH_USER} WHERE e.id = ?`, [Number(id)]);
  if (!row) throw new HttpError(404, 'Log entry not found.');
  return row;
}

const toComment = (c, viewerId, entryOwnerId) => ({
  id: c.id,
  body: c.body,
  createdAt: c.created_at,
  user: { username: c.username, avatarUrl: c.avatar_url },
  // you can delete your own comments, and any comment on your own review
  canDelete: c.user_id === viewerId || entryOwnerId === viewerId,
});

// ---------- routes
export function socialRouter(db) {
  const r = Router();

  // Activity feed: newest logs from readers you follow. Page with ?before=<id of the last item you have>.
  r.get(
    '/feed',
    requireAuth,
    h(async (req, res) => {
      const me = currentUser(res);
      const before = Number(req.query.before);
      const params = [me.id];
      let older = '';
      if (Number.isInteger(before) && before > 0) {
        older = 'AND e.id < ?';
        params.push(before);
      }
      const rows = await db.all(
        `${SELECT_ENTRY_WITH_USER}
         WHERE e.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) ${older}
         ORDER BY e.id DESC LIMIT ${FEED_PAGE + 1}`,
        params,
      );
      const more = rows.length > FEED_PAGE;
      const items = await entriesWithSocial(db, me.id, rows.slice(0, FEED_PAGE));
      const following = (await db.get('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?', [me.id])).n;
      res.json({ items, nextBefore: more ? items.at(-1).id : null, following });
    }),
  );

  // One log / review with its comments (the page you land on from the feed or a notification)
  r.get(
    '/entries/:id',
    requireAuth,
    h(async (req, res) => {
      const me = currentUser(res);
      const row = await findEntry(db, req.params.id);
      const [entry] = await entriesWithSocial(db, me.id, [row]);
      const comments = await db.all(
        `SELECT c.*, u.username, u.avatar_url FROM comments c JOIN users u ON u.id = c.user_id
         WHERE c.target_type = 'entry' AND c.target_id = ? ORDER BY c.id`,
        [row.id],
      );
      res.json({
        entry,
        isMine: row.user_id === me.id,
        comments: comments.map((c) => toComment(c, me.id, row.user_id)),
      });
    }),
  );

  // Like / dislike a review, or take it back. A reader can like OR dislike, not both:
  // choosing one removes the other. Doing the same thing twice changes nothing.
  // Likes notify the review's author; dislikes don't.
  for (const kind of ['like', 'dislike']) {
    const table = kind === 'like' ? 'likes' : 'dislikes';
    const opposite = kind === 'like' ? 'dislikes' : 'likes';

    r.put(
      `/entries/:id/${kind}`,
      requireAuth,
      h(async (req, res) => {
        const me = currentUser(res);
        const row = await findEntry(db, req.params.id);
        const target = { to: row.user_id, actor: me.id, targetType: 'entry', targetId: row.id };
        await db.transaction(async (tx) => {
          await tx.run(`DELETE FROM ${opposite} WHERE user_id = ? AND target_type = 'entry' AND target_id = ?`, [
            me.id,
            row.id,
          ]);
          if (kind === 'dislike') await unnotify(tx, { ...target, type: 'like' });
          const { changes } = await tx.run(
            `INSERT INTO ${table} (user_id, target_type, target_id, created_at) VALUES (?, 'entry', ?, ?)
             ON CONFLICT DO NOTHING`,
            [me.id, row.id, now()],
          );
          if (changes && kind === 'like') await notify(tx, { ...target, type: 'like' });
        });
        res.json((await socialFor(db, me.id, [row.id])).get(row.id));
      }),
    );

    r.delete(
      `/entries/:id/${kind}`,
      requireAuth,
      h(async (req, res) => {
        const me = currentUser(res);
        const row = await findEntry(db, req.params.id);
        await db.run(`DELETE FROM ${table} WHERE user_id = ? AND target_type = 'entry' AND target_id = ?`, [
          me.id,
          row.id,
        ]);
        if (kind === 'like')
          await unnotify(db, { to: row.user_id, actor: me.id, type: 'like', targetType: 'entry', targetId: row.id });
        res.json((await socialFor(db, me.id, [row.id])).get(row.id));
      }),
    );
  }

  // Comment on a review
  r.post(
    '/entries/:id/comments',
    requireAuth,
    h(async (req, res) => {
      const me = currentUser(res);
      const row = await findEntry(db, req.params.id);
      const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      if (!body) throw new HttpError(400, 'Write something first.', { body: 'Write something first.' });
      if (body.length > COMMENT_MAX)
        throw new HttpError(400, 'Please fix the highlighted fields.', {
          body: `Comments can be up to ${COMMENT_MAX} characters.`,
        });
      const c = await db.get(
        `INSERT INTO comments (user_id, target_type, target_id, body, created_at) VALUES (?, 'entry', ?, ?, ?)
         RETURNING *`,
        [me.id, row.id, body, now()],
      );
      await notify(db, {
        to: row.user_id,
        actor: me.id,
        type: 'comment',
        targetType: 'entry',
        targetId: row.id,
        commentId: c.id,
      });
      res.status(201).json({
        comment: toComment({ ...c, username: me.username, avatar_url: me.avatarUrl }, me.id, row.user_id),
      });
    }),
  );

  // Delete a comment: its author, or the owner of the review it's on
  r.delete(
    '/comments/:id',
    requireAuth,
    h(async (req, res) => {
      const me = currentUser(res);
      const c = await db.get(
        `SELECT c.id, c.user_id, e.user_id AS owner_id FROM comments c
         JOIN log_entries e ON c.target_type = 'entry' AND e.id = c.target_id
         WHERE c.id = ?`,
        [Number(req.params.id)],
      );
      if (!c) throw new HttpError(404, 'Comment not found.');
      if (c.user_id !== me.id && c.owner_id !== me.id) throw new HttpError(403, "You can't delete this comment.");
      await db.transaction(async (tx) => {
        await tx.run('DELETE FROM notifications WHERE comment_id = ?', [c.id]);
        await tx.run('DELETE FROM comments WHERE id = ?', [c.id]);
      });
      res.json({ ok: true });
    }),
  );

  // Your notifications, newest first
  r.get(
    '/notifications',
    requireAuth,
    h(async (_req, res) => {
      const me = currentUser(res);
      const rows = await db.all(
        `SELECT n.id, n.type, n.target_type, n.target_id, n.read_at, n.created_at,
           a.username AS actor_username, a.avatar_url AS actor_avatar,
           b.title AS book_title, c.body AS comment_body
         FROM notifications n
         JOIN users a ON a.id = n.actor_id
         LEFT JOIN log_entries e ON n.target_type = 'entry' AND e.id = n.target_id
         LEFT JOIN books b ON b.id = e.book_id
         LEFT JOIN comments c ON c.id = n.comment_id
         WHERE n.user_id = ? ORDER BY n.id DESC LIMIT ${NOTIFICATION_PAGE}`,
        [me.id],
      );
      res.json({
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          actor: { username: n.actor_username, avatarUrl: n.actor_avatar },
          entry: n.target_type === 'entry' ? { id: n.target_id, bookTitle: n.book_title } : null,
          comment: n.comment_body ?? null,
          read: Boolean(n.read_at),
          createdAt: n.created_at,
        })),
        unread: await unreadCount(db, me.id),
      });
    }),
  );

  // For the bell in the nav bar
  r.get(
    '/notifications/unread-count',
    requireAuth,
    h(async (_req, res) => {
      res.json({ unread: await unreadCount(db, currentUser(res).id) });
    }),
  );

  r.post(
    '/notifications/read',
    requireAuth,
    h(async (_req, res) => {
      await db.run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', [
        now(),
        currentUser(res).id,
      ]);
      res.json({ unread: 0 });
    }),
  );

  return r;
}

async function unreadCount(db, userId) {
  return (await db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId])).n;
}
