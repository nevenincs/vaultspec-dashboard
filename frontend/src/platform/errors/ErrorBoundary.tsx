// Exception containment (ADR D5): React's only error-catching mechanism is a
// class boundary, so this is the substrate's single class component. An
// app-level boundary is the last line; per-region boundaries contain a thrown
// render to its region so a crashed right rail never white-screens the stage.
// Each boundary logs through the platform logger and renders a designed,
// recoverable fallback consistent with the degradation vocabulary.
//
// Mechanism only (ADR D1/D4): this catches *unexpected* throws. Expected
// degradations (rag down, stream lost) flow through the app's degradation
// matrix, not here.

import { Component, type ErrorInfo, type ReactNode } from "react";

import { logger } from "../logger/logger";

const boundaryLog = logger.child("boundary");
const devMode = Boolean(import.meta.env?.DEV);

export interface FallbackRenderProps {
  error: Error;
  region: string;
  variant: "app" | "region";
  reset: () => void;
}

export interface ErrorBoundaryProps {
  /** Identifies the contained region in logs and the fallback (e.g. "stage"). */
  region: string;
  /** "app" is the full-screen last line; "region" is a contained panel card. */
  variant?: "app" | "region";
  /** Override the designed fallback; receives the error and a reset callback. */
  fallback?: (props: FallbackRenderProps) => ReactNode;
  /** Extra side effect on catch (the logger hook always runs first). */
  onError?: (error: Error, info: ErrorInfo) => void;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    boundaryLog.error(`uncaught render error in region "${this.props.region}"`, error);
    boundaryLog.debug("component stack", {
      region: this.props.region,
      componentStack: info.componentStack,
    });
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const variant = this.props.variant ?? "region";
    const renderProps: FallbackRenderProps = {
      error,
      region: this.props.region,
      variant,
      reset: this.reset,
    };
    if (this.props.fallback) return this.props.fallback(renderProps);
    return <DefaultFallback {...renderProps} />;
  }
}

/**
 * The designed contained fallback. The app variant is a full-screen last
 * line; the region variant is a compact amber card (the degradation palette)
 * that keeps its sibling regions alive and offers a retry. The raw error
 * message is shown only in development.
 */
export function DefaultFallback({
  error,
  region,
  variant,
  reset,
}: FallbackRenderProps): ReactNode {
  if (variant === "app") {
    return (
      <div
        role="alert"
        data-error-region={region}
        className="flex h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center text-stone-800"
      >
        <p className="text-sm font-medium">The dashboard hit an unexpected error.</p>
        {devMode && (
          <p className="max-w-md break-words text-xs text-stone-500">{error.message}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="rounded border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:border-stone-500"
        >
          reload view
        </button>
      </div>
    );
  }
  return (
    <div
      role="alert"
      data-error-region={region}
      className="m-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
    >
      <p className="font-medium">this panel hit an error</p>
      {devMode && <p className="mt-1 break-words text-amber-700">{error.message}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-1 rounded border border-amber-400 px-1.5 py-0.5 text-amber-900 hover:border-amber-600"
      >
        retry
      </button>
    </div>
  );
}
