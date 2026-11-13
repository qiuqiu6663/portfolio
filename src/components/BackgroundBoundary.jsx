import { Component } from 'react'

// A failed decorative chunk must leave its poster and the portfolio usable.
export default class BackgroundBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError?.() }
  render() { return this.state.failed ? null : this.props.children }
}
