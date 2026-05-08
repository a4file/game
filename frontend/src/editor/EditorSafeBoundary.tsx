import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  title?: string;
};

type State = {
  err: Error | null;
};

export class EditorSafeBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error("[EditorSafeBoundary]", err.message, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.err !== null) {
      return (
        <div className="editor-boundary-error">
          <strong>{this.props.title ?? "에디터"} 오류</strong>
          <pre>{this.state.err.message}</pre>
          <p className="editor-boundary-hint">브라우저 개발자 도구(F12) 콘솔에서 상세 로그를 확인하세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
