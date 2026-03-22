/**
 * PanelStackContainer
 *
 * Horizontal layout container for ALL panels:
 * Sidebar → Navigator → Content Panel(s) with resize sashes, plus an optional
 * fixed-width inline browser panel at the far right.
 *
 * Content panels use CSS flex-grow with their proportions as weights:
 * - Each panel gets `flex: <proportion> 1 0px` with `min-width: PANEL_MIN_WIDTH`
 * - Flex distributes available space proportionally — panels fill the viewport
 * - When panels hit min-width, overflow-x: auto kicks in naturally
 *
 * Sidebar and Navigator are NOT part of the proportional layout —
 * they have their own fixed/user-resizable widths managed by AppShell.
 * They just reduce the available width for content panels and scroll with everything else.
 *
 * The right sidebar stays OUTSIDE this container.
 */

import { useRef, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'
import { panelStackAtom, focusedPanelIdAtom } from '@/atoms/panel-stack'
import { browserDisplayModeAtom, browserInstanceCountAtom } from '@/atoms/browser-pane'
import { InlineBrowserPanel } from '@/components/browser/InlineBrowserPanel'
import { PanelSlot } from './PanelSlot'
import { PanelResizeSash } from './PanelResizeSash'
import {
  PANEL_GAP,
  PANEL_EDGE_INSET,
  PANEL_MIN_WIDTH,
  PANEL_STACK_VERTICAL_OVERFLOW,
  RADIUS_EDGE,
  RADIUS_INNER,
} from './panel-constants'

/** Spring transition matching AppShell's sidebar/navigator animation */
const PANEL_SPRING = { type: 'spring' as const, stiffness: 600, damping: 49 }

interface PanelStackContainerProps {
  sidebarSlot: React.ReactNode
  sidebarWidth: number
  navigatorSlot: React.ReactNode
  navigatorWidth: number
  isSidebarAndNavigatorHidden: boolean
  isRightSidebarVisible?: boolean
  isResizing?: boolean
  activeWorkspaceId?: string | null
  onAddSessionPanel?: () => void
  onAddBrowserPanel?: () => void
  browserInlineWidth?: number
}

export function PanelStackContainer({
  sidebarSlot,
  sidebarWidth,
  navigatorSlot,
  navigatorWidth,
  isSidebarAndNavigatorHidden,
  isRightSidebarVisible,
  isResizing,
  activeWorkspaceId,
  onAddSessionPanel,
  onAddBrowserPanel,
  browserInlineWidth = 0,
}: PanelStackContainerProps) {
  const panelStack = useAtomValue(panelStackAtom)
  const focusedPanelId = useAtomValue(focusedPanelIdAtom)
  const browserDisplayMode = useAtomValue(browserDisplayModeAtom)
  const browserInstanceCount = useAtomValue(browserInstanceCountAtom)

  const contentPanels = panelStack
  const isBrowserInline = browserDisplayMode === 'inline' && browserInstanceCount > 0

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(contentPanels.length)

  const hasSidebar = sidebarWidth > 0
  const hasNavigator = navigatorWidth > 0
  const isMultiPanel = contentPanels.length > 1
  const isLeftEdge = !hasSidebar && !hasNavigator

  // Auto-scroll to newly pushed content panel
  useEffect(() => {
    if (contentPanels.length > prevCountRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          left: scrollRef.current.scrollWidth,
          behavior: 'smooth',
        })
      })
    }
    prevCountRef.current = contentPanels.length
  }, [contentPanels.length])

  const transition = isResizing ? { duration: 0 } : PANEL_SPRING

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-w-0 flex relative z-panel panel-scroll"
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        // Extra vertical space for box-shadows (collapsed back with negative margin)
        paddingBlock: PANEL_STACK_VERTICAL_OVERFLOW,
        marginBlock: -PANEL_STACK_VERTICAL_OVERFLOW,
        // Extend to window bottom so scrollbar sits at the very edge
        marginBottom: -6,
        paddingBottom: 6,
        // Extra horizontal space for last panel's box-shadow
        paddingRight: 8,
        marginRight: -8,
      }}
    >
      {/* Inner flex container — flex-grow: 1 fills viewport, content can overflow for scroll.
           Animated paddingLeft provides window-edge spacing when sidebar/navigator are hidden.
           Hidden slots use marginRight: -PANEL_GAP to cancel their trailing flex gap. */}
      <motion.div
        className="flex h-full"
        initial={false}
        animate={{ paddingLeft: !hasSidebar ? PANEL_EDGE_INSET : 0 }}
        transition={transition}
        style={{ gap: PANEL_GAP, flexGrow: 1, minWidth: 0 }}
      >
        {/* === SIDEBAR SLOT === */}
        <motion.div
          initial={false}
          animate={{
            width: hasSidebar ? sidebarWidth : 0,
            marginRight: hasSidebar ? 0 : -PANEL_GAP,
            opacity: hasSidebar ? 1 : 0,
          }}
          transition={transition}
          className="h-full relative shrink-0"
          style={{ overflowX: 'clip', overflowY: 'visible' }}
        >
          <div className="h-full" style={{ width: sidebarWidth }}>
            {sidebarSlot}
          </div>
        </motion.div>

        {/* === NAVIGATOR SLOT === */}
        <motion.div
          initial={false}
          animate={{
            width: hasNavigator ? navigatorWidth : 0,
            marginRight: hasNavigator ? 0 : -PANEL_GAP,
            opacity: hasNavigator ? 1 : 0,
          }}
          transition={transition}
          className={cn(
            'h-full overflow-hidden relative shrink-0 z-[2]',
            'bg-background shadow-middle',
          )}
          style={{
            borderTopLeftRadius: RADIUS_INNER,
            borderBottomLeftRadius: !hasSidebar ? RADIUS_EDGE : RADIUS_INNER,
            borderTopRightRadius: RADIUS_INNER,
            borderBottomRightRadius: RADIUS_INNER,
          }}
        >
          <div className="h-full" style={{ width: navigatorWidth }}>
            {navigatorSlot}
          </div>
        </motion.div>

        {/* === CONTENT PANELS WITH SASHES === */}
        {contentPanels.length === 0 ? (
          isBrowserInline ? (
            <InlineBrowserPanel
              workspaceId={activeWorkspaceId}
              onAddSessionPanel={onAddSessionPanel}
              onAddBrowserPanel={onAddBrowserPanel}
              className="shadow-middle"
              style={{
                width: browserInlineWidth,
                flexShrink: 0,
                minWidth: PANEL_MIN_WIDTH,
                borderTopLeftRadius: RADIUS_INNER,
                borderBottomLeftRadius: !hasNavigator ? RADIUS_EDGE : RADIUS_INNER,
                borderTopRightRadius: RADIUS_INNER,
                borderBottomRightRadius: !isRightSidebarVisible ? RADIUS_EDGE : RADIUS_INNER,
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center" />
          )
        ) : (
          contentPanels.map((entry, index) => (
            <PanelSlot
              key={entry.id}
              entry={entry}
              isOnly={contentPanels.length === 1}
              isFocusedPanel={isMultiPanel ? entry.id === focusedPanelId : true}
              isSidebarAndNavigatorHidden={isSidebarAndNavigatorHidden}
              isAtLeftEdge={index === 0 && isLeftEdge}
              isAtRightEdge={index === contentPanels.length - 1 && !isRightSidebarVisible && !isBrowserInline}
              proportion={entry.proportion}
              sash={index > 0 ? (
                <PanelResizeSash
                  leftIndex={index - 1}
                  rightIndex={index}
                />
              ) : undefined}
            />
          )).concat(
            isBrowserInline ? [
              <InlineBrowserPanel
                key="inline-browser-panel"
                workspaceId={activeWorkspaceId}
                onAddSessionPanel={onAddSessionPanel}
                onAddBrowserPanel={onAddBrowserPanel}
                className="shadow-middle"
                style={{
                  width: browserInlineWidth,
                  flexShrink: 0,
                  minWidth: PANEL_MIN_WIDTH,
                  borderTopLeftRadius: RADIUS_INNER,
                  borderBottomLeftRadius: RADIUS_INNER,
                  borderTopRightRadius: RADIUS_INNER,
                  borderBottomRightRadius: !isRightSidebarVisible ? RADIUS_EDGE : RADIUS_INNER,
                }}
              />,
            ] : []
          )
        )}
      </motion.div>
    </div>
  )
}
