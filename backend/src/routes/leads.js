import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import supabase from '../lib/supabase.js';
import { scoreLead, generateReply } from '../services/claude.js';
import { sendLeadAlert } from '../services/twilio.js';
import { sendLeadAlertEmail } from '../services/sendgrid.js';

const router = Router();

const DAILY_SMS_CAP = 50;

const VALID_STATUSES = ['new', 'seen', 'replied', 'won', 'lost'];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check whether the user has exceeded their daily SMS alert cap.
 * Counts alerts sent since midnight UTC today.
 * Returns true if the cap has been reached (SMS should NOT be sent).
 */
async function isDailySmsCapped(userId) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('channel', 'sms')
    .gte('sent_at', startOfDay.toISOString());

  if (error) {
    console.error('SMS cap check failed:', error);
    // Fail open — don't block the lead if the cap check errors
    return false;
  }

  return count >= DAILY_SMS_CAP;
}

// ── POST /api/leads/ingest ────────────────────────────────────────────────────

router.post('/ingest', requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { post_text, post_url, author_name, group_name, group_url, matched_keywords, ai_description, skip_sms, website_url } = req.body;

    if (!post_text) {
      return res.status(400).json({ error: 'post_text is required' });
    }

    // ── Fetch user profile for AI context and SMS destination ────────────────
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('service_description, phone_number')
      .eq('id', req.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const serviceDescription = profile?.service_description ?? 'local service business';

    // ── Score and generate reply in parallel ─────────────────────────────────
    const [scoring, aiReply] = await Promise.allSettled([
      scoreLead(post_text, serviceDescription, ai_description || ''),
      generateReply(post_text, serviceDescription, website_url || null),
    ]);

    const scoreResult = scoring.status === 'fulfilled' ? scoring.value : null;
    const replyText   = aiReply.status  === 'fulfilled' ? aiReply.value  : null;

    if (scoring.status === 'rejected') {
      console.error('[LeadSnap] Claude scoring failed:', scoring.reason);
    }
    if (aiReply.status === 'rejected') {
      console.error('[LeadSnap] Claude reply failed:', aiReply.reason);
    }

    // ── Save lead to database ────────────────────────────────────────────────
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        user_id:          req.user.id,
        post_text,
        post_url:         post_url         ?? null,
        author_name:      author_name      ?? null,
        group_name:       group_name       ?? null,
        group_url:        group_url        ?? null,
        matched_keywords: matched_keywords ?? [],
        score:            scoreResult?.score   ?? null,
        urgent:           scoreResult?.urgent  ?? false,
        ai_reply:         replyText             ?? null,
        status:           'new',
        notified_at:      null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // ── Send alert (SMS primary, email fallback) ─────────────────────────────
    const phoneNumber = profile?.phone_number;
    const alertPayload = {
      groupName: group_name,
      postText:  post_text,
      postUrl:   post_url,
      score:     scoreResult?.score ?? null,
      aiReply:   replyText,
    };

    if (!skip_sms) {
      let smsSent = false;

      if (phoneNumber) {
        const capped = await isDailySmsCapped(req.user.id);
        if (capped) {
          console.log(`[LeadSnap] Daily SMS cap reached for user ${req.user.id} — skipping SMS`);
        } else {
          try {
            const { sid } = await sendLeadAlert({ to: phoneNumber, ...alertPayload });
            smsSent = true;
            await Promise.all([
              supabase.from('alerts').insert({
                user_id:    req.user.id,
                lead_id:    lead.id,
                channel:    'sms',
                delivered:  false,
                twilio_sid: sid,
              }),
              supabase.from('leads').update({ notified_at: new Date().toISOString() }).eq('id', lead.id),
            ]);
          } catch (smsErr) {
            console.error('[LeadSnap] SMS send failed — trying email fallback:', smsErr.message);
          }
        }
      }

      // Email fallback: no phone set, SMS failed, or daily cap reached
      if (!smsSent && req.user.email && process.env.SENDGRID_API_KEY) {
        try {
          await sendLeadAlertEmail({ to: req.user.email, ...alertPayload });
          await Promise.all([
            supabase.from('alerts').insert({
              user_id:   req.user.id,
              lead_id:   lead.id,
              channel:   'email',
              delivered: false,
            }),
            supabase.from('leads').update({ notified_at: new Date().toISOString() }).eq('id', lead.id),
          ]);
          console.log(`[LeadSnap] Email alert sent to ${req.user.email}`);
        } catch (emailErr) {
          console.error('[LeadSnap] Email fallback failed:', emailErr.message);
        }
      }
    }

    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads ────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  ?? '50', 10), 100);
    const offset = Math.max(parseInt(req.query.offset ?? '0',  10), 0);
    const status = req.query.status;

    const { q, from, to } = req.query;

    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      query = query.eq('status', status);
    }
    if (q) {
      // Full-text search across post text, author, and group name
      query = query.or(`post_text.ilike.%${q}%,author_name.ilike.%${q}%,group_name.ilike.%${q}%`);
    }
    if (from) query = query.gte('created_at', from);
    if (to)   query = query.lte('created_at', to);

    const { data, count, error } = await query;
    if (error) throw error;

    res.json({ leads: data, total: count, limit, offset });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads/stats ──────────────────────────────────────────────────────

router.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: weekLeads }, { data: allLeads }] = await Promise.all([
      supabase
        .from('leads')
        .select('score, status')
        .eq('user_id', req.user.id)
        .gte('created_at', weekAgo),
      supabase
        .from('leads')
        .select('score, status')
        .eq('user_id', req.user.id),
    ]);

    const thisWeek  = weekLeads?.length ?? 0;
    const wins      = allLeads?.filter((l) => l.status === 'won').length ?? 0;
    const scored    = allLeads?.filter((l) => l.score != null) ?? [];
    const avgScore  = scored.length
      ? Math.round(scored.reduce((sum, l) => sum + l.score, 0) / scored.length * 10) / 10
      : null;

    res.json({ this_week: thisWeek, wins, avg_score: avgScore });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads/export ─────────────────────────────────────────────────────

router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const cols = ['id', 'post_text', 'post_url', 'author_name', 'group_name', 'group_url', 'score', 'ai_reply', 'status', 'matched_keywords', 'detected_at', 'notified_at', 'created_at'];

    function escapeCSV(val) {
      if (val == null) return '';
      const str = Array.isArray(val) ? val.join('; ') : String(val);
      if (/[,"\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    }

    const rows = [cols.join(',')];
    for (const lead of data) {
      rows.push(cols.map((c) => escapeCSV(lead[c])).join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leadsnap-leads.csv"');
    res.send(rows.join('\n'));
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/leads/:id ──────────────────────────────────────────────────────

router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const { data, error } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)   // enforce ownership — RLS is a second layer
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Lead not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
