import { Link } from 'react-router-dom';

const CONTACT_EMAIL = 'privacy@leadsnap.app'; // TODO: update with real address
const EFFECTIVE_DATE = 'May 9, 2026';

export default function Privacy() {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#1a1a1a', background: '#fafaf8', minHeight: '100vh' }}>

      {/* Nav */}
      <nav style={{ maxWidth: 780, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/" style={{ fontWeight: 700, fontSize: 18, color: '#1a1a1a', textDecoration: 'none', letterSpacing: '-0.02em' }}>
          ⚡ LeadSnap
        </Link>
        <Link to="/" style={{ fontSize: 14, color: '#6b7280', textDecoration: 'none' }}>← Back to home</Link>
      </nav>

      {/* Content */}
      <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 96px' }}>

        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8, lineHeight: 1.15 }}>Privacy Policy</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 48 }}>Effective date: {EFFECTIVE_DATE}</p>

        <Prose>
          <p>
            LeadSnap ("we", "us", or "our") operates the LeadSnap Chrome extension and web dashboard (collectively, the "Service"). This Privacy Policy explains what information we collect, how we use it, who we share it with, and the choices you have.
          </p>
          <p>
            By using the Service you agree to the collection and use of information as described in this policy.
          </p>
        </Prose>

        <Section title="1. Information We Collect">
          <SubSection title="Account information">
            <p>When you create an account we collect your <strong>email address</strong> and a hashed password managed by Supabase Auth. We never store your password in plain text.</p>
          </SubSection>

          <SubSection title="Profile information">
            <p>You may optionally provide:</p>
            <ul>
              <li><strong>Phone number</strong> — used to send you SMS lead alerts via Twilio.</li>
              <li><strong>Business name and service description</strong> — used to personalise AI-generated replies.</li>
              <li><strong>Website URL</strong> — optionally included in AI-generated replies when you enable that setting.</li>
            </ul>
          </SubSection>

          <SubSection title="Facebook group data">
            <p>The LeadSnap Chrome extension reads the list of Facebook groups you are a member of and the content of posts in those groups, <strong>entirely within your own browser</strong>. This data is not stored on our servers unless a post matches your keywords, in which case the matched post text, post URL, author name, group name, and group URL are sent to our backend and stored as a lead record associated with your account.</p>
            <p>We do not log in to Facebook on your behalf. We do not read private messages or your Facebook profile. We do not store your Facebook credentials.</p>
          </SubSection>

          <SubSection title="Lead data">
            <p>When the extension detects a matching post we store:</p>
            <ul>
              <li>Post text, post URL, and author name</li>
              <li>Facebook group name and URL</li>
              <li>The keywords that matched</li>
              <li>An AI-generated lead score (1–10) and reason</li>
              <li>An AI-generated reply suggestion</li>
              <li>The timestamp the lead was detected</li>
              <li>Whether an SMS alert was sent</li>
            </ul>
          </SubSection>

          <SubSection title="Billing information">
            <p>Subscription payments are processed by <strong>Stripe</strong>. We store only the Stripe customer ID and subscription status. Full card details are handled exclusively by Stripe and are never passed through or stored on our servers.</p>
          </SubSection>

          <SubSection title="Usage and technical data">
            <p>We may collect standard server logs including IP addresses, browser type, and request timestamps for security monitoring and debugging. We do not use third-party analytics or advertising trackers.</p>
          </SubSection>
        </Section>

        <Section title="2. How We Use Your Information">
          <ul>
            <li><strong>To provide the Service</strong> — scanning Facebook groups for matching posts, scoring leads, and generating AI replies.</li>
            <li><strong>To send SMS alerts</strong> — when a lead is detected we send an SMS to your registered phone number via Twilio (if provided).</li>
            <li><strong>To personalise AI output</strong> — your service description and optional website URL are included in prompts sent to the Anthropic Claude API to generate contextually relevant replies.</li>
            <li><strong>To manage your subscription</strong> — we use your Stripe customer record to check subscription status and enforce plan limits.</li>
            <li><strong>To maintain security</strong> — server logs are reviewed to detect abuse and protect the platform.</li>
            <li><strong>To communicate with you</strong> — transactional emails (e.g. password reset, subscription receipts) sent via Supabase or Stripe.</li>
          </ul>
          <p>We do not sell your personal information. We do not use your data to train AI models.</p>
        </Section>

        <Section title="3. Third-Party Services">
          <p>LeadSnap relies on the following sub-processors, each with their own privacy practices:</p>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '12px 0 20px' }}>
            <table style={{ margin: 0 }}>
              <thead>
                <tr><th>Service</th><th>Purpose</th><th>Privacy Policy</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Supabase</strong></td>
                  <td>Database, authentication, and file storage</td>
                  <td><a href="https://supabase.com/privacy" target="_blank" rel="noreferrer">supabase.com/privacy</a></td>
                </tr>
                <tr>
                  <td><strong>Stripe</strong></td>
                  <td>Payment processing and subscription billing</td>
                  <td><a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">stripe.com/privacy</a></td>
                </tr>
                <tr>
                  <td><strong>Twilio</strong></td>
                  <td>SMS lead alert delivery</td>
                  <td><a href="https://www.twilio.com/en-us/legal/privacy" target="_blank" rel="noreferrer">twilio.com/legal/privacy</a></td>
                </tr>
                <tr>
                  <td><strong>Anthropic</strong></td>
                  <td>AI lead scoring and reply generation</td>
                  <td><a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer">anthropic.com/privacy</a></td>
                </tr>
                <tr>
                  <td><strong>Facebook (Meta)</strong></td>
                  <td>Source of group post data, accessed via your browser session</td>
                  <td><a href="https://www.facebook.com/privacy/policy/" target="_blank" rel="noreferrer">facebook.com/privacy/policy</a></td>
                </tr>
                <tr>
                  <td><strong>Railway</strong></td>
                  <td>Backend API hosting</td>
                  <td><a href="https://railway.app/legal/privacy" target="_blank" rel="noreferrer">railway.app/legal/privacy</a></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>Post text is transmitted to Anthropic's API for scoring and reply generation. We send only the post content and your business description — no personally identifiable information about the Facebook poster is included beyond what appears in the post itself.</p>
        </Section>

        <Section title="4. Data Retention">
          <ul>
            <li><strong>Lead records</strong> — retained for <strong>90 days</strong> from the date of detection, then automatically deleted.</li>
            <li><strong>Account and profile data</strong> — retained for as long as your account is active. Deleted within 30 days of a verified account deletion request.</li>
            <li><strong>SMS alert logs</strong> — retained for 90 days, then deleted.</li>
            <li><strong>Server logs</strong> — retained for up to 30 days for security purposes.</li>
            <li><strong>Stripe billing records</strong> — retained as required by Stripe and applicable financial regulations (typically 7 years).</li>
          </ul>
        </Section>

        <Section title="5. Your Rights and Choices">
          <SubSection title="Access and correction">
            <p>You can view and update your profile information (business name, service description, phone number) at any time from the Settings page in your dashboard.</p>
          </SubSection>

          <SubSection title="Delete your account">
            <p>You can request deletion of your account and all associated data by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will complete the deletion within 30 days. Note that Stripe retains billing records independently per their legal obligations.</p>
          </SubSection>

          <SubSection title="Export your data">
            <p>You can request a copy of the lead data associated with your account by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We will provide a CSV export within 30 days.</p>
          </SubSection>

          <SubSection title="Opt out of SMS alerts">
            <p>Remove your phone number from the Settings page at any time. You can also reply STOP to any SMS alert to unsubscribe immediately.</p>
          </SubSection>

          <SubSection title="Stop monitoring">
            <p>You can disable scanning at any time by toggling "Enable monitoring" off in the extension popup, or by cancelling your subscription.</p>
          </SubSection>

          <SubSection title="California residents (CCPA)">
            <p>California residents have the right to know what personal information is collected, to request deletion, and to opt out of the sale of personal information. We do not sell personal information. To exercise your rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
          </SubSection>
        </Section>

        <Section title="6. Data Security">
          <p>We implement industry-standard safeguards including TLS encryption in transit, row-level security on our database (Supabase), JWT-based API authentication, and environment-variable management of all secrets. No method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.</p>
        </Section>

        <Section title="7. Children's Privacy">
          <p>LeadSnap is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.</p>
        </Section>

        <Section title="8. Compliance with Social Media Platforms">
          <p>Our extension is built to boost user productivity and streamline time spent browsing social media content. It is not intended to support or encourage any actions that violate the terms of service, usage policies, or community guidelines of social media platforms. The tool does not facilitate data scraping, artificial engagement, or any behavior that would conflict with Facebook's rules. We do not collect or store any personal or platform-related data. Any temporary data cached in the user's browser is used solely to power in-session productivity features and avoid repeated requests. This data remains local to the user's device, is never transmitted to us, and is automatically cleared to safeguard privacy and remain compliant with social platform policies.</p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>We may update this Privacy Policy from time to time. When we do we will revise the "Effective date" at the top of this page. Continued use of the Service after changes are posted constitutes your acceptance of the updated policy. For material changes we will send a notice to your registered email address.</p>
        </Section>

        <Section title="10. Contact Us">
          <p>For privacy-related questions, data requests, or to report a concern, please email:</p>
          <p style={{ marginTop: 8 }}>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ fontWeight: 600 }}>{CONTACT_EMAIL}</a>
          </p>
          <p style={{ marginTop: 8, color: '#6b7280', fontSize: 14 }}>We aim to respond to all requests within 5 business days.</p>
        </Section>

      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        © {new Date().getFullYear()} LeadSnap · <Link to="/privacy" style={{ color: '#9ca3af' }}>Privacy Policy</Link>
      </footer>
    </div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid #e5e7eb' }}>
        {title}
      </h2>
      <Prose>{children}</Prose>
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#374151' }}>{title}</h3>
      <Prose>{children}</Prose>
    </div>
  );
}

function Prose({ children }) {
  return (
    <>
      <style>{`
        .privacy-prose p { margin-bottom: 12px; }
        .privacy-prose ul { margin: 8px 0 12px 20px; }
        .privacy-prose li { margin-bottom: 6px; }
        .privacy-prose a { color: #f26b1f; text-underline-offset: 2px; }
        .privacy-prose a:hover { color: #d8551a; }
        .privacy-prose table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; font-size: 14px; }
        .privacy-prose th { text-align: left; padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; color: #1a1a1a; }
        .privacy-prose td { padding: 8px 12px; border: 1px solid #e5e7eb; vertical-align: top; }
        .privacy-prose td a { font-size: 13px; }
      `}</style>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: '#374151' }} className="privacy-prose">
        {children}
      </div>
    </>
  );
}
