/**
 * Typed client for the wallet API (ARCHITECTURE §6). Every call carries the
 * IANA timezone so the server can bucket salary windows in *our* calendar
 * (D-11). Refusals arrive as ApiError with the server's error code — the
 * command layer maps codes to themed output (D-03).
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
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
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const get = <T>(path: string) => call<T>(path)
const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) })

// ---- shapes (server Contracts.cs, camelCased) ----

export interface MeDto {
  handle: string
  gitHubLogin: string | null
  provider: string
  alias: string
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

export const api = {
  me: () => get<MeDto>('/me'),
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
