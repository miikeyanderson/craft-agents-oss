/**
 * BrowserTabStrip
 *
 * Rendered in the TopBar, shows compact badges for all active browser instances.
 * Each badge opens a shared action menu.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import * as Icons from 'lucide-react'
import { Spinner } from '@craft-agent/ui'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuSub,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSubTrigger,
  StyledDropdownMenuSubContent,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import {
  activeBrowserInstanceIdAtom,
  browserDisplayModeAtom,
  browserInstancesAtom,
  refreshBrowserDisplayModeAtom,
  toggleBrowserDisplayModeAtom,
  removeBrowserInstanceAtom,
} from '@/atoms/browser-pane'
import { BrowserTabBadge } from './BrowserTabBadge'
import type { BrowserInstanceInfo } from '../../../shared/types'
import { getHostname } from './utils'
import { navigate, routes } from '@/lib/navigate'

const DEFAULT_MAX_VISIBLE_BADGES = 3

interface BrowserTabStripProps {
  activeSessionId?: string | null
  instancesOverride?: BrowserInstanceInfo[]
  maxVisibleBadges?: number
  useNativeMenu?: boolean
  workspaceId?: string | null
  onOverlayOpenChange?: (open: boolean) => void
}

export function BrowserTabStrip({
  activeSessionId,
  instancesOverride,
  maxVisibleBadges = DEFAULT_MAX_VISIBLE_BADGES,
  useNativeMenu = false,
  workspaceId,
  onOverlayOpenChange,
}: BrowserTabStripProps) {
  const instances = useAtomValue(browserInstancesAtom)
  const removeInstance = useSetAtom(removeBrowserInstanceAtom)
  const browserDisplayMode = useAtomValue(browserDisplayModeAtom)
  const refreshBrowserDisplayMode = useSetAtom(refreshBrowserDisplayModeAtom)
  const toggleBrowserDisplayMode = useSetAtom(toggleBrowserDisplayModeAtom)
  const [activeInstanceId, setActiveInstanceId] = useAtom(activeBrowserInstanceIdAtom)
  const effectiveInstances = useMemo(() => {
    const scopedInstances = instancesOverride ?? instances
    if (!workspaceId) return scopedInstances
    return scopedInstances.filter((instance) => instance.workspaceId === workspaceId)
  }, [instances, instancesOverride, workspaceId])
  const instancesRef = useRef(effectiveInstances)

  const orderedInstances = useMemo(() => {
    const items = [...effectiveInstances]

    // Global list: keep all browser windows visible.
    // Optional ordering preference: session-local windows first.
    if (activeSessionId) {
      items.sort((a, b) => {
        const aInActiveSession = a.boundSessionId === activeSessionId ? 0 : 1
        const bInActiveSession = b.boundSessionId === activeSessionId ? 0 : 1
        if (aInActiveSession !== bInActiveSession) return aInActiveSession - bInActiveSession
        return a.id.localeCompare(b.id)
      })
    } else {
      items.sort((a, b) => a.id.localeCompare(b.id))
    }

    return items
  }, [effectiveInstances, activeSessionId])

  useEffect(() => {
    instancesRef.current = effectiveInstances
  }, [effectiveInstances])

  useEffect(() => {
    if (orderedInstances.length === 0) {
      setActiveInstanceId(null)
      return
    }
    if (!activeInstanceId || !orderedInstances.some((item) => item.id === activeInstanceId)) {
      setActiveInstanceId(orderedInstances[0].id)
    }
  }, [orderedInstances, activeInstanceId, setActiveInstanceId])

  useEffect(() => {
    if (instancesOverride || !activeInstanceId) return
    void refreshBrowserDisplayMode(activeInstanceId)
  }, [instancesOverride, activeInstanceId, refreshBrowserDisplayMode])

  const focusBrowserWindow = useCallback((instance: BrowserInstanceInfo) => {
    setActiveInstanceId(instance.id)
    if (instancesOverride) return

    const browserPaneApi = window.electronAPI?.browserPane
    if (!browserPaneApi) {
      console.warn('[BrowserTabStrip] browserPane API unavailable for focus action')
      return
    }

    if (browserDisplayMode === 'inline') {
      void browserPaneApi.attachToWindow(instance.id).catch((error) => {
        console.warn(`[BrowserTabStrip] Failed to dock browser window ${instance.id}:`, error)
      })
      return
    }

    void browserPaneApi.focus(instance.id).catch((error) => {
      console.warn(`[BrowserTabStrip] Failed to focus browser window ${instance.id}:`, error)
    })
  }, [browserDisplayMode, instancesOverride, setActiveInstanceId])

  const openSessionUsingWindow = useCallback((instance: BrowserInstanceInfo) => {
    const sessionId = instance.boundSessionId ?? instance.ownerSessionId
    if (!sessionId) return
    navigate(routes.view.allSessions(sessionId))
  }, [])

  const terminateBrowserWindow = useCallback((instance: BrowserInstanceInfo) => {
    if (!instancesOverride) {
      const browserPaneApi = window.electronAPI?.browserPane
      if (!browserPaneApi) {
        console.warn('[BrowserTabStrip] browserPane API unavailable for terminate action')
      } else {
        void browserPaneApi.destroy(instance.id).catch((error) => {
          console.warn(`[BrowserTabStrip] Failed to terminate browser window ${instance.id}:`, error)
        })
      }
      removeInstance(instance.id)
    }

    setActiveInstanceId((prev) => {
      if (prev !== instance.id) return prev
      const remaining = instancesRef.current.filter((item) => item.id !== instance.id)
      return remaining[0]?.id ?? null
    })
  }, [instancesOverride, removeInstance, setActiveInstanceId])

  const handleToggleDisplayMode = useCallback(() => {
    void toggleBrowserDisplayMode()
  }, [toggleBrowserDisplayMode])

  const handleNativeMenuAction = useCallback(async (instance: BrowserInstanceInfo) => {
    const browserPaneApi = window.electronAPI?.browserPane
    if (!browserPaneApi?.showContextMenu) {
      console.warn('[BrowserTabStrip] browserPane API unavailable for native context menu')
      return
    }

    let selectedAction: string | null = null
    try {
      selectedAction = await browserPaneApi.showContextMenu(instance.id, [
        { id: 'show-window', label: 'Show Browser Window' },
        { id: 'open-session', label: 'Open Session Which Used this Window', enabled: !!instance.boundSessionId },
        { type: 'separator' },
        { id: 'terminate', label: 'Terminate Browser', destructive: true },
      ])
    } catch (error) {
      console.warn(`[BrowserTabStrip] Failed to show native context menu for ${instance.id}:`, error)
      return
    }

    switch (selectedAction) {
      case 'show-window':
        focusBrowserWindow(instance)
        break
      case 'open-session':
        openSessionUsingWindow(instance)
        break
      case 'terminate':
        terminateBrowserWindow(instance)
        break
      default:
        break
    }
  }, [focusBrowserWindow, openSessionUsingWindow, terminateBrowserWindow])

  const renderBrowserActions = useCallback((instance: BrowserInstanceInfo) => {
    const canUseLiveWindowActions = !instancesOverride
    const targetSessionId = instance.boundSessionId ?? instance.ownerSessionId
    const canOpenSession = !!targetSessionId
    const openSessionLabel = instance.agentControlActive
      ? 'Open Session Using this Window'
      : 'Open Session Which Used this Window'

    return (
      <>
        <StyledDropdownMenuItem
          disabled={!canUseLiveWindowActions}
          onSelect={() => focusBrowserWindow(instance)}
        >
          <Icons.Monitor className="h-3.5 w-3.5" />
          Show Browser Window
        </StyledDropdownMenuItem>

        <StyledDropdownMenuItem
          disabled={!canOpenSession}
          onSelect={() => openSessionUsingWindow(instance)}
        >
          <Icons.PanelRightOpen className="h-3.5 w-3.5" />
          {openSessionLabel}
        </StyledDropdownMenuItem>

        <StyledDropdownMenuSeparator />

        <StyledDropdownMenuItem
          variant="destructive"
          disabled={!canUseLiveWindowActions}
          onSelect={() => terminateBrowserWindow(instance)}
        >
          <Icons.XCircle className="h-3.5 w-3.5" />
          Terminate Browser
        </StyledDropdownMenuItem>
      </>
    )
  }, [instancesOverride, focusBrowserWindow, openSessionUsingWindow, terminateBrowserWindow])

  if (orderedInstances.length === 0 && browserDisplayMode !== 'inline') return null

  const visibleBadgeCount = Math.max(1, maxVisibleBadges)
  const visible = orderedInstances.slice(0, visibleBadgeCount)
  const overflow = orderedInstances.slice(visibleBadgeCount)

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handleToggleDisplayMode}
        className="h-[26px] w-[26px] shrink-0 rounded-lg bg-background text-foreground/65 shadow-minimal transition-colors hover:bg-foreground/[0.03] hover:text-foreground titlebar-no-drag"
        aria-label={browserDisplayMode === 'inline' ? 'Open browser in popup window' : 'Dock browser inline'}
        title={browserDisplayMode === 'inline' ? 'Open browser in popup window' : 'Dock browser inline'}
      >
        {browserDisplayMode === 'inline' ? (
          <Icons.ExternalLink className="mx-auto h-3.5 w-3.5" />
        ) : (
          <Icons.PanelRightOpen className="mx-auto h-3.5 w-3.5" />
        )}
      </button>

      {visible.map((instance) => (
        useNativeMenu ? (
          <BrowserTabBadge
            key={instance.id}
            instance={instance}
            isActive={instance.id === activeInstanceId}
            onClose={() => terminateBrowserWindow(instance)}
            onClick={() => { void handleNativeMenuAction(instance) }}
          />
        ) : (
          <DropdownMenu key={instance.id} onOpenChange={onOverlayOpenChange}>
            <DropdownMenuTrigger asChild>
              <BrowserTabBadge
                instance={instance}
                isActive={instance.id === activeInstanceId}
              />
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="start" side="left" sideOffset={8} minWidth="min-w-56">
              {renderBrowserActions(instance)}
            </StyledDropdownMenuContent>
          </DropdownMenu>
        )
      ))}

      {overflow.length > 0 && (
        <DropdownMenu onOpenChange={onOverlayOpenChange}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-[26px] px-1.5 rounded-lg text-[11px] text-foreground/50 bg-background shadow-minimal hover:bg-foreground/[0.03] transition-colors cursor-pointer titlebar-no-drag"
            >
              +{overflow.length}
            </button>
          </DropdownMenuTrigger>
          <StyledDropdownMenuContent align="start" side="left" sideOffset={8} minWidth="min-w-64">
            {overflow.map((instance) => {
              const hostname = getHostname(instance.url)
              const displayLabel = instance.title.trim() || hostname || 'Local File'
              return (
                <DropdownMenuSub key={instance.id}>
                  <StyledDropdownMenuSubTrigger>
                    {instance.isLoading ? (
                      <Spinner className="text-[10px]" />
                    ) : (
                      <Icons.Globe className="h-3.5 w-3.5" />
                    )}
                    <span className="truncate">{displayLabel}</span>
                  </StyledDropdownMenuSubTrigger>
                  <StyledDropdownMenuSubContent minWidth="min-w-56">
                    {renderBrowserActions(instance)}
                  </StyledDropdownMenuSubContent>
                </DropdownMenuSub>
              )
            })}
          </StyledDropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
