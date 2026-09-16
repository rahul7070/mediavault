import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-screen" role="alert">
          <div className="error-boundary-card">
            <div className="error-boundary-icon" aria-hidden="true">⚠️</div>
            <h2>Something went wrong</h2>
            <p className="error-boundary-desc">
              An unexpected interface error occurred. You can attempt to restore the view or reload the page.
            </p>
            {this.state.error?.message && (
              <pre className="error-boundary-details">{this.state.error.message}</pre>
            )}
            <div className="error-boundary-actions">
              <button className="btn btn--primary" onClick={this.handleReset}>
                Try again
              </button>
              <button className="btn btn--secondary" onClick={() => window.location.reload()}>
                Reload application
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
