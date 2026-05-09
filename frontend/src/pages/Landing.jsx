import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-blue-600 text-lg">LeadSnap</span>
          <div className="flex items-center gap-4">
            <Link to="/login"  className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
            <Link to="/signup" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 leading-tight tracking-tight mb-6">
          Win more local jobs.<br />Reply before anyone else.
        </h1>
        <p className="text-xl text-gray-600 mb-10 leading-relaxed">
          LeadSnap monitors Facebook groups for local service requests and sends you
          an instant SMS with an AI-generated reply — so you can respond first and win the job.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/signup" className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors">
            Start free 7-day trial
          </Link>
          <span className="text-gray-500 text-sm">No credit card required</span>
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="max-w-5xl mx-auto px-4 grid md:grid-cols-3 gap-10">
          {[
            { icon: '📡', title: 'Auto-monitors Facebook groups', body: "The Chrome extension scans every group you're in, 24/7, while your browser is open." },
            { icon: '⚡', title: 'Instant SMS alerts', body: 'Get a text the moment a matching post is found — before anyone else has a chance to reply.' },
            { icon: '🤖', title: 'AI-written replies', body: 'Each alert includes a ready-to-send reply written for your specific business. Just copy and paste.' },
          ].map(({ icon, title, body }) => (
            <div key={title} className="text-center">
              <div className="text-4xl mb-4">{icon}</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
              <p className="text-gray-600 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div className="py-20">
        <div className="max-w-md mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple pricing</h2>
          <div className="border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="text-5xl font-bold text-gray-900 mb-1">$29<span className="text-xl font-normal text-gray-500">/mo</span></div>
            <div className="text-gray-500 mb-6">after 7-day free trial</div>
            <ul className="text-left space-y-3 text-sm text-gray-700 mb-8">
              {['Unlimited keywords', 'Unlimited Facebook groups', 'Instant SMS alerts', 'AI-generated replies', 'Lead history dashboard'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-500 font-bold">✓</span> {f}
                </li>
              ))}
            </ul>
            <Link to="/signup" className="block w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Start free trial
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} LeadSnap. All rights reserved.
      </footer>
    </div>
  );
}
