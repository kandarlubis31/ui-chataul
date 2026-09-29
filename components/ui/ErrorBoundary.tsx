"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-red-500/10 p-3">
              <AlertTriangle className="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Something went wrong
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {this.state.error?.message || "An unexpected error occurred."}
              </p>
            </div>
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
