import twilio from 'twilio';

let _client;
function getClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

/**
 * Send an SMS lead alert to the user's phone number.
 *
 * Message format:
 *   🔔 New Lead (Score: 8/10) — Millbrook Homeowners
 *   "Need someone to mow my lawn ASAP, backyard is a mess…"
 *   💬 Suggested reply: "Happy to help! I'm available this week — feel free to DM me."
 *   👉 https://facebook.com/groups/...
 *
 * @returns {{ sid: string }}
 */
export async function sendLeadAlert({ to, groupName, postText, postUrl, score, aiReply }) {
  const preview = postText.length > 120 ? `${postText.slice(0, 120)}…` : postText;
  const scoreLabel = score != null ? ` (Score: ${score}/10)` : '';
  const groupLabel = groupName ?? 'Facebook Group';
  const replyLine  = aiReply ? `\n💬 Suggested reply: "${aiReply}"` : '';
  const linkLine   = postUrl  ? `\n👉 ${postUrl}` : '';

  const body = `🔔 New Lead${scoreLabel} — ${groupLabel}\n"${preview}"${replyLine}${linkLine}`;

  const msg = await getClient().messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });

  return { sid: msg.sid };
}
