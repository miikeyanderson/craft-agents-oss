import { Menu } from 'electron'
import {
  RPC_CHANNELS,
  type BrowserContextMenuItemDescriptor,
  type BrowserPaneCreateOptions,
  type BrowserEmptyStateLaunchPayload,
} from '../../shared/types'
import type { BrowserScreenshotOptions } from '../browser-pane-manager'
import { pushTyped, type RpcServer } from '@craft-agent/server-core/transport'
import type { RequestContext } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from './handler-deps'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.browserPane.CREATE,
  RPC_CHANNELS.browserPane.DESTROY,
  RPC_CHANNELS.browserPane.LIST,
  RPC_CHANNELS.browserPane.UPDATE_THEME,
  RPC_CHANNELS.browserPane.SHOW_CONTEXT_MENU,
  RPC_CHANNELS.browserPane.ATTACH_TO_WINDOW,
  RPC_CHANNELS.browserPane.DETACH_FROM_WINDOW,
  RPC_CHANNELS.browserPane.SET_INLINE_BOUNDS,
  RPC_CHANNELS.browserPane.SET_RENDERER_OVERLAY_ACTIVE,
  RPC_CHANNELS.browserPane.GET_DISPLAY_MODE,
  RPC_CHANNELS.browserPane.NAVIGATE,
  RPC_CHANNELS.browserPane.GO_BACK,
  RPC_CHANNELS.browserPane.GO_FORWARD,
  RPC_CHANNELS.browserPane.RELOAD,
  RPC_CHANNELS.browserPane.STOP,
  RPC_CHANNELS.browserPane.FOCUS,
  RPC_CHANNELS.browserPane.LAUNCH,
  RPC_CHANNELS.browserPane.SNAPSHOT,
  RPC_CHANNELS.browserPane.CLICK,
  RPC_CHANNELS.browserPane.FILL,
  RPC_CHANNELS.browserPane.SELECT,
  RPC_CHANNELS.browserPane.SCREENSHOT,
  RPC_CHANNELS.browserPane.EVALUATE,
  RPC_CHANNELS.browserPane.SCROLL,
] as const

