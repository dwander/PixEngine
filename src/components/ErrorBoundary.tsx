import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-[var(--background-primary)] text-[var(--text-primary)]">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-red-500">오류가 발생했습니다</h1>
            <p className="text-[var(--text-secondary)]">
              애플리케이션에서 예상치 못한 오류가 발생했습니다.
            </p>
            {this.state.error && (
              <details className="text-left p-4 bg-[var(--background-secondary)] rounded-lg">
                <summary className="cursor-pointer font-semibold mb-2">
                  오류 상세정보
                </summary>
                <pre className="text-xs overflow-auto whitespace-pre-wrap break-words">
                  {this.state.error.toString()}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
