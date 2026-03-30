import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import { activeBrowserInstanceIdAtom, browserDisplayModeAtom, browserInstanceCountAtom, syncBrowserInlineBoundsAtom } from '@/atoms/browser-pane'
import { PANEL_MIN_WIDTH } from '@/components/app-shell/panel-constants'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
} from '@/components/ui/styled-dropdown'
import { SquarePenRounded } from '@/components/icons/SquarePenRounded'
import { BrowserTabStrip } from './BrowserTabStrip'

interface InlineBrowserPanelProps {
  className?: string
  style?: CSSProperties
  workspaceId?: string | null
  onAddSessionPanel?: () => void
  onAddBrowserPanel?: () => void
}

export function InlineBrowserPanel({ className, style, workspaceId, onAddSessionPanel, onAddBrowserPanel }: InlineBrowserPanelProps) {
  const browserDisplayMode = useAtomValue(browserDisplayModeAtom)
  const browserInstanceCount = useAtomValue(browserInstanceCountAtom)
  const activeBrowserInstanceId = useAtomValue(activeBrowserInstanceIdAtom)
  const syncBrowserInlineBounds = useSetAtom(syncBrowserInlineBoundsAtom)
  const placeholderRef = useRef<HTMLDivElement>(null)
  const hasInlineBrowser = browserDisplayMode === 'inline' && browserInstanceCount > 0

  const syncPlaceholderBounds = useCallback(() => {
    const rect = placeholderRef.current?.getBoundingClientRect()
    if (!rect) return

    // Fill edge-to-edge — the panel's rounded border visually frames the content.
    void syncBrowserInlineBounds({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
  }, [syncBrowserInlineBounds])

  const handleOverlayOpenChange = useCallback((_open: boolean) => {}, [])

  useEffect(() => {
    if (!hasInlineBrowser) return

    const element = placeholderRef.current
    if (!element) return

    let frame = 0

    const scheduleSync = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        syncPlaceholderBounds()
      })
    }

    scheduleSync()

    const observer = new ResizeObserver(scheduleSync)
    observer.observe(element)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [hasInlineBrowser, syncPlaceholderBounds])

  // Re-sync native BrowserView bounds immediately when the panel width changes (during drag resize)
  // or when the active browser instance changes (tab switch needs valid bounds for attachToWindow)
  // ResizeObserver alone can lag behind rapid style changes
  useEffect(() => {
    if (!hasInlineBrowser) return
    syncPlaceholderBounds()
  }, [hasInlineBrowser, style?.width, activeBrowserInstanceId, syncPlaceholderBounds])

  if (!hasInlineBrowser) {
    return null
  }

  return (
    <div
      className={cn(
        'h-full flex flex-col min-w-0 overflow-hidden rounded-xl border border-border/50 bg-background',
        className,
      )}
      style={{
        minWidth: PANEL_MIN_WIDTH,
        ...style,
      }}
    >
      <div className="shrink-0 border-b border-border/50 bg-background px-2 py-1.5 flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <BrowserTabStrip maxVisibleBadges={6} workspaceId={workspaceId} useNativeMenu onOverlayOpenChange={handleOverlayOpenChange} />
        </div>
        {(onAddSessionPanel || onAddBrowserPanel) && (
          <DropdownMenu onOpenChange={handleOverlayOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-[26px] w-[26px] shrink-0 rounded-lg bg-background text-foreground/65 shadow-minimal transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
                aria-label="Add panel menu"
              >
                <Icons.Plus className="mx-auto h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <StyledDropdownMenuContent align="end" side="top" minWidth="min-w-56">
              {onAddSessionPanel && (
                <StyledDropdownMenuItem onSelect={onAddSessionPanel}>
                  <SquarePenRounded className="h-3.5 w-3.5" />
                  New Session in Panel
                </StyledDropdownMenuItem>
              )}
              {onAddBrowserPanel && (
                <StyledDropdownMenuItem onSelect={onAddBrowserPanel}>
                  <Icons.Globe className="h-3.5 w-3.5" />
                  New Browser Window
                </StyledDropdownMenuItem>
              )}
            </StyledDropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div
        ref={placeholderRef}
        className="flex-1 min-w-0 min-h-0 overflow-hidden"
      />
    </div>
  )
}
