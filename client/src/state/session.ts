import { create } from 'zustand'
import { api, ApiError, type MeDto } from '../terminal/api'

/**
 * Who is jacked in (ARCHITECTURE §3 `useSession`). Refreshed by `login`,
 * `logout` and each terminal's motd; read by REPO.NET to default the repo
 * owner to the operator's GitHub login. `null` with `checked` means the
 * server said 401 — no session — rather than "not asked yet".
 */

export interface SessionState {
  me: MeDto | null
  checked: boolean
  /** Ask `/api/me`. Resolves null on 401; rethrows anything else (offline). */
  refresh: () => Promise<MeDto | null>
  clear: () => void
}

export const useSession = create<SessionState>((set) => ({
  me: null,
  checked: false,
  refresh: async () => {
    try {
      const me = await api.me()
      set({ me, checked: true })
      return me
    } catch (e) {
      if (e instanceof ApiError && e.code !== 'UPLINK_REVOKED' && /ACCESS_DENIED|SESSION_INVALID|HTTP_401/.test(e.code)) {
        set({ me: null, checked: true })
        return null
      }
      throw e
    }
  },
  clear: () => set({ me: null, checked: true }),
}))
