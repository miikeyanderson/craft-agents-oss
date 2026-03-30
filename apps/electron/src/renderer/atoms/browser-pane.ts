/**
 * Browser Pane Atoms
 *
 * Jotai atoms for browser instance state in the renderer.
 * Synced from the main process via BROWSER_PANE_STATE_CHANGED IPC events.
 */

import { atom } from 'jotai'
import type { BrowserInstanceInfo } from '../../shared/types'

type BrowserDisplayMode = 'popup' | 'inline'
type BrowserInlineBounds = { x: number; y: number; width: number; height: number }

/** Map of all browser instances by ID */
export const browserInstancesMapAtom = atom<Map<string, BrowserInstanceInfo>>(new Map())

/** Derived: array of all browser instances (for iteration) */
export const browserInstancesAtom = atom<BrowserInstanceInfo[]>(
  (get) => Array.from(get(browserInstancesMapAtom).values())
)

/** Derived: count of active browser instances */
export const browserInstanceCountAtom = atom<number>(
  (get) => get(browserInstancesMapAtom).size
)

/** Currently active browser instance ID (selected/focused by user interactions) */
export const activeBrowserInstanceIdAtom = atom<string | null>(null)

/** Tombstones for instances removed from renderer state (guards against late out-of-order updates) */
export const removedBrowserInstanceIdsAtom = atom<Set<string>>(new Set<string>())

/** Tracks whether the browser pane is docked inline or shown as a popup window */
export const browserDisplayModeAtom = atom<BrowserDisplayMode>('inline')

/** Tracks the current pixel bounds for the inline browser panel area */
export const browserInlineBoundsAtom = atom<BrowserInlineBounds | null>(null)

/** Derived: currently active browser instance info */
export const activeBrowserInstanceAtom = atom<BrowserInstanceInfo | null>((get) => {
  const activeId = get(activeBrowserInstanceIdAtom)
  if (!activeId) return null
  return get(browserInstancesMapAtom).get(activeId) ?? null
})

browserDisplayModeAtom.onMount = (setAtom) => {
  const browserPaneApi = window.electronAPI?.browserPane
  if (!browserPaneApi) return

  let isMounted = true
  void browserPaneApi.getDisplayMode()
    .then((mode) => {
      if (isMounted) {
        setAtom(mode)
      }
    })
    .catch((error) => {
      console.warn('[browser-pane] Failed to get browser display mode:', error)
    })

  const cleanup = browserPaneApi.onDisplayModeChanged((payload) => {
    if (isMounted) {
      // Accept both legacy string and new scoped payload format
      const mode = typeof payload === 'string' ? payload : payload.mode
      setAtom(mode)
    }
  })

  return () => {
    isMounted = false
    cleanup()
  }
}

export const refreshBrowserDisplayModeAtom = atom(
  null,
  async (_get, set, id?: string) => {
    const browserPaneApi = window.electronAPI?.browserPane
    if (!browserPaneApi) return

    try {
      set(browserDisplayModeAtom, await browserPaneApi.getDisplayMode(id))
    } catch (error) {
      console.warn('[browser-pane] Failed to refresh browser display mode:', error)
    }
  }
)

/** Update a single browser instance (from IPC state change event) */
export const updateBrowserInstanceAtom = atom(
  null,
  (get, set, info: BrowserInstanceInfo) => {
    const removedIds = get(removedBrowserInstanceIdsAtom)
    if (removedIds.has(info.id)) {
      return
    }

    const map = new Map(get(browserInstancesMapAtom))
    map.set(info.id, info)
    set(browserInstancesMapAtom, map)
  }
)

/** Remove a browser instance (when destroyed) */
export const removeBrowserInstanceAtom = atom(
  null,
  (get, set, id: string) => {
    const map = new Map(get(browserInstancesMapAtom))
    map.delete(id)
    set(browserInstancesMapAtom, map)

    const removedIds = new Set(get(removedBrowserInstanceIdsAtom))
    removedIds.add(id)
    set(removedBrowserInstanceIdsAtom, removedIds)
  }
)

/** Set all browser instances at once (from list query) */
export const setBrowserInstancesAtom = atom(
  null,
  (get, set, instances: BrowserInstanceInfo[]) => {
    const map = new Map<string, BrowserInstanceInfo>()
    for (const info of instances) {
      map.set(info.id, info)
    }
    set(browserInstancesMapAtom, map)

    const removedIds = new Set(get(removedBrowserInstanceIdsAtom))
    for (const info of instances) {
      removedIds.delete(info.id)
    }
    set(removedBrowserInstanceIdsAtom, removedIds)
  }
)

/** Toggle the browser pane between popup and inline display modes */
export const toggleBrowserDisplayModeAtom = atom(
  null,
  async (get, set) => {
    const browserPaneApi = window.electronAPI?.browserPane
    if (!browserPaneApi) return

    const activeId = get(activeBrowserInstanceIdAtom) ?? undefined
    const currentMode = get(browserDisplayModeAtom)
    if (currentMode === 'popup') {
      await browserPaneApi.attachToWindow(activeId)
      set(browserDisplayModeAtom, 'inline')
      return
    }

    await browserPaneApi.detachFromWindow(activeId)
    set(browserDisplayModeAtom, 'popup')
  }
)

/** Push inline panel bounds to main and mirror them locally */
export const syncBrowserInlineBoundsAtom = atom(
  null,
  async (get, set, bounds: BrowserInlineBounds) => {
    const browserPaneApi = window.electronAPI?.browserPane
    if (!browserPaneApi) return

    const activeId = get(activeBrowserInstanceIdAtom) ?? undefined
    if (!activeId) return

    await browserPaneApi.setInlineBounds(bounds, activeId)
    set(browserInlineBoundsAtom, bounds)
  }
)
