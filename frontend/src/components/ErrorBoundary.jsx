import { Component } from 'react';
import { reportError } from '../utils/errorReporter';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Also send it to the admin Errors page. reportError never throws.
    reportError(error, { kind: 'react', componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#080e22',
          color: '#ef4444', fontFamily: 'monospace', padding: '32px', gap: '16px',
        }}>
          <h2 style={{ color: '#fff', fontSize: '20px', margin: 0 }}>App crashed</h2>
          <pre style={{
            background: '#0d1b3e', padding: '16px', borderRadius: '8px',
            color: '#fca5a5', maxWidth: '720px', overflowX: 'auto',
            fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ background: '#1a2a5e', color: '#fff', border: '1px solid #3f5fa5',
              padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
