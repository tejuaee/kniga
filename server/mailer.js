/**
 * Development mailer: prints the message to the server console and keeps it in memory
 * (tests read `outbox`). Swap `send` for a real provider (Resend, SES, SMTP) in production.
 */
export const outbox = [];

export function send(mail) {
  outbox.push(mail);
  if (process.env.NODE_ENV === 'test') return;
  console.log(`\n✉️  Email to ${mail.to}\n   Subject: ${mail.subject}\n   ${mail.text.replace(/\n/g, '\n   ')}\n`);
}

export function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:5173';
}
