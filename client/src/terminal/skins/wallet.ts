import type { TerminalSkin } from '../types'

/** The left monitor: Arasaka Trust's wallet console. Mock until Phase 4. */
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
      help: 'eddies on hand',
      run: () => [{ text: '€$ 2,077.00 [MOCK — Phase 4]' }],
    },
  ],
}
