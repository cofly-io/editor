import type { ErrorInfo, ReactNode } from 'react'
import { Component } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
  /** Tag for log lines so we can tell which boundary swallowed an error. */
  scope?: string
  onError?: (error: Error) => void
  resetKey?: unknown
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[viewer] ErrorBoundary caught${this.props.scope ? ` (${this.props.scope})` : ''}:`,
      error,
      info.componentStack,
    )
    this.props.onError?.(error)
  }
  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
