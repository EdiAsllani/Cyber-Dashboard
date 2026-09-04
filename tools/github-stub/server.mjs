/**
 * github-stub — a fake github.com + api.github.com for offline dev.
 *
 * Fakes exactly what the relay uses (Phase 5 plan §7): the OAuth device flow
 * (with a real "approve" page), /user, /user/repos, /repos/{o}/{r},
 * /repos/{o}/{r}/commits and /pulls with Link pagination, a GraphQL totals
 * query, and /rate_limit — plus ETags, 304s and decrementing rate headers so
 * the relay's cache can be watched doing its job. Zero dependencies.
 *
 * Run through compose:  docker compose -f docker-compose.yml -f compose.github-stub.yml up --build --watch
 * Or bare:              PORT=9797 node tools/github-stub/server.mjs
 *
 * Test hooks (never exist on the real GitHub):
 *   POST /__stub/approve  { user_code }   approve a device code without the page
 *   POST /__stub/deny     { user_code }   decline it
 *   POST /__stub/bump     { name }        push one more commit to a repo (changes its ETags)
 */
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 9797)
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`
const LOGIN = process.env.STUB_LOGIN ?? 'v-netrunner'
const USER_ID = Number(process.env.STUB_USER_ID ?? 2077)
/** Seconds GitHub asks clients to wait between polls. Real GitHub says 5. */
const INTERVAL = Number(process.env.STUB_INTERVAL ?? 1)

// ---- fake data --------------------------------------------------------------

const started = Math.floor(Date.now() / 1000)
const rate = { core: { limit: 5000, used: 0 }, search: { limit: 30, used: 0 }, graphql: { limit: 5000, used: 0 } }
const resetAt = started + 3600

function seeded(seed) {
  let s = 0
  for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const MESSAGES = [
  'feat: laser lattice replaces the noise plane', 'fix: camera rig damp on low fps',
  'docs: phase acceptance sweep', 'refactor: split den into scene/den', 'chore: bump deps',
  'feat(server): wallet invariants + salary windows', 'fix: stale-container trap noted in README',
  'feat(client): CRT overlay fades on arrived', 'perf: instance counts per tier',
  'test: window-key function', 'feat: budget escrow + reached celebration',
  'fix: ETag revalidation on 304', 'feat: device flow login in the terminal',
]

function makeRepo(def) {
  const rnd = seeded(def.name)
  const commits = Array.from({ length: def.commits }, (_, i) => {
    const sha = createHash('sha1').update(`${def.name}:${i}`).digest('hex')
    const hoursAgo = i * (6 + Math.floor(rnd() * 30))
    return {
      sha,
      html_url: `https://github.com/${LOGIN}/${def.name}/commit/${sha}`,
      commit: {
        message: MESSAGES[Math.floor(rnd() * MESSAGES.length)] + (rnd() > 0.7 ? '\n\nlonger body here' : ''),
        author: { name: 'Edi Asllani', date: new Date(Date.now() - hoursAgo * 3600e3).toISOString() },
      },
      author: { login: LOGIN },
    }
  })
  const pulls = Array.from({ length: def.prsOpen }, (_, i) => ({
    number: def.prsClosed + def.prsMerged + i + 1,
    title: ['feat: audio hum behind the jack-in gesture', 'chore: prod compose file', 'fix: reduced-motion banner'][i % 3],
    html_url: `https://github.com/${LOGIN}/${def.name}/pull/${i + 1}`,
    state: 'open',
    draft: i === 1,
    user: { login: LOGIN },
    head: { ref: ['feat/phase-6-audio', 'chore/prod-compose', 'fix/reduced-motion'][i % 3] },
    created_at: new Date(Date.now() - (i + 1) * 86400e3).toISOString(),
    updated_at: new Date(Date.now() - (i + 1) * 3600e3 * 5).toISOString(),
  }))
  // Timestamps are fixed at boot (and on bump), never per request — otherwise
  // every response would carry a new ETag and the relay could never see a 304.
  return {
    ...def, commits, pulls,
    pushedAt: new Date(Date.now() - def.pushedHoursAgo * 3600e3).toISOString(),
    createdAt: new Date(Date.now() - def.createdDaysAgo * 86400e3).toISOString(),
  }
}

