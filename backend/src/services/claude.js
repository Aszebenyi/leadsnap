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
 * @returns {string}
 */
export async function generateReply(postText, serviceDescription) {
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
- Sound like a real local person

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
