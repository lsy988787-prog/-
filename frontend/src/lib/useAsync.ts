import { useEffect, useState } from 'react'

export type AsyncState<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; data: T }

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    fn().then(
      (data) => alive && setState({ status: 'ok', data }),
      (e: Error) => alive && setState({ status: 'error', error: e.message }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
