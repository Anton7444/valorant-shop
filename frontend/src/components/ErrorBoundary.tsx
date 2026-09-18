import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-svh items-center justify-center bg-bg-primary px-4">
          <div className="max-w-md text-center">
            <h1
              className="mb-2 text-3xl tracking-wider text-accent-red"
              style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700 }}
            >
              SOMETHING WENT WRONG
            </h1>
            <p className="mb-6 text-sm text-text-secondary">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="rounded bg-accent-red px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white transition-all hover:brightness-110"
              style={{ fontFamily: "'Oswald', sans-serif" }}
            >
              BACK TO LOGIN
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
