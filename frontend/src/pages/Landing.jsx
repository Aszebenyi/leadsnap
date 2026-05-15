import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

// Chrome Web Store URL — set VITE_CWS_URL in your .env once the extension is published
const CWS_URL = import.meta.env.VITE_CWS_URL || '#';

const BoltIcon = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size, height: size }}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </svg>
);

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function closeMobileMenu() { setMobileMenuOpen(false); }

  return (
    <div className="ls-root">

      {/* ── Nav ── */}
      <div className="ls-nav-wrap">
      <nav className="ls-nav">
        <a className="ls-brand" href="#">
          <span className="ls-brand-mark"><BoltIcon /></span>
          LeadSnap
        </a>
        <div className="ls-nav-links">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="ls-nav-cta">
          <Link to="/login" className="ls-btn secondary nav ls-nav-signin">Sign in</Link>
          <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn primary nav">Add to Chrome</a>
        </div>
        {/* Hamburger — mobile only */}
        <button
          className="ls-hamburger"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileMenuOpen((o) => !o)}
        >
          <span className={`ls-ham-bar ${mobileMenuOpen ? 'ls-ham-bar--top-open' : ''}`} />
          <span className={`ls-ham-bar ${mobileMenuOpen ? 'ls-ham-bar--mid-open' : ''}`} />
          <span className={`ls-ham-bar ${mobileMenuOpen ? 'ls-ham-bar--bot-open' : ''}`} />
        </button>
      </nav>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <div className="ls-mobile-menu">
          <a href="#how"      className="ls-mobile-link" onClick={closeMobileMenu}>How it works</a>
          <a href="#pricing"  className="ls-mobile-link" onClick={closeMobileMenu}>Pricing</a>
          <a href="#faq"      className="ls-mobile-link" onClick={closeMobileMenu}>FAQ</a>
          <div className="ls-mobile-menu-cta">
            <Link to="/login" className="ls-btn secondary" onClick={closeMobileMenu}>Sign in</Link>
            <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn primary" onClick={closeMobileMenu}>Add to Chrome</a>
          </div>
        </div>
      )}
      </div>{/* end ls-nav-wrap */}

      {/* ── Hero ── */}
      <header className="ls-hero">
        <div className="ls-eyebrow">
          <span className="accent">⚡</span>
          <span>Used by local service pros across the US</span>
        </div>

        <h1>
          <span className="ls-h1-line">The first reply gets the job.</span>
          <em className="ls-h1-line">We make sure it's you.</em>
        </h1>
        <p className="lede">
          LeadSnap watches your Facebook groups and texts you when someone needs your service — with a reply ready to send.
        </p>

        <div className="ls-cta-row">
          <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn primary">
            Add to Chrome — It's Free
          </a>
        </div>

        <div className="ls-disclaimer">
          <span><span className="ls-ck">✓</span> Free 7-day trial</span>
          <span><span className="ls-ck">✓</span> No credit card</span>
          <span><span className="ls-ck">✓</span> Setup in 2 minutes</span>
        </div>

        {/* Demo stage */}
        <div className="ls-demo-stage">

          {/* Facebook post */}
          <article className="ls-fb-post">
            <div className="ls-fb-detect">
              <span className="bolt"><BoltIcon size={9} /></span>
              LEADSNAP DETECTED
            </div>

            <div className="ls-fb-chrome">
              <div className="flogo">f</div>
              <div className="search">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.7 10.3a6 6 0 1 0-1.4 1.4l3 3a1 1 0 0 0 1.4-1.4l-3-3ZM7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Z" /></svg>
                South Austin Neighbors
              </div>
              <div className="nav-icons">
                <div className="nav-ic">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 2 11h3v9h5v-6h4v6h5v-9h3L12 2Z" /></svg>
                </div>
                <div className="nav-ic">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 8h-1V6a4 4 0 0 0-8 0v2H9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4V6Z" /></svg>
                </div>
              </div>
            </div>

            <div className="ls-fb-cover" />
            <div className="ls-fb-group-band">
              <div className="gicon">SA</div>
              <div>
                <div className="gname">South Austin Neighbors</div>
                <div className="gmeta">Private group · 14.2k members</div>
              </div>
              <span className="gjoin">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-7 16a7 7 0 0 1 14 0H5Z" /></svg>
                Joined
              </span>
            </div>

            <div className="ls-fb-head">
              <div className="av" />
              <div className="meta">
                <div className="uname">Tom Henderson</div>
                <div className="gline">
                  <a href="#">South Austin Neighbors</a>
                  <span className="dot">·</span>
                  <span>2m</span>
                  <span className="dot">·</span>
                  <span className="globe" aria-hidden="true" />
                </div>
              </div>
              <div className="more">···</div>
              <div className="close">×</div>
            </div>

            <div className="ls-fb-body">
              My grass is completely <span className="ls-fb-match">out of control</span> before my daughter's graduation party this Saturday 😅 Anyone have a recommendation for a reliable <span className="ls-fb-match">lawn service</span> that could come this week? <span className="ls-fb-match">Need grass cutting ASAP!</span>
            </div>

            <div className="ls-fb-react-summary">
              <div className="left">
                <div className="em-stack">
                  <span>👍</span>
                  <span>❤</span>
                </div>
                <span>Sarah Lin and 3 others</span>
              </div>
              <div className="right">
                <span>0 comments</span>
                <span>1 share</span>
              </div>
            </div>

            <div className="ls-fb-actions">
              <button>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11v9H4v-9h3Zm4 9h6.5a2 2 0 0 0 1.96-1.6l1.4-7A2 2 0 0 0 18.9 9H14V5a2 2 0 0 0-2-2l-3 8v9Z" /></svg>
                Like
              </button>
              <button>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12Z" /></svg>
                Comment
              </button>
              <button>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v14" /></svg>
                Share
              </button>
            </div>

            <div className="ls-fb-comment">
              <div className="av-sm" />
              <div className="input">Write a comment…</div>
            </div>
          </article>

          {/* Connector */}
          <div className="ls-demo-connector" aria-hidden="true">
            <svg viewBox="0 0 88 220" preserveAspectRatio="none">
              <path className="arrow-path" d="M 4 110 C 30 110, 60 110, 84 110" />
              <path className="arrow-path" d="M 78 102 L 86 110 L 78 118" />
            </svg>
            <div className="bolt-pill">
              <BoltIcon size={10} />
              SMS
            </div>
          </div>

          {/* iPhone */}
          <div className="ls-iphone-wrap">
            <div className="ls-iphone">
              <div className="ls-iphone-screen">
                <div className="ls-ios-status">
                  <span>9:41</span>
                  <div className="icons">
                    <svg viewBox="0 0 18 12" width="18" height="12" fill="white"><rect x="0" y="8" width="3" height="4" rx="0.5" /><rect x="5" y="6" width="3" height="6" rx="0.5" /><rect x="10" y="3" width="3" height="9" rx="0.5" /><rect x="15" y="0" width="3" height="12" rx="0.5" /></svg>
                    <svg viewBox="0 0 16 12" width="16" height="12" fill="white"><path d="M8 11a1.4 1.4 0 1 0 0-2.8A1.4 1.4 0 0 0 8 11Zm-3.4-3.6a4.8 4.8 0 0 1 6.8 0l1.2-1.2a6.5 6.5 0 0 0-9.2 0l1.2 1.2ZM2 4.8a8.5 8.5 0 0 1 12 0l1.2-1.2a10.2 10.2 0 0 0-14.4 0L2 4.8Z" /></svg>
                    <svg viewBox="0 0 26 12" width="26" height="12" fill="none" stroke="white" strokeWidth="1"><rect x="0.5" y="0.5" width="22" height="11" rx="3" /><rect x="2" y="2" width="19" height="8" rx="1.5" fill="white" /><rect x="23.5" y="4" width="2" height="4" rx="1" fill="white" /></svg>
                  </div>
                </div>
                <div className="ls-island" />
                <div className="ls-lock-lock">
                  <svg viewBox="0 0 14 18" fill="currentColor"><path d="M3 8V5a4 4 0 0 1 8 0v3h.5A1.5 1.5 0 0 1 13 9.5v7A1.5 1.5 0 0 1 11.5 18h-9A1.5 1.5 0 0 1 1 16.5v-7A1.5 1.5 0 0 1 2.5 8H3Zm1.6 0h4.8V5a2.4 2.4 0 0 0-4.8 0v3Z" /></svg>
                </div>
                <div className="ls-lock-time">9:41</div>
                <div className="ls-lock-date">Saturday, May 12</div>

                <div className="ls-ios-notif">
                  <div className="ls-notif-head">
                    <span className="ls-notif-icon"><BoltIcon size={13} /></span>
                    <span className="ls-notif-app">LeadSnap</span>
                    <span className="ls-notif-time">now</span>
                  </div>
                  <div className="ls-notif-title">🔔 New job — reply now</div>
                  <div className="ls-notif-body">Tom H. needs lawn cutting this week. Graduation party Saturday.</div>
                  <div className="ls-notif-sub">
                    <span className="badge">Score 9/10</span>
                    <span>Urgent</span>
                  </div>
                  <div className="ls-notif-reply">"Hey Tom! We can fit you in this week — DM me your address and I'll confirm the time! 🌿"</div>
                  <div className="ls-notif-cta">
                    <span>Tap to reply on Facebook</span>
                    <span>→</span>
                  </div>
                </div>

                <div className="ls-phone-dock">
                  <div className="ls-dock-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4h6l1 4h-8l1-4Z" /><path d="M8 8h8v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8Z" /></svg>
                  </div>
                  <div className="ls-dock-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></svg>
                  </div>
                </div>
                <div className="ls-home-indicator" />
              </div>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="ls-trust-strip">
          <div className="strip-label">Used by local service pros to get jobs from Facebook groups</div>
          <div className="tags">
            <span className="tag">🔧 "Anyone know a good plumber?"</span>
            <span className="tag">🌿 "Looking for a lawn service ASAP"</span>
            <span className="tag">🏠 "Need a house cleaner this week"</span>
            <span className="tag">🐕 "Anyone recommend a dog boarder?"</span>
          </div>
        </div>

        {/* Feature pills */}
        <div className="ls-feature-pills">
          <span className="ls-feature-pill"><span>👀</span> Stop searching. Jobs come to you</span>
          <span className="ls-feature-pill"><span>📱</span> Get a text the moment it's posted</span>
          <span className="ls-feature-pill"><span>💬</span> Reply in seconds — message already written</span>
          <span className="ls-feature-pill"><span>∞</span> Every group. No limits.</span>
        </div>
      </header>

      {/* ── Live feed scene ── */}
      <section className="ls-section">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">Jobs are being posted right now</div>
            <h2>People are posting jobs right now. <em>You're missing them.</em></h2>
            <p className="lede">While you're working, driving, or sleeping — people in your local Facebook groups are asking for exactly what you do. LeadSnap sees it first — and texts you instantly.</p>
          </div>

          <div className="ls-scene-grid">
            <div>
              <div className="ls-col-label">Posts happening in your groups right now</div>
              <div className="ls-feed-card">
                {[
                  { grad: 'linear-gradient(135deg,#5A8FCE,#3A6FB0)', icon: '🏘️', name: 'North Austin Families', time: '4 MIN AGO', text: 'Does anyone have a recommendation for a good nail salon near Domain?' },
                  { grad: 'linear-gradient(135deg,#9C6FCC,#6B4A9A)', icon: '🏡', name: 'Buda Community Chat', time: '2 MIN AGO', text: 'Anyone selling a used couch? Need one fast.' },
                ].map(({ grad, icon, name, time, text }) => (
                  <div className="ls-feed-row" key={name}>
                    <div className="ls-gicon-mini" style={{ background: grad }}>{icon}</div>
                    <div className="body">
                      <div className="topline">
                        <span className="gname">{name}</span>
                        <span className="gtime">{time}</span>
                      </div>
                      <div className="text">{text}</div>
                    </div>
                  </div>
                ))}
                <div className="ls-feed-row match">
                  <div className="ls-gicon-mini" style={{ background: 'linear-gradient(135deg,#6FAE7E,#3F7C56)' }}>🌿</div>
                  <div className="body">
                    <div className="topline">
                      <span className="gname">South Austin Neighbors</span>
                      <span className="gtime">JUST NOW</span>
                    </div>
                    <div className="text">My grass is completely out of control before my daughter's graduation party 😅 Need a lawn service this week.</div>
                    <div className="ls-feed-match-tag"><span>✦</span> LEAD MATCHED · SCORE 9/10 · URGENT</div>
                  </div>
                </div>
                <div className="ls-feed-row">
                  <div className="ls-gicon-mini" style={{ background: 'linear-gradient(135deg,#5AAEAE,#3A8080)' }}>🏘️</div>
                  <div className="body">
                    <div className="topline">
                      <span className="gname">West Lake Connect</span>
                      <span className="gtime">8 MIN AGO</span>
                    </div>
                    <div className="text">Anyone know what time the farmers market opens?</div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="ls-col-label">📱 SMS alert sent to your phone</div>
              <div className="ls-sms-card">
                <div className="ls-sms-header">
                  <span className="ls-sms-icon"><BoltIcon size={16} /></span>
                  <div>
                    <div className="ls-sms-from">LeadSnap</div>
                    <div className="ls-sms-when">NOW</div>
                  </div>
                </div>
                <div className="ls-sms-title">🔔 New job — reply now</div>
                <div className="ls-sms-body">Tom H. needs lawn cutting this week. Graduation party Saturday.</div>
                <div className="ls-sms-meta">
                  <span className="ls-score-badge">SCORE 9/10</span>
                  <span>URGENT · OTHERS ARE SEEING THIS</span>
                </div>
                <div className="ls-reply-label">Reply ready to send</div>
                <div className="ls-reply-box">"Hey Tom! We can fit you in this week — DM me your address and I'll confirm the time! 🌿"</div>
                <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn primary" style={{ width: '100%', justifyContent: 'center' }}>Add to Chrome — Be First to Reply →</a>
                <div className="ls-sms-sent">⚡ SENT TO YOUR PHONE IN UNDER 2 MINUTES</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="ls-section tint">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">Who it's for</div>
            <h2>If people ask for your service in Facebook groups — <em>this is for you.</em></h2>
            <p className="lede">Thousands of people post job requests in local groups every day. LeadSnap makes sure you see them first.</p>
          </div>
          <div className="ls-cat-grid">
            {[
              { icon: '🔧', name: 'Plumbers & Electricians', keys: 'plumber · electrician · water leak' },
              { icon: '🌿', name: 'Lawn & Garden',           keys: 'lawn mowing · grass cutting · landscaper' },
              { icon: '🏠', name: 'Home Cleaning',           keys: 'house cleaner · deep clean · move-out' },
              { icon: '🐕', name: 'Pet Services',            keys: 'dog boarding · sitter · walker' },
              { icon: '🎨', name: 'Painters & Handymen',    keys: 'painter · handyman · drywall' },
              { icon: '🚗', name: 'Auto Services',           keys: 'mobile mechanic · detailing · windshield' },
              { icon: '👶', name: 'Childcare & Tutoring',   keys: 'babysitter · nanny · tutor' },
              { icon: '💪', name: 'Health & Wellness',       keys: 'trainer · massage · nutrition' },
            ].map(({ icon, name, keys }) => (
              <div className="ls-cat-card" key={name}>
                <div className="ls-cat-icon">{icon}</div>
                <div className="ls-cat-name">{name}</div>
                <div className="ls-cat-keys">{keys}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="ls-section">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">The problem</div>
            <h2>You're losing jobs <em>before you even see them.</em></h2>
            <p className="lede">You're in 10, 15, 20 local groups. People post job requests all day. You can't watch every group. So someone else replies first.</p>
          </div>

          <div className="ls-problem-list">
            <div className="ls-problem-item"><div className="ico">⏰</div><h3>30+ minutes wasted every day</h3><p>Scrolling through memes, events, and lost dogs looking for one job.</p></div>
            <div className="ls-problem-item"><div className="ico">😞</div><h3>You show up late. The job is already taken.</h3><p>20 comments. Post is 3 hours old.</p></div>
            <div className="ls-problem-item"><div className="ico">📝</div><h3>Typing the same reply over and over</h3><p>Even when you catch one, you're rewriting the same message.</p></div>
            <div className="ls-problem-item solve"><div className="ico">✅</div><h3>LeadSnap handles all of it</h3><p>It watches every group, texts you instantly, and writes the reply. You just tap send.</p></div>
          </div>

          <div className="ls-compare">
            <div className="ls-compare-card">
              <div className="head">❌ Without LeadSnap</div>
              <div className="ls-compare-line no-top fail"><span className="t">9:17</span><span className="text">Post goes live — "Need a plumber today."</span></div>
              <div className="ls-compare-line fail"><span className="t">12:04</span><span className="text">You check Facebook. 23 comments. Job gone.</span></div>
              <div className="tagline" style={{ color: 'var(--muted)' }}>— Job lost</div>
            </div>
            <div className="ls-compare-card with">
              <div className="head">✅ With LeadSnap</div>
              <div className="ls-compare-line no-top"><span className="t">9:17</span><span className="text">Post goes live</span></div>
              <div className="ls-compare-line"><span className="t">9:19</span><span className="text"><strong>You get the text.</strong> Open. Paste. Send.</span></div>
              <div className="tagline">⚡ Job booked ✓</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="ls-section tint">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">How it works</div>
            <h2>Set it up once. <em>Get jobs every week.</em></h2>
            <p className="lede">Three steps. Takes 2 minutes.</p>
          </div>

          <div className="ls-steps">
            <div className="ls-step">
              <div className="num">1</div>
              <h3>Tell it what you do</h3>
              <p>Install the Chrome extension. Add your keywords and your phone number. Done.</p>
              <div className="demo">
                <div className="label" style={{ marginBottom: 6 }}>KEYWORDS</div>
                <span className="key">plumber</span>
                <span className="key">lawn service</span>
                <span className="key">house cleaner</span>
                <div style={{ height: 10 }} />
                <div className="field"><span>📱</span><span>(512) 555-0142</span></div>
              </div>
            </div>

            <div className="ls-step">
              <div className="num">2</div>
              <h3>It watches. You work.</h3>
              <p>LeadSnap watches every post in every group you're already in. No more manual searching.</p>
              <div className="demo">
                <div><span className="pulse" />WATCHING 23 GROUPS</div>
                <div style={{ marginTop: 8, color: 'var(--muted)' }}>south austin neighbors</div>
                <div style={{ color: 'var(--muted)' }}>north austin families</div>
                <div style={{ color: 'var(--muted)' }}>cedar park trade</div>
                <div style={{ color: 'var(--muted)' }}>pflugerville moms</div>
                <div style={{ color: 'var(--muted)' }}>…and 19 more</div>
              </div>
            </div>

            <div className="ls-step">
              <div className="num">3</div>
              <h3>Get the text. Reply first. Get the job.</h3>
              <p>The second someone posts, your phone buzzes. Tap. Send. You're first.</p>
              <div className="demo">
                <div className="text-msg">⚡ LeadSnap: New job — Tom H. needs lawn cutting this week. Reply ready, tap to send.</div>
                <div className="you-msg">Hey Tom! We can fit you in this week — DM me your address and I'll confirm 🌿</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="ls-section">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">What you get</div>
            <h2>Simple tools. <em>Real results.</em></h2>
          </div>
          <div className="ls-feat-grid">
            {[
              { icon: '📱', title: 'Text to your phone — instantly', body: 'Not email. Not another app notification. A text.' },
              { icon: '💬', title: 'Reply already written for you', body: 'Short. Natural. Sounds like you. Copy. Paste. Done.' },
              { icon: '🎯', title: 'Only real jobs get through', body: 'No spam. No noise. Only real opportunities.' },
              { icon: '∞',  title: 'Every group. No limits.',      body: 'The more groups you join, the more jobs you catch.' },
              { icon: '🔒', title: 'Private groups too',           body: "Works in any private group you're already a member of." },
              { icon: '📊', title: "See every job you've been sent", body: 'Track what came in and what converted.' },
            ].map(({ icon, title, body }) => (
              <div className="ls-feat-card" key={title}>
                <div className="ls-feat-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Comparison table ── */}
      <section className="ls-section tint">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">Why LeadSnap wins</div>
            <h2>Built for the way you actually work.</h2>
          </div>
          <div className="ls-cmp-table">
            <div className="ls-cmp-row">
              <div className="cell head">Feature</div>
              <div className="cell head us">LeadSnap</div>
              <div className="cell head">Other tools</div>
            </div>
            {[
              ['Real-time alerts',   '✓ Instant',      'Delayed'],
              ['SMS to your phone',  '✓ Yes',           '✗ No'],
              ['Reply ready',        '✓ Personalized',  'Generic'],
              ['Unlimited groups',   '✓ Yes',           'Limited'],
              ['Private groups',     '✓ Yes',           '✓ Yes'],
              ['Price',              '✓ $29/mo',        '$49+'],
            ].map(([feature, us, them]) => (
              <div className="ls-cmp-row" key={feature}>
                <div className="cell">{feature}</div>
                <div className="cell us">
                  <span className="ls-ck">{us.startsWith('✓') ? '✓' : ''}</span>
                  {us.replace(/^✓\s*/, '')}
                </div>
                <div className="cell them">
                  {them.startsWith('✗') && <span className="ls-x">✗</span>}
                  {them.startsWith('✓') && <span className="ls-ck">✓</span>}
                  {' '}{them.replace(/^[✓✗]\s*/, '')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="ls-section">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">Real people. Real jobs.</div>
            <h2>Local pros are winning more jobs.</h2>
          </div>
          <div className="ls-testi-grid">
            {[
              {
                quote: "I used to check Facebook twice a day and still miss jobs. Now I get a text with the reply already written. The first reply gets the job — this makes sure it's me.",
                name: 'Sarah M.', role: 'DOG BOARDING · MIAMI',
                c1: '#F4C99B', c2: '#E07A4D',
              },
              {
                quote: "I'm a plumber. I'm never at my computer. This gets me the job before anyone else replies.",
                name: 'Roberto G.', role: 'PLUMBING · AUSTIN',
                c1: '#BBD3F0', c2: '#5A8FCE',
              },
              {
                quote: "Everyone is in the same groups. Replying first doubled my bookings.",
                name: 'Tyler B.', role: 'LAWN CARE · DENVER',
                c1: '#C7E0B7', c2: '#6FAE7E',
              },
            ].map(({ quote, name, role, c1, c2 }) => (
              <div className="ls-testi" key={name}>
                <div className="stars">★★★★★</div>
                <blockquote>"{quote}"</blockquote>
                <div className="who">
                  <div className="av" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
                  <div>
                    <div className="name">{name}</div>
                    <div className="role">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="ls-section">
        <div className="ls-wrap">
          <div className="ls-value-band">
            <h2>One job pays for the whole year. <em>Everything after that is profit.</em></h2>
            <p className="lede">Most users get their first job during the free trial.</p>
          </div>

          <div className="ls-section-head center">
            <div className="ls-label">Simple pricing. No surprises.</div>
            <h2>No contracts. Cancel anytime.</h2>
          </div>

          <div className="ls-plans">
            <div className="ls-plan">
              <div className="plan-name">Free Trial</div>
              <div className="price">$0<small> / 7 days</small></div>
              <div className="price-sub">Try every feature. No credit card.</div>
              <ul>
                {['Up to 5 groups', 'SMS alerts', 'Reply included', 'Lead scoring'].map(f => (
                  <li key={f}><span className="ck">✓</span> {f}</li>
                ))}
              </ul>
              <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn dark">Add to Chrome →</a>
            </div>

            <div className="ls-plan pro">
              <div className="plan-name">Pro</div>
              <div className="price">$29<small> / month</small></div>
              <div className="price-sub">For pros booking real jobs every week.</div>
              <ul>
                {['Unlimited groups', 'Unlimited keywords', 'Priority alerts', 'Full dashboard', 'Support'].map(f => (
                  <li key={f}><span className="ck">✓</span> {f}</li>
                ))}
              </ul>
              <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn primary">Get Pro →</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="ls-section tint">
        <div className="ls-wrap">
          <div className="ls-section-head center">
            <div className="ls-label">FAQ</div>
            <h2>Everything you'd ask before signing up.</h2>
          </div>
          <div className="ls-faq">
            {[
              ['Does Chrome need to stay open?',    'Yes. Most users leave it running on their home or office computer.'],
              ['Can it monitor private groups?',     "Yes. If you're already a member, it works."],
              ['Does it auto-post replies?',         'No. You stay in control. It prepares the reply — you send it.'],
              ['How does the reply work?',           'LeadSnap learns what you do and writes a short reply that sounds like you.'],
              ['How many groups can I monitor?',    'Unlimited on Pro.'],
              ['Can I cancel anytime?',              'Yes.'],
            ].map(([q, a]) => (
              <details key={q} open>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="ls-final-cta">
        <h2>Stop searching. <em>Start replying first.</em></h2>
        <p className="lede">Jobs are being posted right now. Don't miss them.</p>
        <div className="ls-cta-row">
          <a href={CWS_URL} target="_blank" rel="noreferrer" className="ls-btn primary" style={{ fontSize: 16, padding: '16px 30px' }}>Add to Chrome — It's Free →</a>
        </div>
        <div className="ls-disclaimer">
          <span><span className="ls-ck">✓</span> Free 7-day trial</span>
          <span><span className="ls-ck">✓</span> No credit card</span>
          <span><span className="ls-ck">✓</span> Ready in 2 minutes</span>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="ls-footer">
        <div className="row">
          <a className="ls-brand" href="#" style={{ fontSize: 16 }}>
            <span className="ls-brand-mark" style={{ width: 24, height: 24, borderRadius: 7 }}>
              <BoltIcon size={12} />
            </span>
            LeadSnap
          </a>
          <div className="links">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms</Link>
            <a href={`mailto:legal@leadsnap.app`}>Support</a>
          </div>
          <div>© {new Date().getFullYear()} LeadSnap</div>
        </div>
      </footer>

    </div>
  );
}
