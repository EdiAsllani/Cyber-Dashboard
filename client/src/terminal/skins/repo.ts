import { api } from '../api'
import type { Cached, CommitDto, RateBucketDto } from '../api'
import { ago, firstLine, stamp, table, truncate, until } from '../fmt'
import { dim, err, out, run, sessionCommands, sessionMotd, warn, ACCESS_DENIED } from '../shared'
import { useSession } from '../../state/session'
import type { TerminalLine, TerminalSkin } from '../types'

/**
 * The right monitor: the net-side repo console, live against GitHub through
 * the relay's cached client (Phase 5). Every command ends with the relay's
 * cache verdict — HIT means GitHub was never asked.
 */

type Target = { owner: string; name: string }

/**
 * Resolve `[name]`: `owner/name` verbatim, bare `name` under the operator's
 * GitHub login, nothing → `repo.default` from the registry (D-14).
 */
async function target(token: string | undefined): Promise<Target | TerminalLine[]> {
  let ref = token
  if (!ref) {
    ref = (await api.settings()).find((s) => s.key === 'repo.default')?.value ?? ''
    if (!ref)
      return [
        err('NO TARGET — name a repo: <command> <owner/name>'),
        dim('or pin one: sudo config set repo.default <owner/name>'),
      ]
  }
  const [a, b, extra] = ref.split('/')
  if (extra !== undefined || !a) return [err('INVALID TARGET — use owner/name or name')]
  if (b) return { owner: a, name: b }
  const me = useSession.getState().me ?? (await useSession.getState().refresh())
  if (!me?.gitHubLogin) return ACCESS_DENIED
  return { owner: me.gitHubLogin, name: a }
}

const isLines = (t: Target | TerminalLine[]): t is TerminalLine[] => Array.isArray(t)

const cacheLine = (c: Cached<unknown>): TerminalLine => dim(`cache :: ${c.cache ?? '?'}`)

const short = (sha: string) => sha.slice(0, 7)

function commitLine(c: CommitDto): string {
  return `${short(c.sha)}  ${truncate(firstLine(c.message), 40).padEnd(40)}  ${truncate(c.author, 14)}  ${ago(c.when)}`
}

function rateRow(label: string, b: RateBucketDto | null): string[] {
  if (!b) return [label, '—', '', '']
  return [label, `${b.remaining}/${b.limit}`, `used ${b.used}`, `resets ${until(b.resetAt)}`]
}

/** `<command> [name]` → target → body. Keeps every repo command on one shape. */
function withTarget(
  argv: string[],
  body: (t: Target, flags: string[]) => Promise<TerminalLine[]>,
): Promise<TerminalLine[]> {
  return run(async () => {
    const flags = argv.filter((a) => a.startsWith('--'))
    const name = argv.find((a) => !a.startsWith('--'))
    const t = await target(name)
    if (isLines(t)) return t
    return body(t, flags)
  })
}

