import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';

export default function Navbar() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  const linkClass = ({ isActive }) =>
    `text-sm font-medium transition-colors ${
      isActive ? 'text-orange-500' : 'text-gray-600 hover:text-gray-900'
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `block px-4 py-3 text-sm font-medium border-b border-gray-100 transition-colors ${
      isActive ? 'text-orange-500 bg-orange-50' : 'text-gray-700 hover:bg-gray-50'
    }`;

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="font-bold text-orange-500 text-lg tracking-tight">
          LeadSnap
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
          <NavLink to="/settings"  className={linkClass}>Settings</NavLink>
          <NavLink to="/billing"   className={linkClass}>Billing</NavLink>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Hamburger button — mobile only */}
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="md:hidden flex flex-col justify-center gap-1.5 w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors items-center"
        >
          <span className={`block h-0.5 w-5 bg-gray-700 rounded transition-transform duration-200 ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
          <span className={`block h-0.5 w-5 bg-gray-700 rounded transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block h-0.5 w-5 bg-gray-700 rounded transition-transform duration-200 ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white shadow-lg">
          <NavLink to="/dashboard" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>Dashboard</NavLink>
          <NavLink to="/settings"  className={mobileLinkClass} onClick={() => setMenuOpen(false)}>Settings</NavLink>
          <NavLink to="/billing"   className={mobileLinkClass} onClick={() => setMenuOpen(false)}>Billing</NavLink>
          <button
            onClick={() => { setMenuOpen(false); handleSignOut(); }}
            className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
