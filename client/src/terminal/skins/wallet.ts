import { api, ApiError, OfflineError } from '../api'
import type { BudgetDto, SettingDto } from '../api'
import { bar, eddies, parseAmount, signedEddies, stamp, table, truncate } from '../fmt'
import type { TerminalLine, TerminalSkin } from '../types'

/**
 * The left monitor: Arasaka Trust's wallet console, wired to the real API
 * (Phase 4). The server owns every invariant; this file owns the drama —
 * ApiError codes map to themed output here (D-03).
 */

const out = (text: string): TerminalLine => ({ text })
const dim = (text: string): TerminalLine => ({ text, kind: 'dim' })
const warn = (text: string): TerminalLine => ({ text, kind: 'warn' })
const err = (text: string): TerminalLine => ({ text, kind: 'err' })

/** ApiError code → themed lines. Unknown codes fall through with the server text. */
function themed(e: ApiError): TerminalLine[] {
  const meta = e.meta ?? {}
  switch (e.code) {
    case 'OVERDRAFT':
      return [
        warn('TRANSACTION DECLINED — INSUFFICIENT EDDIES'),
        dim(`on hand ${eddies(Number(meta.balance ?? 0))} // attempted ${eddies(Number(meta.attempted ?? 0))}`),
      ]
    case 'SALARY_ALREADY_CLAIMED':
      return [
        warn(`PAYROLL REFUSED — salary already drawn this window (${meta.window})`),
        dim("arasaka compliance can be… persuaded. try: salary --force"),
      ]
    case 'SALARY_FORCE_EXHAUSTED':
      return [
        warn(`PAYROLL REFUSED — forced disbursement already burned this window (${meta.window})`),
        dim('nothing left to squeeze. wait for the calendar to roll.'),
      ]
    case 'BUDGET_NOT_FOUND':
      return [err(e.message.toUpperCase())]
    case 'BUDGET_NOT_ACTIVE':
      return [warn(`STASH LOCKED — budget is ${String(meta.status ?? 'closed').toUpperCase()}`)]
    case 'BUDGET_HAS_HISTORY':
      return [
        warn('LEDGER IMMUTABLE — that stash has transactions on record'),
        dim('budget cancel <id> refunds and closes it instead'),
      ]
    case 'INVALID_AMOUNT':
      return [err('INVALID AMOUNT — positive eddies, max two decimals, cap €$ 10,000,000')]
    case 'INVALID_NAME':
      return [err('INVALID NAME — 1..64 characters')]
    case 'INVALID_FILTER':
      return [err(e.message.toUpperCase()), dim(`kinds: ${KIND_ALIASES.join(' | ')}`)]
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
async function run(fn: () => Promise<TerminalLine[]>): Promise<TerminalLine[]> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiError) return themed(e)
    if (e instanceof OfflineError) return [err('NO CARRIER — arasaka trust unreachable')]
    throw e
  }
}

// ---- rendering helpers ----

const KIND_ALIASES = ['pay', 'income', 'salary', 'fund', 'refund']
const KIND_TO_API: Record<string, string> = {
  pay: 'Pay',
  income: 'Income',
  salary: 'Salary',
  fund: 'BudgetFund',
  refund: 'BudgetRefund',
}
const KIND_LABEL: Record<string, string> = {
  Pay: 'PAY',
  Income: 'INCOME',
  Salary: 'SALARY',
  BudgetFund: 'FUND',
  BudgetRefund: 'REFUND',
}

function budgetRows(budgets: BudgetDto[]): TerminalLine[] {
  if (!budgets.length) return [dim('no stashes. budget add <name> <target> starts one.')]
  const rows = budgets.map((b) => [
    String(b.seq).padStart(2, '0'),
    truncate(b.name, 20),
    `${eddies(b.funded)} / ${eddies(b.target)}`,
    bar(b.target > 0 ? b.funded / b.target : 0),
    b.status.toUpperCase(),
  ])
  return table(rows).map((text, i) => {
    const status = budgets[i].status
    return status === 'Reached' ? { text, kind: 'out' as const } : status === 'Cancelled' ? dim(text) : out(text)
  })
}

function reachedBlock(name: string, target: number, seq: number): TerminalLine[] {
  return [
    out('▓▓▓ TARGET REACHED ▓▓▓'),
    out(`${name} — ${eddies(target)} secured.`),
    dim(`go get it, samurai. budget cancel ${seq} reclaims the eddies once you do.`),
  ]
}

