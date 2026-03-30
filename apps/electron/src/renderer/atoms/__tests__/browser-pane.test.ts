import { describe, expect, it } from 'bun:test'
import { createStore } from 'jotai'
import type { BrowserInstanceInfo, ElectronAPI } from '../../../shared/types'
import {
  activeBrowserInstanceIdAtom,
  browserDisplayModeAtom,
  browserInlineBoundsAtom,
  browserInstancesAtom,
  removeBrowserInstanceAtom,
  setBrowserInstancesAtom,
  syncBrowserInlineBoundsAtom,
  toggleBrowserDisplayModeAtom,
  updateBrowserInstanceAtom,
} from '../browser-pane'

function makeInstance(id: string): BrowserInstanceInfo {
  return {
    id,
    workspaceId: 'workspace-1',
    url: 'https://example.com',
    title: 'Example',
    favicon: null,
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    boundSessionId: null,
    ownerType: 'manual',
    ownerSessionId: null,
    isVisible: true,
    agentControlActive: false,
    themeColor: null,
  }
}

describe('browser pane atoms', () => {
  it('does not resurrect removed instance from stale update event', () => {
    const store = createStore()

    store.set(updateBrowserInstanceAtom, makeInstance('browser-1'))
    expect(store.get(browserInstancesAtom).map((i) => i.id)).toEqual(['browser-1'])

    store.set(removeBrowserInstanceAtom, 'browser-1')
    expect(store.get(browserInstancesAtom)).toHaveLength(0)

    // Simulate late out-of-order state event arriving after removal
    store.set(updateBrowserInstanceAtom, makeInstance('browser-1'))

    expect(store.get(browserInstancesAtom)).toHaveLength(0)
  })

  it('authoritative list refresh can restore an instance after prior remove', () => {
    const store = createStore()

    store.set(removeBrowserInstanceAtom, 'browser-2')
    expect(store.get(browserInstancesAtom)).toHaveLength(0)

    // Simulate full list() reconciliation from main process
    store.set(setBrowserInstancesAtom, [makeInstance('browser-2')])

    expect(store.get(browserInstancesAtom).map((i) => i.id)).toEqual(['browser-2'])
  })

  it('syncs display mode from electron API on mount and subscription updates', async () => {
    const store = createStore()
    const cleanupListener = () => {}
    let onDisplayModeChanged: (payload: { mode: 'popup' | 'inline'; workspaceId?: string }) => void = () => {}

    globalThis.window = {
      electronAPI: {
        browserPane: {
          getDisplayMode: async () => 'inline',
          onDisplayModeChanged: (callback) => {
            onDisplayModeChanged = callback
            return cleanupListener
          },
        },
      },
    } as Window & typeof globalThis & { electronAPI: Pick<ElectronAPI, 'browserPane'> }

    const unsubscribe = store.sub(browserDisplayModeAtom, () => {})

    await Promise.resolve()
    expect(store.get(browserDisplayModeAtom)).toBe('inline')

    onDisplayModeChanged({ mode: 'popup' })
    expect(store.get(browserDisplayModeAtom)).toBe('popup')

    unsubscribe()
  })

  it('toggles browser display mode through the electron API', async () => {
    const store = createStore()
    let attachCalls = 0
    let detachCalls = 0
    let attachId: string | undefined
    let detachId: string | undefined

    globalThis.window = {
      electronAPI: {
        browserPane: {
          attachToWindow: async (id) => {
            attachCalls += 1
            attachId = id
          },
          detachFromWindow: async (id) => {
            detachCalls += 1
            detachId = id
          },
        },
      },
    } as Window & typeof globalThis & { electronAPI: Pick<ElectronAPI, 'browserPane'> }

    store.set(activeBrowserInstanceIdAtom, 'browser-1')
    store.set(browserDisplayModeAtom, 'popup')
    await store.set(toggleBrowserDisplayModeAtom)
    expect(attachCalls).toBe(1)
    expect(attachId).toBe('browser-1')
    expect(store.get(browserDisplayModeAtom)).toBe('inline')

    await store.set(toggleBrowserDisplayModeAtom)
    expect(detachCalls).toBe(1)
    expect(detachId).toBe('browser-1')
    expect(store.get(browserDisplayModeAtom)).toBe('popup')
  })

  it('syncs inline bounds to electron and local state', async () => {
    const store = createStore()
    const calls: Array<{ bounds: { x: number; y: number; width: number; height: number }; id: string | undefined }> = []
    const bounds = { x: 12, y: 24, width: 640, height: 480 }

    globalThis.window = {
      electronAPI: {
        browserPane: {
          setInlineBounds: async (nextBounds, id) => { calls.push({ bounds: nextBounds, id }) },
        },
      },
    } as Window & typeof globalThis & { electronAPI: Pick<ElectronAPI, 'browserPane'> }

    store.set(activeBrowserInstanceIdAtom, 'browser-1')
    await store.set(syncBrowserInlineBoundsAtom, bounds)

    expect(calls).toEqual([{ bounds, id: 'browser-1' }])
    expect(store.get(browserInlineBoundsAtom)).toEqual(bounds)
  })

  it('passes renderer overlay activation through the browser pane API', async () => {
    let activeCall: { active: boolean; id: string | undefined } | undefined

    globalThis.window = {
      electronAPI: {
        browserPane: {
          setRendererOverlayActive: async (active, id) => {
            activeCall = { active, id }
          },
        },
      },
    } as Window & typeof globalThis & { electronAPI: Pick<ElectronAPI, 'browserPane'> }

    await window.electronAPI.browserPane.setRendererOverlayActive(true, 'browser-2')

    expect(activeCall).toEqual({ active: true, id: 'browser-2' })
  })
})
