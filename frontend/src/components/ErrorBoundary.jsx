import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[LeadSnap] Render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 mb-6">
              An unexpected error occurred. Try reloading the page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="bg-orange-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                Reload page
              </button>
              <a
                href="/dashboard"
                className="border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Go to dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
