// React boundaries contain unexpected render failures. The app boundary keeps
// a failure from leaving a blank page, while region boundaries preserve their
// sibling surfaces. Diagnostic detail is retained only in structured logs.

import { Component, type ErrorInfo, type ReactNode } from "react";

import { useLocalizedMessage } from "../localization/LocalizationProvider";
import type { MessageDescriptor } from "../localization/message";
import { logger } from "../logger/logger";

const boundaryLog = logger.child("boundary");

export const ERROR_BOUNDARY_MESSAGES = {
  appAction: { key: "common:actions.reloadPage" },
  appMessage: { key: "errors:unexpectedApplication.message" },
  appTitle: { key: "errors:unexpectedApplication.title" },
  regionAction: { key: "common:actions.retry" },
  regionMessage: { key: "errors:unexpectedSection.message" },
  regionTitle: { key: "errors:unexpectedSection.title" },
} as const satisfies Record<string, MessageDescriptor>;

export interface FallbackRenderProps {
  error: Error;
  region: string;
  variant: "app" | "region";
  reset: () => void;
}

export interface ErrorBoundaryProps {
  /** Identifies the contained region in diagnostic logs. */
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
 * that keeps its sibling regions alive and offers a retry. Raw diagnostics are
 * never part of the default fallback in any build; the boundary retains them
 * only for structured logging and the explicit custom-fallback contract.
 */
export function DefaultFallback({ variant, reset }: FallbackRenderProps): ReactNode {
  const appTitle = useLocalizedMessage(ERROR_BOUNDARY_MESSAGES.appTitle);
  const appMessage = useLocalizedMessage(ERROR_BOUNDARY_MESSAGES.appMessage);
  const appAction = useLocalizedMessage(ERROR_BOUNDARY_MESSAGES.appAction);
  const regionTitle = useLocalizedMessage(ERROR_BOUNDARY_MESSAGES.regionTitle);
  const regionMessage = useLocalizedMessage(ERROR_BOUNDARY_MESSAGES.regionMessage);
  const regionAction = useLocalizedMessage(ERROR_BOUNDARY_MESSAGES.regionAction);

  if (variant === "app") {
    return (
      <div
        role="alert"
        className="flex h-screen flex-col items-center justify-center gap-3 bg-stone-50 p-6 text-center text-stone-800"
      >
        <p className="text-sm font-medium">{appTitle}</p>
        <p className="max-w-md text-xs text-stone-500">{appMessage}</p>
        <button
          type="button"
          onClick={() => globalThis.location.reload()}
          className="rounded border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:border-stone-500"
        >
          {appAction}
        </button>
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="m-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
    >
      <p className="font-medium">{regionTitle}</p>
      <p className="mt-1 text-amber-700">{regionMessage}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-1 rounded border border-amber-400 px-1.5 py-0.5 text-amber-900 hover:border-amber-600"
      >
        {regionAction}
      </button>
    </div>
  );
}
