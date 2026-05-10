import Anthropic from '@anthropic-ai/sdk';


let _client;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const MODEL = 'claude-3-5-haiku-latest';

/**
 * Score a Facebook post for buyer intent.
 * @returns {{ score: number, reason: string, urgent: boolean }}
 *
 * TODO post-launch: implement feedback loop where leads marked as won/lost update
 * scoring weights for this user's ideal lead description.
 */
export async function scoreLead(postText, serviceDescription, aiDescription = '') {
  const extraContext = aiDescription
    ? `\nThe business owner describes their ideal lead as: "${aiDescription}"\nUse this to calibrate buyer intent beyond keyword matching — weight posts that match this description more heavily.`
    : '';

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 256,
    system: `You are a lead scoring assistant for a local service business.
Score this Facebook post for buyer intent on a scale of 1-10.

Return JSON only:
{
  "score": <number 1-10>,
  "reason": "<one sentence>",
  "urgent": <boolean>
}

Score guidelines:
- 9-10: Clear request for a service, ready to hire now
- 7-8: Looking for a service, likely to hire soon
- 5-6: Possibly looking, but unclear
- 3-4: Asking for recommendation for someone else
- 1-2: Not a job request at all${extraContext}`,
    messages: [
      {
        role: 'user',
        content: `The business is: ${serviceDescription}\nPost: ${postText}`,
      },
    ],
  });

  const text = message.content[0]?.text ?? '';

  // Strip any markdown fences Claude might add
  const jsonText = text.replace(/```(?:json)?\n?/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Failed to parse Claude score response: ${text}`);
  }

  const score = Math.min(10, Math.max(1, Math.round(Number(parsed.score))));
  return {
    score,
    reason:  String(parsed.reason ?? ''),
    urgent:  Boolean(parsed.urgent),
  };
}

/**
 * Generate a short reply to a Facebook post.
 * @param {string} postText
 * @param {string} serviceDescription
 * @param {string|null} websiteUrl - optional URL to naturally mention in the reply
 * @returns {string}
 */
export async function generateReply(postText, serviceDescription, websiteUrl = null) {
  const urlInstruction = websiteUrl
    ? `\n- If it flows naturally, include a brief mention of your website (${websiteUrl}) near the end`
    : '';

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 256,
    system: `You are a reply assistant for a local service business.
Write a short, friendly reply to this Facebook post.

Rules:
- Maximum 2 sentences
- Sound natural, not like an ad
- Mention availability or willingness to help
- End with a soft call to action (DM me, send me a message, etc)
- Do not use hashtags
- Do not be pushy or salesy
- Sound like a real local person${urlInstruction}

Return the reply text only, no quotes, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `My business: ${serviceDescription}\nPost: ${postText}`,
      },
    ],
  });

  const reply = message.content[0]?.text?.trim() ?? '';
  if (!reply) throw new Error('Claude returned an empty reply');
  return reply;
}

/**
 * Generate a 2-sentence ideal-lead description for Step 5 of onboarding.
 *
 * Two modes:
 *   - serviceDescription + keywords  → describe the ideal Facebook post / buyer signal
 *   - keywords only                  → describe what the business does and who their ideal customer is
 *
 * @param {string} serviceDescription - extracted from website (may be empty string)
 * @param {string[]} keywords         - Step 3 keywords (may be empty array)
 * @returns {string} plain-text suggestion (2 sentences)
 */
export async function suggestLeadDescription(serviceDescription, keywords) {
  const hasDescription = serviceDescription && serviceDescription.trim().length > 0;
  const hasKeywords    = keywords && keywords.length > 0;

  if (!hasDescription && !hasKeywords) {
    throw new Error('Provide a service description or at least one keyword');
  }

  let system, userContent;

  if (hasDescription) {
    system = `Based on a business description and keywords, write exactly 2 sentences describing their ideal Facebook group lead. Be specific about buyer intent signals — what would someone post that shows they're ready to hire this business right now? Return the description text only, no quotes, no explanation.`;
    userContent = `Business description: ${serviceDescription}${hasKeywords ? `\nKeywords: ${keywords.join(', ')}` : ''}`;
  } else {
    system = `Based on keywords a local service business uses to find leads on Facebook, write exactly 2 sentences: one describing what the business does, one describing what their ideal customer would post in a Facebook group. Focus on buyer intent signals. Return the description text only, no quotes, no explanation.`;
    userContent = `Keywords: ${keywords.join(', ')}`;
  }

  const message = await getClient().messages.create({
    model:      MODEL,
    max_tokens: 200,
    system,
    messages:   [{ role: 'user', content: userContent }],
  });

  const text = message.content[0]?.text?.trim() ?? '';
  if (!text) throw new Error('Claude returned an empty suggestion');
  return text;
}

/**
 * Extract business info from a webpage's text content.
 * @param {string} pageText - stripped plain text from the website (max 5 000 chars)
 * @param {string} url - original URL (included for context)
 * @returns {{ business_name: string|null, service_description: string, location: string|null, suggested_keywords: string[] }}
 */
export async function extractBusinessInfo(pageText, url) {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: `Extract business information from this webpage text.

Return JSON only — no markdown fences:
{
  "business_name": "<string or null>",
  "service_description": "<1-2 sentence plain-English description of what they do>",
  "location": "<city, state or null>",
  "suggested_keywords": ["<kw1>", "<kw2>", ...]
}

suggested_keywords: 4-8 short phrases someone would post in a local Facebook group when looking for this service (e.g. "need a plumber asap", "lawn mowing", "dog boarding").`,
    messages: [
      {
        role: 'user',
        content: `Website: ${url}\n\n${pageText}`,
      },
    ],
  });

  const raw = message.content[0]?.text ?? '';
  const json = raw.replace(/```(?:json)?\n?/g, '').trim();
  try {
    return JSON.parse(json);
  } catch {
    throw new Error(`Claude returned unparseable extraction: ${raw.slice(0, 120)}`);
  }
}
