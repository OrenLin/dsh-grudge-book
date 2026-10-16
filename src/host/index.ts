import type { Context } from '@deepseek-ai/cordis'
// Type-only imports load the Events interface augmentations for
// 'session/event' and 'agent/created' without pulling runtime code.
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { GrudgeBookService } from './service.js'

/** Cordis plugin name (bundle id stays '@local/grudge-book'). */
export const name = 'grudge-book'

/** Host services we need before activation. */
export const inject = ['storageDomain', 'agents']

export function apply(ctx: Context): void {
  const service = new GrudgeBookService(ctx)

  // Live tail: every committed event in every session.
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    service.handleEvent(session, event)
  })

  // Backfill: fold the full log whenever an agent (re)attaches a session.
  ctx.on('agent/created', (payload: { agent?: Agent }) => {
    const session = payload.agent?.session
    if (session === undefined) return
    void service.foldSession(session).catch((error: unknown) => {
      ctx.logger.warn(`grudge-book: fold failed: ${String(error)}`)
    })
  })

  ctx.logger.info('grudge-book: AI“记仇”小本本 已就绪（AI 无真实情绪，一切皆为娱乐文案）')
}
