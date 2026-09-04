import type { TerminalSkin } from '../types'

/** The right monitor: the net-side repo console. Mock until Phase 5. */
export const repo: TerminalSkin = {
  id: 'repo',
  title: 'NIGHT CITY NET // REPO.NET',
  prompt: 'net>',
  banner: [
    'NIGHT CITY NET — REPO.NET MIRROR',
    'handshake :: 62ms // 4th ring',
    'ice probe ............ CLEAN',
    'index cache .......... STALE',
    "type 'help' to list commands",
  ],
  commands: [
    {
      name: 'repos',
      args: '',
      help: 'list linked repositories',
      run: () => [{ text: 'ACCESS DENIED — link GitHub in Phase 5', kind: 'warn' }],
    },
  ],
}
