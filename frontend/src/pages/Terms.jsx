import { Link } from 'react-router-dom';

const CONTACT_EMAIL  = 'legal@leadsnap.app';
const EFFECTIVE_DATE = 'May 9, 2026';

export default function Terms() {
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

        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8, lineHeight: 1.15 }}>Terms of Service</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 48 }}>Effective date: {EFFECTIVE_DATE}</p>

        <Prose>
          <p>
            Please read these Terms of Service ("Terms") carefully before using LeadSnap (the "Service"), operated by LeadSnap ("we", "us", or "our"). By accessing or using the Service you agree to be bound by these Terms. If you do not agree, do not use the Service.
          </p>
        </Prose>

        <Section title="1. Acceptance of Terms">
          <p>
            By creating an account or installing the LeadSnap Chrome extension, you confirm that you are at least 18 years old, have the legal capacity to enter into a binding agreement, and agree to these Terms and our <Link to="/privacy">Privacy Policy</Link>.
          </p>
          <p>
            If you are using the Service on behalf of a business, you represent that you have authority to bind that business to these Terms, and "you" refers to both you and that business.
          </p>
        </Section>

        <Section title="2. Description of Service">
          <p>
            LeadSnap is a Chrome extension and web dashboard that monitors Facebook groups for posts matching user-defined keywords. When a matching post is found, LeadSnap sends an SMS alert to your registered phone number and provides an AI-generated reply suggestion powered by the Anthropic Claude API.
          </p>
          <p>
            The Service requires an active Facebook account, Chrome browser, and a LeadSnap subscription after the free trial period. We do not guarantee any specific number of leads, reply success rates, or business outcomes.
          </p>
        </Section>

        <Section title="3. Subscription and Billing">
          <SubSection title="Free trial">
            <p>New accounts receive a <strong>7-day free trial</strong> with full access to all features. No credit card is required to start a trial. At the end of the trial period, the Service will be suspended unless you subscribe to a paid plan.</p>
          </SubSection>

          <SubSection title="Pro plan">
            <p>The LeadSnap Pro plan is billed at <strong>$29.00 per month</strong>. Your subscription begins immediately upon payment and renews automatically on the same date each month. All payments are processed securely by Stripe.</p>
          </SubSection>

          <SubSection title="Cancellation">
            <p>You may cancel your subscription at any time from the Billing page in your dashboard or by contacting us. Cancellation takes effect at the end of your current billing period — you retain full access until then. We do not offer refunds for partial months or unused time.</p>
          </SubSection>

          <SubSection title="Payment failures">
            <p>If a payment fails, your account will be placed in a past-due state and scanning will be suspended. You will have a grace period to update your payment method before the account is fully deactivated.</p>
          </SubSection>

          <SubSection title="Price changes">
            <p>We may change subscription pricing with at least 30 days' notice. Price changes take effect at your next renewal date after the notice period.</p>
          </SubSection>
        </Section>

        <Section title="4. User Responsibilities">
          <ul>
            <li><strong>Account security</strong> — You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you suspect unauthorised access.</li>
            <li><strong>Accurate information</strong> — You agree to provide accurate, current, and complete information when creating your account and to keep it updated.</li>
            <li><strong>Facebook account</strong> — You must have a legitimate, personal Facebook account in good standing. You are solely responsible for complying with Facebook's Terms of Service.</li>
            <li><strong>Phone number</strong> — If you provide a phone number for SMS alerts, you confirm you are the authorised user of that number and consent to receive automated text messages from LeadSnap.</li>
            <li><strong>Lawful use</strong> — You agree to use the Service only for lawful business purposes and in compliance with all applicable local, state, national, and international laws.</li>
          </ul>
        </Section>

        <Section title="5. Prohibited Uses">
          <p>You may not use the Service to:</p>
          <ul>
            <li>Send unsolicited commercial messages (spam) to Facebook users</li>
            <li>Scrape, harvest, or collect data from Facebook at a scale that violates Facebook's Terms of Service or Platform Policy</li>
            <li>Create fake accounts, generate artificial engagement, or manipulate Facebook's systems</li>
            <li>Resell, sublicense, or redistribute the Service or any leads generated by it without our written consent</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the extension or any part of the Service</li>
            <li>Interfere with or disrupt the integrity or performance of the Service or its underlying infrastructure</li>
            <li>Use the AI-generated replies to misrepresent your identity, services, or location</li>
            <li>Use the Service for any illegal purpose, including violating consumer protection laws or data protection regulations</li>
          </ul>
          <p>Violation of these prohibitions may result in immediate termination of your account without refund.</p>
        </Section>

        <Section title="6. Intellectual Property">
          <p>
            The Service, including its software, design, trademarks, and content, is owned by LeadSnap and protected by applicable intellectual property laws. These Terms do not grant you any ownership rights in the Service.
          </p>
          <p>
            You retain ownership of all data you provide to the Service (keywords, business description, lead notes). By using the Service, you grant us a limited, non-exclusive licence to process that data solely to provide the Service to you.
          </p>
        </Section>

        <Section title="7. Limitation of Liability">
          <SubSection title="No warranty">
            <p>The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that any specific lead volume or business outcome will result from use of the Service.</p>
          </SubSection>

          <SubSection title="Liability cap">
            <p>To the maximum extent permitted by applicable law, LeadSnap's total liability to you for any claim arising out of or relating to these Terms or the Service shall not exceed the greater of: (a) the total fees you paid in the three months immediately preceding the claim, or (b) $100 USD.</p>
          </SubSection>

          <SubSection title="Exclusions">
            <p>In no event shall LeadSnap be liable for any indirect, incidental, special, consequential, or punitive damages, including lost profits or lost business opportunities, arising out of your use or inability to use the Service, even if advised of the possibility of such damages.</p>
          </SubSection>
        </Section>

        <Section title="8. Termination">
          <SubSection title="By you">
            <p>You may stop using the Service and cancel your subscription at any time. Account deletion requests can be submitted by emailing <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
          </SubSection>

          <SubSection title="By us">
            <p>We may suspend or terminate your account immediately, without prior notice or liability, if you breach these Terms, engage in prohibited uses, or if we reasonably believe your use poses a risk to the Service or other users. Upon termination, your right to use the Service ceases immediately.</p>
          </SubSection>
        </Section>

        <Section title="9. Changes to These Terms">
          <p>
            We may update these Terms from time to time. For material changes, we will provide at least <strong>30 days' notice</strong> via email to your registered address before the new terms take effect. Non-material changes (such as clarifications or corrections) may be made at any time and will be reflected by an updated effective date.
          </p>
          <p>
            Continued use of the Service after the effective date of revised Terms constitutes your acceptance. If you do not agree to the updated Terms, you must cancel your subscription before the changes take effect.
          </p>
        </Section>

        <Section title="10. Contact Us">
          <p>For questions about these Terms, billing disputes, or to request account deletion, please contact:</p>
          <p style={{ marginTop: 8 }}>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ fontWeight: 600 }}>{CONTACT_EMAIL}</a>
          </p>
          <p style={{ marginTop: 8, color: '#6b7280', fontSize: 14 }}>We aim to respond to all requests within 5 business days.</p>
        </Section>

      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        © {new Date().getFullYear()} LeadSnap ·{' '}
        <Link to="/privacy" style={{ color: '#9ca3af' }}>Privacy Policy</Link>
        {' · '}
        <Link to="/terms" style={{ color: '#9ca3af' }}>Terms of Service</Link>
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
        .terms-prose p { margin-bottom: 12px; }
        .terms-prose ul { margin: 8px 0 12px 20px; }
        .terms-prose li { margin-bottom: 8px; line-height: 1.6; }
        .terms-prose a { color: #f26b1f; text-underline-offset: 2px; }
        .terms-prose a:hover { color: #d8551a; }
      `}</style>
      <div style={{ fontSize: 15, lineHeight: 1.7, color: '#374151' }} className="terms-prose">
        {children}
      </div>
    </>
  );
}