export const repo: TerminalSkin = {
  id: 'repo',
  title: 'NIGHT CITY NET // REPO.NET',
  prompt: 'net>',
  banner: [
    'NIGHT CITY NET — REPO.NET MIRROR',
    'handshake :: 62ms // 4th ring',
    'ice probe ............ CLEAN',
    'index cache .......... 60s TTL // etag revalidation',
    "type 'help' to list commands",
  ],
  motd: sessionMotd,
  commands: [
    ...sessionCommands,
    {
      name: 'repos',
      args: '[n] [--all]',
      help: 'your repositories, most recently pushed first',
      run: (argv) =>
        run(async () => {
          const all = argv.includes('--all')
          const n = Number(argv.find((a) => /^\d+$/.test(a)) ?? 15)
          const res = await api.repos()
          if (!res.data.length) return [dim('no repositories on this identity.'), cacheLine(res)]
          const rows = res.data.slice(0, all ? undefined : n).map((r) => [
            truncate(r.name, 28) + (r.private ? ' 🔒' : ''),
            `★ ${r.stars}`,
            truncate(r.language ?? '—', 12),
            r.pushedAt ? stamp(r.pushedAt) : '—',
          ])
          const lines = table(rows, [false, true, false, false]).map(out)
          if (!all && res.data.length > n)
            lines.push(dim(`… ${res.data.length - n} more — repos --all`))
          lines.push(cacheLine(res))
          return lines
        }),
    },
    {
      name: 'repo',
      args: '[name]',
      help: 'summary card for a repository',
      run: (argv) =>
        withTarget(argv, async ({ owner, name }) => {
          const res = await api.repoSummary(owner, name)
          const r = res.data
          const lines: TerminalLine[] = [
            out(`${r.fullName}${r.private ? '  [PRIVATE]' : ''}`),
          ]
          if (r.description) lines.push(dim(`"${truncate(r.description, 64)}"`))
          lines.push(
            ...table([
              ['branch', r.defaultBranch, `★ ${r.stars}`, `forks ${r.forks}`, `watch ${r.watchers}`, `issues ${r.openIssues}`],
              ['lang', r.language ?? '—', `created ${r.createdAt ? stamp(r.createdAt).slice(0, 6) : '?'}`, `pushed ${ago(r.pushedAt)}`, '', ''],
            ]).map(out),
          )
          if (r.latest)
            lines.push(
              out(`latest  ${short(r.latest.sha)}  ${truncate(firstLine(r.latest.message), 44)}  (${r.latest.author}, ${ago(r.latest.when)})`),
            )
          lines.push(
            out(`totals  ${r.totals.commits} commits // prs ${r.totals.prsOpen} open / ${r.totals.prsClosed} closed / ${r.totals.prsMerged} merged`),
            dim(r.url),
            cacheLine(res),
          )
          return lines
        }),
    },
    {
      name: 'latest',
      args: '[name]',
      help: 'the newest commit on the default branch',
      run: (argv) =>
        withTarget(argv, async ({ owner, name }) => {
          const res = await api.repoCommits(owner, name, 1)
          const c = res.data.items[0]
          if (!c) return [dim(`${owner}/${name} has no commits on ${res.data.defaultBranch}.`), cacheLine(res)]
          return [
            out(`${short(c.sha)}  ${firstLine(c.message)}`),
            dim(`by ${c.author} // ${c.when ? `${stamp(c.when)} (${ago(c.when)})` : '?'} // ${res.data.defaultBranch}`),
            dim(c.url),
            cacheLine(res),
          ]
        }),
    },
    {
      name: 'commits',
      args: '[name]',
      help: 'commit total + the last five',
      run: (argv) =>
        withTarget(argv, async ({ owner, name }) => {
          const res = await api.repoCommits(owner, name, 5)
          return [
            out(`${res.data.total} commits on ${res.data.defaultBranch}`),
            ...res.data.items.map((c) => dim(commitLine(c))),
            cacheLine(res),
          ]
        }),
    },
    {
      name: 'prs',
      args: '[name] [--all]',
      help: 'open pull requests, or --all for totals',
      run: (argv) =>
        withTarget(argv, async ({ owner, name }, flags) => {
          const res = await api.repoPulls(owner, name, 5)
          const p = res.data
          if (flags.includes('--all'))
            return [
              out(`prs  ${p.open} open / ${p.closed} closed / ${p.merged} merged`),
              dim(`${p.open + p.closed + p.merged} total across ${owner}/${name}`),
              cacheLine(res),
            ]
          if (!p.items.length) return [dim(`no open pull requests on ${owner}/${name}.`), cacheLine(res)]
          const rows = p.items.map((pr) => [
            `#${pr.number}`,
            truncate(pr.title, 34) + (pr.draft ? ' [draft]' : ''),
            truncate(pr.author, 12),
            truncate(pr.branch, 18),
            ago(pr.updatedAt),
          ])
          return [
            out(`${p.open} open pull request${p.open === 1 ? '' : 's'}`),
            ...table(rows).map(out),
            ...(p.open > p.items.length ? [dim(`… ${p.open - p.items.length} more on github`)] : []),
            cacheLine(res),
          ]
        }),
    },
    {
      name: 'rate',
      args: '',
      help: 'github api budget left',
      run: () =>
        run(async () => {
          const res = await api.rate()
          const r = res.data
          const lines = table([
            rateRow('core', r.core),
            rateRow('search', r.search),
            rateRow('graphql', r.graphql),
          ]).map((text, i) => (i === 0 && r.core.remaining < 100 ? warn(text) : out(text)))
          lines.push(dim('authorized 304s are free — the 60s cache + etags keep this high.'))
          return lines
        }),
    },
  ],
}
