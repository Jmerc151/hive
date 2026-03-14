import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Component error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-hive-100 mb-2">Something went wrong</h2>
          <p className="text-hive-400 mb-4 max-w-md">{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-honey/20 text-honey rounded-lg hover:bg-honey/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
