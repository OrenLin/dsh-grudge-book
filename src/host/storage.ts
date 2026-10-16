import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import {
  bookEntrySchema,
  prefsSchema,
  sessionProgressSchema,
} from '../shared/contract.js'

export const grudgeDomain = defineDomain({
  name: 'grudgebook',
  version: 1,
  tables: {
    /** One row per recorded page; key = entry id. */
    entries: domainTable<string, import('../shared/contract.ts').BookEntry>(bookEntrySchema),
    /** One row per session; key = session id. */
    progress: domainTable<string, import('../shared/contract.ts').SessionProgress>(
      sessionProgressSchema,
    ),
    /** Single row 'current'. */
    prefs: domainTable<'current', import('../shared/contract.ts').Prefs>(prefsSchema),
  },
})
