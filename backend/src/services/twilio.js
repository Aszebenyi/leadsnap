import twilio from 'twilio';

// TODO (WhatsApp setup): Before using sendLeadAlertWhatsApp() in production you need one of:
//   1. Twilio WhatsApp Sandbox — go to Twilio Console → Messaging → Try it out → WhatsApp.
//      Set TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886 and have each user send the sandbox
//      join code from their WhatsApp number before alerts will deliver.
//   2. WhatsApp Business API approval — submit your number for WhatsApp Business approval in
//      Twilio Console → Messaging → Senders → WhatsApp Senders. Once approved, set
//      TWILIO_WHATSAPP_NUMBER=whatsapp:+<your_approved_number>.

let _client;
function getClient() {
  if (!_client) _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

/**
 * Build the alert message body shared by both SMS and WhatsApp.
 */
function buildAlertBody({ groupName, postText, postUrl, score, aiReply }) {
  const preview    = postText.length > 120 ? `${postText.slice(0, 120)}…` : postText;
  const scoreLabel = score != null ? ` (Score: ${score}/10)` : '';
  const groupLabel = groupName ?? 'Facebook Group';
  const replyLine  = aiReply ? `\n💬 Suggested reply: "${aiReply}"` : '';
  const linkLine   = postUrl  ? `\n👉 ${postUrl}` : '';
  return `🔔 New Lead${scoreLabel} — ${groupLabel}\n"${preview}"${replyLine}${linkLine}`;
}

/**
 * Send an SMS lead alert.
 * @returns {{ sid: string }}
 */
export async function sendLeadAlert({ to, groupName, postText, postUrl, score, aiReply }) {
  const msg = await getClient().messages.create({
    body: buildAlertBody({ groupName, postText, postUrl, score, aiReply }),
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
  return { sid: msg.sid };
}

/**
 * Send a WhatsApp lead alert via Twilio's WhatsApp API.
 * The `to` number is normalised to whatsapp:+E.164 format automatically.
 * @returns {{ sid: string }}
 */
export async function sendLeadAlertWhatsApp({ to, groupName, postText, postUrl, score, aiReply }) {
  // Normalise to whatsapp:+E.164 — strip any existing prefix first
  const digits = to.replace(/^whatsapp:/, '');
  const toFormatted = `whatsapp:${digits.startsWith('+') ? digits : `+${digits}`}`;

  const msg = await getClient().messages.create({
    body: buildAlertBody({ groupName, postText, postUrl, score, aiReply }),
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to:   toFormatted,
  });
  return { sid: msg.sid };
}
