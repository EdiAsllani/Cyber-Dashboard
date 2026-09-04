/**
 * Typed client for the API (ARCHITECTURE §6). Every call carries the IANA
 * timezone so the server can bucket salary windows in *our* calendar (D-11)
 * and the session cookie rides along automatically (same origin through the
 * Vite proxy). Refusals arrive as ApiError with the server's error code — the
 * command layer maps codes to themed output (D-03). Repo calls also surface
 * the server's `X-Cache` verdict so the terminal can show the cache working.
 */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public meta?: Record<string, unknown>,
  ) {
    super(message)
  }
}

/** Network down / server unreachable — rendered as NO CARRIER. */
export class OfflineError extends Error {}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

/** A payload plus the server's cache verdict (`X-Cache`), when it sent one. */
export interface Cached<T> {
  data: T
  cache: string | null
}

async function callMeta<T>(path: string, init?: RequestInit): Promise<Cached<T>> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'X-Timezone': TZ,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  } catch {
    throw new OfflineError('NO CARRIER')
  }
  if (!res.ok) {
    let body: { code?: string; message?: string; meta?: Record<string, unknown> } = {}
    try {
      body = await res.json()
    } catch {
      /* non-JSON error page */
    }
    throw new ApiError(body.code ?? `HTTP_${res.status}`, body.message ?? res.statusText, body.meta)
  }
  const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T)
  return { data, cache: res.headers.get('X-Cache') }
}

const call = async <T>(path: string, init?: RequestInit): Promise<T> => (await callMeta<T>(path, init)).data
const get = <T>(path: string) => call<T>(path)
const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) })
const getCached = <T>(path: string) => callMeta<T>(path)

// ---- shapes (server Contracts.cs, camelCased) ----

export interface MeDto {
  handle: string
  gitHubLogin: string | null
  avatarUrl: string | null
  gitHubLinkedAt: string | null
  provider: string
  alias: string
}

// ---- auth (D-14 device flow) ----

export interface DeviceStartDto {
  handle: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface LoginResultDto {
  handle: string
  gitHubLogin: string
  avatarUrl: string | null
  /** `claimed` = inherited the seed ledger, `created` = fresh account, `returning`. */
  outcome: 'claimed' | 'created' | 'returning'
}

export interface DevicePollDto {
  status: 'pending' | 'complete'
  retryIn: number | null
  user: LoginResultDto | null
}

// ---- REPO.NET ----

export interface RepoListItemDto {
  owner: string
  name: string
  fullName: string
  private: boolean
  stars: number
  forks: number
  language: string | null
  description: string | null
  pushedAt: string | null
  defaultBranch: string
}

export interface CommitDto {
  sha: string
  author: string
  message: string
  when: string | null
  url: string
}

export interface TotalsDto {
  commits: number
  prsOpen: number
  prsClosed: number
  prsMerged: number
}

export interface RepoSummaryDto {
  owner: string
  name: string
  fullName: string
  private: boolean
  description: string | null
  defaultBranch: string
  stars: number
  forks: number
  watchers: number
  openIssues: number
  language: string | null
  createdAt: string | null
  pushedAt: string | null
  url: string
  latest: CommitDto | null
  totals: TotalsDto
}

export interface CommitsDto {
  defaultBranch: string
  total: number
  items: CommitDto[]
}

export interface PullDto {
  number: number
  title: string
  author: string
  branch: string
  draft: boolean
  updatedAt: string
  url: string
}

export interface PullsDto {
  open: number
  closed: number
  merged: number
  items: PullDto[]
}

export interface RateBucketDto {
  limit: number
  remaining: number
  used: number
  resetAt: string
}

export interface RateDto {
  core: RateBucketDto
  search: RateBucketDto | null
  graphql: RateBucketDto | null
}

export interface SalaryStatusDto {
  amount: number
  cadence: string
  window: string
  claimable: boolean
  forceAvailable: boolean
}

export interface WalletDto {
  provider: string
  alias: string
  balance: number
  salary: SalaryStatusDto
}

export interface TransactionDto {
  kind: string
  amount: number
  memo: string
  budgetSeq: number | null
  createdAt: string
}

export interface TxResultDto {
  kind: string
  amount: number
  memo: string
  createdAt: string
  balance: number
}

export interface SalaryResultDto {
  amount: number
  balance: number
  window: string
  forced: boolean
}

export interface BudgetDto {
  seq: number
  name: string
  target: number
  funded: number
  status: string
  createdAt: string
  closedAt: string | null
}

export interface FundResultDto {
  budget: BudgetDto
  moved: number
  clamped: boolean
  reached: boolean
  balance: number
}

export interface CancelResultDto {
  budget: BudgetDto
  refunded: number
  balance: number
}

export interface StatsDto {
  window: string
  income: number
  spend: number
  net: number
  txCount: number
  topExpense: { memo: string; amount: number } | null
  escrowed: number
  allTimeIncome: number
  allTimeSpend: number
}

export interface SettingDto {
  key: string
  value: string
  default: string
  allowed: string
  description: string
}

// ---- calls ----

const repoPath = (owner: string, name: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`

export const api = {
  me: () => get<MeDto>('/me'),
  deviceStart: () => post<DeviceStartDto>('/auth/github/device/start', {}),
  devicePoll: (handle: string) => post<DevicePollDto>('/auth/github/device/poll', { handle }),
  logout: () => post<void>('/auth/logout', {}),
  repos: () => getCached<RepoListItemDto[]>('/repos'),
  repoSummary: (owner: string, name: string) =>
    getCached<RepoSummaryDto>(`${repoPath(owner, name)}/summary`),
  repoCommits: (owner: string, name: string, take: number) =>
    getCached<CommitsDto>(`${repoPath(owner, name)}/commits?take=${take}`),
  repoPulls: (owner: string, name: string, take: number) =>
    getCached<PullsDto>(`${repoPath(owner, name)}/pulls?take=${take}`),
  rate: () => getCached<RateDto>('/repos/rate'),
  wallet: () => get<WalletDto>('/wallet'),
  pay: (amount: number, memo?: string) => post<TxResultDto>('/wallet/pay', { amount, memo }),
  income: (amount: number, memo?: string) => post<TxResultDto>('/wallet/income', { amount, memo }),
  claimSalary: (force: boolean) => post<SalaryResultDto>('/wallet/salary/claim', { force }),
  transactions: (opts: { take?: number; kind?: string; budget?: number }) => {
    const q = new URLSearchParams()
    if (opts.take !== undefined) q.set('take', String(opts.take))
    if (opts.kind) q.set('kind', opts.kind)
    if (opts.budget !== undefined) q.set('budget', String(opts.budget))
    const qs = q.toString()
    return get<TransactionDto[]>(`/wallet/transactions${qs ? `?${qs}` : ''}`)
  },
  stats: () => get<StatsDto>('/wallet/stats'),
  budgets: () => get<BudgetDto[]>('/budgets'),
  createBudget: (name: string, target: number) => post<BudgetDto>('/budgets', { name, target }),
  fundBudget: (seq: number, amount: number) =>
    post<FundResultDto>(`/budgets/${seq}/fund`, { amount }),
  cancelBudget: (seq: number) => post<CancelResultDto>(`/budgets/${seq}/cancel`, {}),
  deleteBudget: (seq: number) => call<void>(`/budgets/${seq}`, { method: 'DELETE' }),
  settings: () => get<SettingDto[]>('/config'),
  setSetting: (key: string, value: string) =>
    call<SettingDto>(`/config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
  resetSetting: (key: string) =>
    call<SettingDto>(`/config/${encodeURIComponent(key)}`, { method: 'DELETE' }),
}
