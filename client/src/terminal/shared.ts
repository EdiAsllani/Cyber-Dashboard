import { api, ApiError, OfflineError } from './api'
import type { SettingDto } from './api'
import { table, until } from './fmt'
import { useSession } from '../state/session'
import type { Command, CommandCtx, TerminalLine } from './types'

/**
 * What both skins share: line helpers, the `run` wrapper that turns server
 * refusals into drama (D-03), and the commands that belong to the *session*
 * rather than to a monitor — `login`/`logout` (D-06/D-14) and the config
 * registry (D-13, one registry, both terminals).
 */

export const out = (text: string): TerminalLine => ({ text })
export const dim = (text: string): TerminalLine => ({ text, kind: 'dim' })
export const warn = (text: string): TerminalLine => ({ text, kind: 'warn' })
export const err = (text: string): TerminalLine => ({ text, kind: 'err' })

export const ACCESS_DENIED: TerminalLine[] = [
  err('ACCESS DENIED — run: login'),
  dim('no session on this uplink. github is the only key (D-06).'),
]

/** Codes every skin can receive. Skins try their own codes first, then this. */
export function themedBase(e: ApiError): TerminalLine[] {
  const meta = e.meta ?? {}
  switch (e.code) {
    case 'ACCESS_DENIED':
    case 'SESSION_INVALID':
    case 'HTTP_401':
      return ACCESS_DENIED
    case 'UPLINK_REVOKED':
      return [warn('UPLINK REVOKED — github no longer honours the stored token'), dim('run: login')]
    case 'GITHUB_NOT_CONFIGURED':
      return [
        err('UPLINK NOT CONFIGURED — no GitHub client id on the relay'),
        dim('set GITHUB_CLIENT_ID in .env (device flow enabled on the OAuth app),'),
        dim('or bring the offline stub: docker compose -f docker-compose.yml -f compose.github-stub.yml up'),
      ]
    case 'UPLINK_REFUSED':
      return [
        warn(`UPLINK REFUSED — ${e.message}`),
        ...(meta.error ? [dim(`github :: ${String(meta.error)}`)] : []),
      ]
    case 'UPLINK_DOWN':
      return [err('UPLINK DOWN — github unreachable from the relay')]
    case 'RATE_LIMITED':
      return [
        warn('RATE LIMITED — github budget exhausted'),
        dim(meta.reset ? `resets ${until(String(meta.reset))}` : 'try again later'),
      ]
    case 'DEVICE_EXPIRED':
      return [warn('CODE EXPIRED — the device code timed out'), dim('run: login')]
    case 'DEVICE_DENIED':
      return [warn('AUTHORIZATION DECLINED — github said no'), dim('run: login to try again')]
    case 'REPO_NOT_FOUND':
      return [err(`REPO NOT FOUND — ${e.message}`)]
    case 'INVALID_REPO':
      return [err('INVALID TARGET — use owner/name with [A-Za-z0-9_.-]')]
    case 'UNKNOWN_SETTING':
      return [err(`UNKNOWN KEY — ${e.message}`), dim("run 'config list' for the registry")]
    case 'INVALID_SETTING_VALUE':
      return [err('VALUE REFUSED'), dim(`allowed :: ${meta.allowed}`)]
    case 'CONCURRENCY_CONFLICT':
      return [warn('LEDGER CONTENTION — another write landed first. run it again.')]
    default:
      return [err(`${e.code} :: ${e.message}`)]
  }
}

/** Wrap a command body: ApiError → theme, network death → NO CARRIER. */
export async function run(
  fn: () => Promise<TerminalLine[]>,
  themed: (e: ApiError) => TerminalLine[] = themedBase,
  offline = 'NO CARRIER — relay unreachable',
): Promise<TerminalLine[]> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiError) return themed(e)
    if (e instanceof OfflineError) return [err(offline)]
    throw e
  }
}