export function registerBrowserHandlers(server: RpcServer, deps: HandlerDeps): void {
  const { browserPaneManager, platform, windowManager } = deps
  if (!browserPaneManager) return

  const resolveWorkspaceId = (ctx: RequestContext): string | null => (
    ctx.workspaceId
    ?? (ctx.webContentsId != null ? windowManager?.getWorkspaceForWindow(ctx.webContentsId) ?? null : null)
  )

  const resolveInstanceId = (preferredId?: string, workspaceId?: string | null): string | null => {
    if (preferredId) {
      return preferredId
    }

    const instances = browserPaneManager.listInstances()
    const visibleInstances = workspaceId
      ? instances.filter((instance) => instance.workspaceId === workspaceId)
      : instances

    return visibleInstances.find((instance) => instance.isVisible)?.id
      ?? visibleInstances[0]?.id
      ?? null
  }

  server.handle(RPC_CHANNELS.browserPane.CREATE, (ctx, input?: string | BrowserPaneCreateOptions) => {
    const workspaceId = resolveWorkspaceId(ctx)

    if (typeof input === 'string') {
      return browserPaneManager.createInstance(input, { workspaceId })
    }

    if (input?.bindToSessionId) {
      return browserPaneManager.createForSession(input.bindToSessionId, {
        show: input.show ?? false,
        workspaceId,
      })
    }

    return browserPaneManager.createInstance(input?.id, {
      show: input?.show,
      workspaceId,
    })
  })

  server.handle(RPC_CHANNELS.browserPane.DESTROY, (_ctx, id: string) => {
    browserPaneManager.destroyInstance(id)
  })

  server.handle(RPC_CHANNELS.browserPane.LIST, () => {
    return browserPaneManager.listInstances()
  })

  server.handle(RPC_CHANNELS.browserPane.UPDATE_THEME, async (_ctx, themeCSS: string, isDark: boolean, backgroundImage?: string | null) => {
    await browserPaneManager.injectThemeCSS(themeCSS, isDark, backgroundImage ?? null)
  })

  server.handle(
    RPC_CHANNELS.browserPane.SHOW_CONTEXT_MENU,
    async (ctx, instanceId: string, items: BrowserContextMenuItemDescriptor[]) => {
      const hostWindow = ctx.webContentsId != null
        ? windowManager?.getWindowByWebContentsId(ctx.webContentsId) ?? null
        : windowManager?.getFocusedWindow() ?? windowManager?.getLastActiveWindow() ?? null

      if (!hostWindow || hostWindow.isDestroyed()) {
        platform.logger.warn(`[browser-pane] show-context-menu missing host window for ${instanceId}`)
        return null
      }

      let resolveSelection: ((value: string | null) => void) | null = null
      let settled = false
      const finish = (value: string | null) => {
        if (settled) return
        settled = true
        resolveSelection?.(value)
      }

      const template = items.map((item): Electron.MenuItemConstructorOptions => {
        if (item.type === 'separator') {
          return { type: 'separator' }
        }

        const itemId = item.id
        return {
          type: 'normal',
          label: item.label ?? '',
          enabled: item.enabled ?? true,
          click: () => finish(itemId ?? null),
        }
      })

      const menu = Menu.buildFromTemplate(template)

      return await new Promise<string | null>((resolve) => {
        resolveSelection = resolve
        menu.popup({
          window: hostWindow,
          callback: () => finish(null),
        })
      })
    }
  )

  server.handle(RPC_CHANNELS.browserPane.ATTACH_TO_WINDOW, (ctx, id?: string) => {
    const resolvedId = resolveInstanceId(id, resolveWorkspaceId(ctx))
    if (!resolvedId) return
    browserPaneManager.attachToWindow(resolvedId, ctx.webContentsId ?? undefined)
  })

  server.handle(RPC_CHANNELS.browserPane.DETACH_FROM_WINDOW, (ctx, id?: string) => {
    const resolvedId = resolveInstanceId(id, resolveWorkspaceId(ctx))
    if (!resolvedId) return
    browserPaneManager.detachFromWindow(resolvedId)
  })

  server.handle(
    RPC_CHANNELS.browserPane.SET_INLINE_BOUNDS,
    (ctx, bounds: { x: number; y: number; width: number; height: number }, id?: string) => {
      const resolvedId = resolveInstanceId(id, resolveWorkspaceId(ctx))
      if (!resolvedId) return
      browserPaneManager.setInlineBounds(resolvedId, bounds)
    }
  )

  server.handle(
    RPC_CHANNELS.browserPane.SET_RENDERER_OVERLAY_ACTIVE,
    (ctx, active: boolean, id?: string) => {
      const resolvedId = resolveInstanceId(id, resolveWorkspaceId(ctx))
      if (!resolvedId) return
      browserPaneManager.setRendererOverlayActive(resolvedId, active)
    }
  )

  server.handle(RPC_CHANNELS.browserPane.GET_DISPLAY_MODE, (ctx, id?: string) => {
    const resolvedId = resolveInstanceId(id, resolveWorkspaceId(ctx))
    return resolvedId ? browserPaneManager.getDisplayMode(resolvedId) : 'popup'
  })

  server.handle(RPC_CHANNELS.browserPane.NAVIGATE, async (_ctx, id: string, url: string) => {
    try {
      return await browserPaneManager.navigate(id, url)
    } catch (err) {
      platform.logger.error(`[browser-pane] navigate failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.GO_BACK, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.goBack(id)
    } catch (err) {
      platform.logger.error(`[browser-pane] goBack failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.GO_FORWARD, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.goForward(id)
    } catch (err) {
      platform.logger.error(`[browser-pane] goForward failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.RELOAD, (_ctx, id: string) => {
    browserPaneManager.reload(id)
  })

  server.handle(RPC_CHANNELS.browserPane.STOP, (_ctx, id: string) => {
    browserPaneManager.stop(id)
  })

  server.handle(RPC_CHANNELS.browserPane.FOCUS, (_ctx, id: string) => {
    browserPaneManager.focus(id)
  })

  server.handle(RPC_CHANNELS.browserPane.LAUNCH, async (ctx, payload: BrowserEmptyStateLaunchPayload) => {
    try {
      return await browserPaneManager.handleEmptyStateLaunchFromRenderer(ctx.webContentsId!, payload)
    } catch (err) {
      platform.logger.error('[browser-pane] empty-state launch IPC failed:', err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SNAPSHOT, async (_ctx, id: string) => {
    try {
      return await browserPaneManager.getAccessibilitySnapshot(id)
    } catch (err) {
      platform.logger.error(`[browser-pane] snapshot failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.CLICK, async (_ctx, id: string, ref: string) => {
    try {
      return await browserPaneManager.clickElement(id, ref)
    } catch (err) {
      platform.logger.error(`[browser-pane] click failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.FILL, async (_ctx, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.fillElement(id, ref, value)
    } catch (err) {
      platform.logger.error(`[browser-pane] fill failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SELECT, async (_ctx, id: string, ref: string, value: string) => {
    try {
      return await browserPaneManager.selectOption(id, ref, value)
    } catch (err) {
      platform.logger.error(`[browser-pane] select failed for ${id} ref=${ref}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SCREENSHOT, async (_ctx, id: string, options?: BrowserScreenshotOptions) => {
    try {
      const result = await browserPaneManager.screenshot(id, options)
      return {
        base64: result.imageBuffer.toString('base64'),
        imageFormat: result.imageFormat,
        metadata: result.metadata,
      }
    } catch (err) {
      platform.logger.error(`[browser-pane] screenshot failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.EVALUATE, async (_ctx, id: string, expression: string) => {
    try {
      return await browserPaneManager.evaluate(id, expression)
    } catch (err) {
      platform.logger.error(`[browser-pane] evaluate failed for ${id}:`, err)
      throw err
    }
  })

  server.handle(RPC_CHANNELS.browserPane.SCROLL, async (_ctx, id: string, direction: string, amount?: number) => {
    const validDirections = ['up', 'down', 'left', 'right']
    if (!validDirections.includes(direction)) {
      throw new Error(`Invalid scroll direction: ${direction}`)
    }
    try {
      return await browserPaneManager.scroll(id, direction as 'up' | 'down' | 'left' | 'right', amount)
    } catch (err) {
      platform.logger.error(`[browser-pane] scroll failed for ${id}:`, err)
      throw err
    }
  })

  // Forward browser state changes to all windows
  browserPaneManager.onStateChange((info) => {
    pushTyped(server, RPC_CHANNELS.browserPane.STATE_CHANGED, { to: 'all' }, info)
  })

  browserPaneManager.onDisplayModeChange((mode) => {
    pushTyped(server, RPC_CHANNELS.browserPane.DISPLAY_MODE_CHANGED, { to: 'all' }, mode)
  })

  // Forward browser removals so renderer can immediately drop stale tabs
  browserPaneManager.onRemoved((id) => {
    pushTyped(server, RPC_CHANNELS.browserPane.REMOVED, { to: 'all' }, id)
  })

  // Forward browser interaction/focus events so renderer can align panel focus.
  browserPaneManager.onInteracted((id) => {
    pushTyped(server, RPC_CHANNELS.browserPane.INTERACTED, { to: 'all' }, id)
  })
}