const repos = new Map(
  [
    { name: 'blackwall-dashboard', description: 'Scroll through the Blackwall into a netrunner den — CP2077-styled 3D dashboard', language: 'TypeScript', stars: 42, forks: 3, watchers: 5, private: false, commits: 137, prsOpen: 2, prsClosed: 5, prsMerged: 11, pushedHoursAgo: 2, createdDaysAgo: 40 },
    { name: 'netrunner-tools', description: 'CLI odds and ends for the net', language: 'C#', stars: 7, forks: 1, watchers: 2, private: false, commits: 58, prsOpen: 0, prsClosed: 1, prsMerged: 4, pushedHoursAgo: 30, createdDaysAgo: 200 },
    { name: 'arasaka-leak', description: 'do not push this', language: 'Python', stars: 0, forks: 0, watchers: 1, private: true, commits: 12, prsOpen: 1, prsClosed: 0, prsMerged: 0, pushedHoursAgo: 100, createdDaysAgo: 12 },
    { name: 'dotfiles', description: null, language: 'Shell', stars: 3, forks: 0, watchers: 1, private: false, commits: 240, prsOpen: 0, prsClosed: 0, prsMerged: 2, pushedHoursAgo: 400, createdDaysAgo: 900 },
  ].map((d) => [d.name, makeRepo(d)]),
)

function repoJson(r, full) {
  const base = {
    id: 1000 + [...repos.keys()].indexOf(r.name),
    name: r.name,
    full_name: `${LOGIN}/${r.name}`,
    owner: { login: LOGIN, id: USER_ID },
    private: r.private,
    description: r.description,
    html_url: `https://github.com/${LOGIN}/${r.name}`,
    default_branch: 'main',
    stargazers_count: r.stars,
    forks_count: r.forks,
    watchers_count: r.stars,
    open_issues_count: r.prsOpen + 2,
    language: r.language,
    pushed_at: r.pushedAt,
    created_at: r.createdAt,
  }
  return full ? { ...base, subscribers_count: r.watchers } : base
}

// ---- device flow state ------------------------------------------------------

/** device_code → { user_code, state: pending|approved|denied, expires } */
const devices = new Map()
const tokens = new Set()

function newUserCode() {
  const alphabet = 'BCDFGHJKLMNPQRSTVWXZ'
  const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)]
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`
}

function findByUserCode(userCode) {
  const want = String(userCode ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  for (const [code, d] of devices) if (d.user_code === want) return [code, d]
  return [null, null]
}

// ---- http plumbing ----------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

function parseBody(raw, contentType) {
  if (!raw) return {}
  if ((contentType ?? '').includes('json')) {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

function rateHeaders(bucket) {
  const b = rate[bucket]
  return {
    'x-ratelimit-limit': String(b.limit),
    'x-ratelimit-remaining': String(Math.max(0, b.limit - b.used)),
    'x-ratelimit-used': String(b.used),
    'x-ratelimit-reset': String(resetAt),
    'x-ratelimit-resource': bucket,
  }
}

function log(req, status, note = '') {
  console.log(`[stub] ${req.method} ${req.url} → ${status}${note ? `  ${note}` : ''}`)
}

function send(req, res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    ...headers,
  })
  res.end(payload)
  log(req, status)
}

/** JSON with ETag semantics: counted on 200, free on 304 — like the real thing. */
function sendJsonCached(req, res, body, bucket, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  const etag = `W/"${createHash('sha256').update(payload).digest('hex').slice(0, 24)}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, ...rateHeaders(bucket), ...extraHeaders })
    res.end()
    log(req, 304, '(etag match — free)')
    return
  }
  rate[bucket].used++
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    etag,
    ...rateHeaders(bucket),
    ...extraHeaders,
  })
  res.end(payload)
  log(req, 200, `rate ${rate[bucket].limit - rate[bucket].used}/${rate[bucket].limit}`)
}

