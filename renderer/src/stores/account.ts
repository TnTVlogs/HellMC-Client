import type { Account } from '../api'
import { computed, signal } from '@preact/signals'
import { hellmc } from '../api'

// 06 §6, store `account`: comptes desats + quin és l'actiu. Cap component hi escriu directament
// — sempre a través de les accions d'aquest fitxer.
//
// 2.1: només compte offline (P1, un nom sense contrasenya — jugar sense connexió). Microsoft OAuth
// és fora d'abast d'aquesta sessió, `addMicrosoft` rebutja al preload; veure `11-progres-fase2.md`
// §6.

export const accounts = signal<Account[]>([])
export const selectedUuid = signal<string | null>(null)
/** `false` fins que `loadAccounts()` respon el primer cop: l'arrencada (2.6) no pot decidir entre
 * «benvinguda» i «Inici» sense saber si hi ha comptes. */
export const accountsLoaded = signal(false)

export const selectedAccount = computed<Account | null>(() =>
  accounts.value.find((a) => a.uuid === selectedUuid.value) ?? null
)

export async function loadAccounts(): Promise<void> {
  try {
    const result = await hellmc.auth.accounts()
    accounts.value = result.accounts
    selectedUuid.value = result.selectedUuid
  } finally {
    accountsLoaded.value = true
  }
}

export async function selectAccount(uuid: string): Promise<void> {
  await hellmc.auth.select(uuid)
  selectedUuid.value = uuid
}

export async function addOfflineAccount(username: string): Promise<Account> {
  const account = await hellmc.auth.addOffline(username)
  await loadAccounts()
  return account
}

export async function removeAccount(uuid: string): Promise<void> {
  await hellmc.auth.remove(uuid)
  await loadAccounts()
}