function settingLines(s: SettingDto): TerminalLine[] {
  return [
    out(`${s.key} = ${s.value}`),
    dim(`${s.description} // allowed: ${s.allowed} // default: ${s.default}`),
  ]
}

// ---- config family (shared by `config` and `sudo config`) ----

function runConfig(argv: string[], elevated: boolean): Promise<TerminalLine[]> | TerminalLine[] {
  const [sub, key, ...rest] = argv
  switch (sub) {
    case undefined:
    case 'list':
      return run(async () => {
        const all = await api.settings()
        const rows = all.map((s) => [
          s.key,
          s.value + (s.value === s.default ? '' : ' *'),
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
        return [out(`${s.key} → ${s.value}`), dim('restored to default.')]
      })
    default:
      return [err(`unknown config action '${sub}'`), dim('config [list] | config get <key> | sudo config set|reset …')]
  }
}

// ---- the skin ----

export const wallet: TerminalSkin = {
  id: 'wallet',
  title: 'ARASAKA TRUST // WALLET.SYS',
  prompt: 'wallet>',
  banner: [
    'ARASAKA TRUST v9.2 — SECURE CHANNEL',
    'auth :: biometric bypass accepted',
    'ledger sync .......... OK',
    'compliance daemon .... ASLEEP',
    "type 'help' to list commands",
  ],
  commands: [
    {
      name: 'balance',
      args: '',
      help: 'eddies on hand + payroll status',
      run: () =>
        run(async () => {
          const w = await api.wallet()
          const payroll = w.salary.claimable
            ? 'CLAIMABLE'
            : w.salary.forceAvailable
              ? 'drawn — a --force remains'
              : 'exhausted this window'
          return [
            out(eddies(w.balance)),
            dim(`account :: ${w.alias} // ${w.provider}`),
            dim(`salary  :: ${eddies(w.salary.amount)} per ${w.salary.cadence} window (${w.salary.window})`),
            w.salary.claimable ? out(`payroll :: ${payroll}`) : dim(`payroll :: ${payroll}`),
          ]
        }),
    },
    {
      name: 'pay',
      args: '<amount> [memo…]',
      help: 'burn eddies',
      run: (argv) => {
        const amount = parseAmount(argv[0])
        if (amount === null) return [err('usage: pay <amount> [memo…]')]
        const memo = argv.slice(1).join(' ') || undefined
        return run(async () => {
          const r = await api.pay(amount, memo)
          return [
            out(`${signedEddies(r.amount)}  ${r.memo}`),
            dim(`balance :: ${eddies(r.balance)}`),
          ]
        })
      },
    },
    {
      name: 'income',
      args: '<amount> [memo…]',
      help: 'log a gig payout',
      run: (argv) => {
        const amount = parseAmount(argv[0])
        if (amount === null) return [err('usage: income <amount> [memo…]')]
        const memo = argv.slice(1).join(' ') || undefined
        return run(async () => {
          const r = await api.income(amount, memo)
          return [
            out(`${signedEddies(r.amount)}  ${r.memo}`),
            dim(`balance :: ${eddies(r.balance)}`),
          ]
        })
      },
    },
    {
      name: 'salary',
      args: '[--force]',
      help: 'draw arasaka payroll (once per window)',
      run: (argv) =>
        run(async () => {
          const r = await api.claimSalary(argv.includes('--force'))
          const lines = [
            out(`PAYROLL DISBURSED — ${eddies(r.amount)} (window ${r.window})`),
            dim(`balance :: ${eddies(r.balance)}`),
          ]
          if (r.forced) lines.push(warn("compliance daemon looked away. this won't work twice."))
          return lines
        }),
    },
    {
      name: 'history',
      args: '[n] [--kind k] [--budget id]',
      help: 'recent ledger rows',
      run: (argv) => {
        let take: number | undefined
        let kind: string | undefined
        let budget: number | undefined
        for (let i = 0; i < argv.length; i++) {
          const t = argv[i]
          if (t === '--kind') {
            const alias = argv[++i]?.toLowerCase()
            if (!alias || !(alias in KIND_TO_API))
              return [err(`usage: history --kind <${KIND_ALIASES.join('|')}>`)]
            kind = KIND_TO_API[alias]
          } else if (t === '--budget') {
            const n = Number(argv[++i])
            if (!Number.isInteger(n)) return [err('usage: history --budget <id>')]
            budget = n
          } else if (/^\d+$/.test(t)) {
            take = Number(t)
          } else {
            return [err(`unknown flag '${t}'`), dim('history [n] [--kind k] [--budget id]')]
          }
        }
        return run(async () => {
          const rows = await api.transactions({ take, kind, budget })
          if (!rows.length) return [dim('ledger is empty for that filter.')]
          return table(
            rows.map((t) => [
              stamp(t.createdAt),
              KIND_LABEL[t.kind] + (t.budgetSeq !== null ? ` #${t.budgetSeq}` : ''),
              signedEddies(t.amount),
              truncate(t.memo, 30),
            ]),
            [false, false, true, false],
          ).map(out)
        })
      },
    },
    {
      name: 'stats',
      args: '',
      help: 'this month, in and out',
      run: () =>
        run(async () => {
          const s = await api.stats()
          const lines = [
            dim(`:: window ${s.window} :: ${s.txCount} movements`),
            out(`income   ${signedEddies(s.income)}`),
            out(`spend    ${signedEddies(-s.spend)}`),
            out(`net      ${signedEddies(s.net)}`),
          ]
          if (s.topExpense)
            lines.push(dim(`biggest hit :: ${truncate(s.topExpense.memo, 32)} (${eddies(s.topExpense.amount)})`))
          lines.push(
            dim(`escrowed    :: ${eddies(s.escrowed)}`),
            dim(`all-time    :: ${signedEddies(s.allTimeIncome)} in // ${eddies(s.allTimeSpend)} out`),
          )
          return lines
        }),
    },
    {
      name: 'budget',
      args: '[add|fund|cancel|rm] …',
      help: 'stash eddies toward wanted gear',
      run: (argv) => {
        const [sub, ...rest] = argv
        switch (sub) {
          case undefined:
            return run(async () => budgetRows(await api.budgets()))
          case 'add': {
            // Last token is the target; everything before it is the name.
            const target = parseAmount(rest[rest.length - 1])
            const name = rest.slice(0, -1).join(' ')
            if (target === null || !name)
              return [err('usage: budget add <name…> <target>  (target comes last)')]
            return run(async () => {
              const b = await api.createBudget(name, target)
              return [
                out(`stash #${String(b.seq).padStart(2, '0')} opened :: ${b.name}`),
                dim(`target ${eddies(b.target)} // budget fund ${b.seq} <amount> to start saving`),
              ]
            })
          }
          case 'fund': {
            const seq = Number(rest[0])
            const amount = parseAmount(rest[1])
            if (!Number.isInteger(seq) || amount === null)
              return [err('usage: budget fund <id> <amount>')]
            return run(async () => {
              const r = await api.fundBudget(seq, amount)
              if (r.reached) {
                return [
                  ...reachedBlock(r.budget.name, r.budget.target, r.budget.seq),
                  ...(r.clamped ? [dim(`(clamped: only ${eddies(r.moved)} was needed)`)] : []),
                  dim(`balance :: ${eddies(r.balance)}`),
                ]
              }
              const lines = [
                out(
                  `${eddies(r.moved)} escrowed → ${truncate(r.budget.name, 24)} ${bar(r.budget.funded / r.budget.target)}`,
                ),
                dim(`balance :: ${eddies(r.balance)}`),
              ]
              if (r.clamped) lines.push(dim(`(clamped: only ${eddies(r.moved)} was needed)`))
              return lines
            })
          }
          case 'cancel': {
            const seq = Number(rest[0])
            if (!Number.isInteger(seq)) return [err('usage: budget cancel <id>')]
            return run(async () => {
              const r = await api.cancelBudget(seq)
              return [
                out(`stash #${String(r.budget.seq).padStart(2, '0')} closed :: ${r.budget.name}`),
                out(`${eddies(r.refunded)} returned to balance (${eddies(r.balance)})`),
              ]
            })
          }
          case 'rm': {
            const seq = Number(rest[0])
            if (!Number.isInteger(seq)) return [err('usage: budget rm <id>')]
            return run(async () => {
              await api.deleteBudget(seq)
              return [out(`stash #${String(seq).padStart(2, '0')} shredded. no trace.`)]
            })
          }
          default:
            return [
              err(`unknown budget action '${sub}'`),
              dim('budget | budget add <name…> <target> | fund <id> <amt> | cancel <id> | rm <id>'),
            ]
        }
      },
    },
    {
      name: 'config',
      args: '[list|get] …',
      help: 'read the settings registry',
      run: (argv) => runConfig(argv, false),
    },
    {
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
    },
  ],
}
