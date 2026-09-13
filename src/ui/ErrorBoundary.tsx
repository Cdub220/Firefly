/**
 * A render bug shows a message and a retry button, not a white page. Wrap each view and
 * each 3D canvas; the store and the other views keep working.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { label: string; children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}] render failed`, error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fx-crash" role="alert">
        <strong>{this.props.label} failed to render.</strong>
        <pre>{error.message}</pre>
        <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
