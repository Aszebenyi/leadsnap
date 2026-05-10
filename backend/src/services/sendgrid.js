// SendGrid is a Twilio product — the API key lives in your Twilio account at
// console.twilio.com → SendGrid API Keys (or sendgrid.com, same login).
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? '');

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'alerts@leadsnap.app';

/**
 * Send a lead alert email as fallback when SMS is unavailable.
 * @param {object} opts
 * @param {string} opts.to          - recipient email address
 * @param {string|null} opts.groupName
 * @param {string} opts.postText
 * @param {string|null} opts.postUrl
 * @param {number|null} opts.score
 * @param {string|null} opts.aiReply
 */
export async function sendLeadAlertEmail({ to, groupName, postText, postUrl, score, aiReply }) {
  const subject = score != null && score >= 7
    ? `⚡ New lead (${score}/10) — ${groupName ?? 'Facebook group'}`
    : `🔔 New lead — ${groupName ?? 'Facebook group'}`;

  const preview = postText.length > 300 ? `${postText.slice(0, 300)}…` : postText;

  const replySection = aiReply
    ? `<tr><td style="padding:16px 24px 0"><p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Suggested reply</p><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;font-size:14px;color:#374151;line-height:1.55">${escapeHtml(aiReply)}</div></td></tr>`
    : '';

  const viewPost = postUrl
    ? `<tr><td style="padding:16px 24px 24px"><a href="${escapeHtml(postUrl)}" style="display:inline-block;background:#f97316;color:#fff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none">View post on Facebook →</a></td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#f97316,#ea6c0b);padding:20px 24px">
        <span style="font-size:18px;font-weight:700;color:#fff">⚡ LeadSnap</span>
        ${score != null ? `<span style="float:right;background:rgba(255,255,255,.25);color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:99px">${score}/10</span>` : ''}
      </td></tr>
      <!-- Group / title -->
      <tr><td style="padding:20px 24px 0">
        <p style="margin:0;font-size:13px;color:#6b7280">${escapeHtml(groupName ?? 'Facebook group')}</p>
        <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#111827">New job — reply now</p>
      </td></tr>
      <!-- Post text -->
      <tr><td style="padding:12px 24px 0">
        <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">${escapeHtml(preview)}</p>
      </td></tr>
      ${replySection}
      ${viewPost}
    </table>
    <p style="text-align:center;font-size:11px;color:#9ca3af;margin:16px 0 0">LeadSnap · <a href="https://leadsnap.app/settings" style="color:#9ca3af">Manage alerts</a></p>
  </td></tr></table>
</body>
</html>`;

  const text = [
    `New lead from ${groupName ?? 'Facebook group'}`,
    score != null ? `Score: ${score}/10` : '',
    '',
    preview,
    aiReply ? `\nSuggested reply:\n${aiReply}` : '',
    postUrl ? `\nView post: ${postUrl}` : '',
  ].filter(Boolean).join('\n');

  await sgMail.send({ to, from: FROM_EMAIL, subject, html, text });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