function linkHeader(url, perPage, total) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Number(url.searchParams.get('page') ?? 1)
  if (pages <= 1) return {}
  const mk = (p, rel) => {
    const u = new URL(url)
    u.searchParams.set('page', String(p))
    return `<https://api.github.com${u.pathname}${u.search}>; rel="${rel}"`
  }
  const parts = []
  if (page < pages) parts.push(mk(page + 1, 'next'), mk(pages, 'last'))
  if (page > 1) parts.push(mk(page - 1, 'prev'), mk(1, 'first'))
  return { link: parts.join(', ') }
}

function authed(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
  return m && tokens.has(m[1])
}

const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<style>body{background:#0b0b0d;color:#e6e6e6;font:16px/1.5 system-ui;display:grid;place-items:center;min-height:100vh;margin:0}
main{max-width:420px;padding:32px;border:1px solid #333;border-radius:12px;background:#15151a}
h1{font-size:20px;margin:0 0 8px}p{color:#aaa}input{font:inherit;font-size:22px;letter-spacing:.2em;text-transform:uppercase;width:100%;padding:12px;border-radius:8px;border:1px solid #444;background:#0b0b0d;color:#fff;box-sizing:border-box}
button{font:inherit;padding:10px 18px;border-radius:8px;border:0;cursor:pointer;margin-top:12px}.ok{background:#2ea043;color:#fff}.no{background:#333;color:#ddd;margin-left:8px}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#5a1d1d;color:#ffb4b4;font-size:12px;margin-bottom:12px}</style>
<main><span class="badge">github-stub — not GitHub</span>${body}</main>`

// ---- router -----------------------------------------------------------------

const server = createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL)
  const raw = req.method === 'POST' ? await readBody(req) : ''
  const body = parseBody(raw, req.headers['content-type'])

  // -- OAuth (github.com) --
  if (req.method === 'POST' && url.pathname === '/login/device/code') {
    if (!body.client_id) return send(req, res, 200, { error: 'incorrect_client_credentials' })
    const device_code = randomBytes(20).toString('hex')
    const user_code = newUserCode()
    devices.set(device_code, { user_code, state: 'pending', expires: Date.now() + 900e3, scope: body.scope })
    return send(req, res, 200, {
      device_code, user_code, verification_uri: `${PUBLIC_URL}/login/device`, expires_in: 900, interval: INTERVAL,
    })
  }
  if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
    const d = devices.get(body.device_code)
    if (!d) return send(req, res, 200, { error: 'incorrect_device_code' })
    if (Date.now() > d.expires) { devices.delete(body.device_code); return send(req, res, 200, { error: 'expired_token' }) }
    if (d.state === 'pending') return send(req, res, 200, { error: 'authorization_pending', error_description: 'The authorization request is still pending.' })
    if (d.state === 'denied') { devices.delete(body.device_code); return send(req, res, 200, { error: 'access_denied' }) }
    devices.delete(body.device_code)
    const token = `gho_stub_${randomBytes(16).toString('hex')}`
    tokens.add(token)
    return send(req, res, 200, { access_token: token, token_type: 'bearer', scope: d.scope ?? '' })
  }
  if (url.pathname === '/login/device') {
    if (req.method === 'GET') {
      const pre = url.searchParams.get('code') ?? ''
      return send(req, res, 200, page('Device activation', `<h1>Device activation</h1><p>Enter the code shown in the terminal.</p>
<form method="post"><input name="user_code" value="${pre}" placeholder="XXXX-XXXX" autofocus>
<button class="ok" name="action" value="approve">Authorize</button><button class="no" name="action" value="deny">Cancel</button></form>`))
    }
    const [code, d] = findByUserCode(body.user_code)
    if (!d) return send(req, res, 404, page('Unknown code', '<h1>Unknown or expired code</h1><p>Run <code>login</code> again in the terminal.</p>'))
    d.state = body.action === 'deny' ? 'denied' : 'approved'
    console.log(`[stub] device ${d.user_code} → ${d.state}`)
    return send(req, res, 200, page('Done', `<h1>${d.state === 'approved' ? 'Authorized' : 'Declined'}</h1><p>Code <b>${d.user_code}</b>. You can go back to the terminal.</p>`))
  }

  // -- test hooks --
  if (req.method === 'POST' && url.pathname.startsWith('/__stub/')) {
    if (url.pathname === '/__stub/bump') {
      const r = repos.get(body.name)
      if (!r) return send(req, res, 404, { message: 'no such repo' })
      const sha = createHash('sha1').update(`${r.name}:bump:${Date.now()}`).digest('hex')
      r.commits.unshift({ sha, html_url: `https://github.com/${LOGIN}/${r.name}/commit/${sha}`, commit: { message: `chore: bump #${r.commits.length + 1}`, author: { name: 'Edi Asllani', date: new Date().toISOString() } }, author: { login: LOGIN } })
      r.pushedHoursAgo = 0
      r.pushedAt = new Date().toISOString()
      return send(req, res, 200, { commits: r.commits.length })
    }
    const [, d] = findByUserCode(body.user_code)
    if (!d) return send(req, res, 404, { message: 'unknown user_code' })
    d.state = url.pathname === '/__stub/deny' ? 'denied' : 'approved'
    console.log(`[stub] device ${d.user_code} → ${d.state} (hook)`)
    return send(req, res, 200, { state: d.state })
  }

  // -- API (api.github.com) --
  if (!authed(req)) {
    return send(req, res, 401, { message: 'Bad credentials', documentation_url: 'https://docs.github.com/rest' }, rateHeaders('core'))
  }
  if (url.pathname === '/rate_limit') {
    const bucket = (k) => ({ limit: rate[k].limit, used: rate[k].used, remaining: Math.max(0, rate[k].limit - rate[k].used), reset: resetAt })
    return send(req, res, 200, { resources: { core: bucket('core'), search: bucket('search'), graphql: bucket('graphql') }, rate: bucket('core') }, rateHeaders('core'))
  }
  if (url.pathname === '/user') {
    return sendJsonCached(req, res, { id: USER_ID, login: LOGIN, avatar_url: `https://avatars.githubusercontent.com/u/${USER_ID}?v=4`, name: 'Edi Asllani', type: 'User' }, 'core')
  }
  if (url.pathname === '/user/repos') {
    const list = [...repos.values()].sort((a, b) => (a.pushedAt < b.pushedAt ? 1 : -1)).map((r) => repoJson(r, false))
    return sendJsonCached(req, res, list, 'core')
  }
  const m = /^\/repos\/([^/]+)\/([^/]+)(\/(commits|pulls))?$/.exec(url.pathname)
  if (m) {
    const [, owner, name, , sub] = m
    const r = owner === LOGIN ? repos.get(name) : null
    if (!r) return send(req, res, 404, { message: 'Not Found', documentation_url: 'https://docs.github.com/rest' }, rateHeaders('core'))
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get('per_page') ?? 30)))
    const pageNo = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const slice = (arr) => arr.slice((pageNo - 1) * perPage, pageNo * perPage)
    if (!sub) return sendJsonCached(req, res, repoJson(r, true), 'core')
    if (sub === 'commits') return sendJsonCached(req, res, slice(r.commits), 'core', linkHeader(url, perPage, r.commits.length))
    const state = url.searchParams.get('state') ?? 'open'
    const pulls = state === 'open' ? r.pulls : state === 'all' ? r.pulls : []
    return sendJsonCached(req, res, slice(pulls), 'core', linkHeader(url, perPage, pulls.length))
  }
  if (req.method === 'POST' && url.pathname === '/graphql') {
    rate.graphql.used++
    const { owner, name } = body.variables ?? {}
    const r = owner === LOGIN ? repos.get(name) : null
    if (!r) {
      return send(req, res, 200, {
        data: { repository: null },
        errors: [{ type: 'NOT_FOUND', path: ['repository'], message: `Could not resolve to a Repository with the name '${owner}/${name}'.` }],
      }, rateHeaders('graphql'))
    }
    return send(req, res, 200, {
      data: {
        repository: {
          defaultBranchRef: { target: { history: { totalCount: r.commits.length } } },
          open: { totalCount: r.prsOpen },
          closed: { totalCount: r.prsClosed },
          merged: { totalCount: r.prsMerged },
        },
      },
    }, rateHeaders('graphql'))
  }
  return send(req, res, 404, { message: 'Not Found' }, rateHeaders('core'))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[stub] fake github listening on :${PORT} — public url ${PUBLIC_URL}, login ${LOGIN}, poll interval ${INTERVAL}s`)
})