/** Resolves after `ms`, or immediately (false) once the signal fires. */
export function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false)
    const id = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve(true)
    }, ms)
    const onAbort = () => {
      window.clearTimeout(id)
      resolve(false)
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** The motd both skins print after their banner. */
export async function sessionMotd(): Promise<TerminalLine[]> {
  return run(async () => {
    const me = await useSession.getState().refresh()
    if (!me) return [warn('ACCESS DENIED — no session on this uplink'), dim("run 'login' to jack in with github")]
    return [dim(`operator :: ${me.handle} // github ${me.gitHubLogin ?? 'UNLINKED'}`)]
  })
}

// ---- login / logout (D-14: the whole ceremony stays inside the CRT) ----

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function outcomeLine(outcome: string): TerminalLine {
  switch (outcome) {
    case 'claimed':
      return dim('seed ledger claimed — NIGHT-CITY-SAVINGS is yours now, history intact.')
    case 'created':
      return dim('new operator — ARASAKA TRUST opened NIGHT-CITY-SAVINGS with a €$ 2,077.00 welcome bonus.')
    default:
      return dim('welcome back, netrunner.')
  }
}

export const login: Command = {
  name: 'login',
  args: '',
  help: 'jack in with github (device flow)',
  run: (_argv, ctx: CommandCtx) =>
    run(async () => {
      const start = await api.deviceStart()
      const head: TerminalLine[] = [
        out(`ENTER CODE ${start.userCode} AT ${start.verificationUri}`),
      ]
      if (await copyToClipboard(start.userCode)) head.push(dim('code copied to clipboard'))
      const opened = window.open(start.verificationUri, '_blank', 'noopener')
      head.push(
        dim(opened ? 'verification page opened in a new tab' : 'popup blocked — open the address above yourself'),
        dim(`waiting for approval… (code lives ${Math.round(start.expiresIn / 60)} min; ESC abandons)`),
      )
      ctx.print(head)

      let interval = Math.max(1, start.interval)
      while (await sleep(interval * 1000, ctx.signal)) {
        const poll = await api.devicePoll(start.handle)
        if (poll.status === 'complete' && poll.user) {
          await useSession.getState().refresh()
          return [
            out('UPLINK ESTABLISHED'),
            out(`operator :: ${poll.user.gitHubLogin}`),
            outcomeLine(poll.user.outcome),
          ]
        }
        if (poll.retryIn) interval = poll.retryIn
      }
      return []
    }),
}

export const logout: Command = {
  name: 'logout',
  args: '',
  help: 'burn the session',
  run: () =>
    run(async () => {
      await api.logout()
      useSession.getState().clear()
      return [out('UPLINK SEVERED — session burned.'), dim('the ledger stays; the key is gone. login brings it back.')]
    }),
}

// ---- config family (D-13), shared by `config` and `sudo config` ----

function settingLines(s: SettingDto): TerminalLine[] {
  return [
    out(`${s.key} = ${s.value || '(unset)'}`),
    dim(`${s.description} // allowed: ${s.allowed} // default: ${s.default || '(unset)'}`),
  ]
}

function runConfig(argv: string[], elevated: boolean): Promise<TerminalLine[]> | TerminalLine[] {
  const [sub, key, ...rest] = argv
  switch (sub) {
    case undefined:
    case 'list':
      return run(async () => {
        const all = await api.settings()
        const rows = all.map((s) => [
          s.key,
          (s.value || '(unset)') + (s.value === s.default ? '' : ' *'),
          s.allowed,
        ])
        return [
          ...table([['KEY', 'VALUE', 'ALLOWED'], ...rows]).map((text, i) =>
            i === 0 ? dim(text) : out(text),
          ),
          dim('* diverges from default // sudo config set <key> <value>'),
        ]
      })
    case 'get':
      if (!key) return [err('usage: config get <key>')]
      return run(async () => {
        const s = (await api.settings()).find((x) => x.key === key.toLowerCase())
        if (!s) return [err(`UNKNOWN KEY — '${key}'`), dim("run 'config list' for the registry")]
        return settingLines(s)
      })
    case 'set': {
      if (!elevated)
        return [
          warn('PERMISSION DENIED — you are not root.'),
          dim(`try: sudo config set ${key ?? '<key>'} ${rest.join(' ') || '<value>'}`),
        ]
      const value = rest.join(' ')
      if (!key || !value) return [err('usage: sudo config set <key> <value>')]
      return run(async () => {
        const s = await api.setSetting(key, value)
        return [out(`${s.key} → ${s.value}`), dim('committed to the registry.')]
      })
    }
    case 'reset':
      if (!elevated)
        return [
          warn('PERMISSION DENIED — you are not root.'),
          dim(`try: sudo config reset ${key ?? '<key>'}`),
        ]
      if (!key) return [err('usage: sudo config reset <key>')]
      return run(async () => {
        const s = await api.resetSetting(key)
        return [out(`${s.key} → ${s.value || '(unset)'}`), dim('restored to default.')]
      })
    default:
      return [err(`unknown config action '${sub}'`), dim('config [list] | config get <key> | sudo config set|reset …')]
  }
}

export const config: Command = {
  name: 'config',
  args: '[list|get] …',
  help: 'read the settings registry',
  run: (argv) => runConfig(argv, false),
}

export const sudo: Command = {
  name: 'sudo',
  args: 'config set|reset …',
  help: 'mutate the registry (root required)',
  run: (argv) => {
    if (argv[0] !== 'config')
      return [
        err('sudo: only the config registry answers to root here'),
        dim('sudo config set <key> <value> | sudo config reset <key>'),
      ]
    return runConfig(argv.slice(1), true)
  },
}

/** The session + registry commands every skin carries. */
export const sessionCommands: Command[] = [login, logout, config, sudo]
