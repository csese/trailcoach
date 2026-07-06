/**
 * Server-side credential encryption (AES-256-GCM).
 *
 * The key (CREDENTIAL_ENCRYPTION_KEY) is a 64-char hex string
 * (generate with: openssl rand -hex 32) and MUST only exist in
 * server environments. It is never shipped to the browser.
 *
 * Fails closed: missing/invalid key throws — no plaintext fallback.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import CryptoJS from 'crypto-js'

const ALG = 'aes-256-gcm'

function getKey() {
  const hex = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (openssl rand -hex 32)'
    )
  }
  return Buffer.from(hex, 'hex')
}

export function encryptCredentials(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Nothing to encrypt')
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALG, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(obj), 'utf8'),
    cipher.final()
  ])
  return {
    v: 2,
    alg: ALG,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64')
  }
}

export function decryptCredentials(stored) {
  if (!stored) return null

  // Current format: AES-256-GCM
  if (stored.v === 2 && stored.alg === ALG && stored.data) {
    const key = getKey()
    const decipher = createDecipheriv(ALG, key, Buffer.from(stored.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(stored.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(stored.data, 'base64')),
      decipher.final()
    ])
    return JSON.parse(plaintext.toString('utf8'))
  }

  // Legacy format: crypto-js AES (passphrase mode). Read-only support so
  // existing rows keep syncing; they are re-encrypted with GCM on next save.
  if (stored.encrypted === true && stored.data) {
    const keyStr = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim()
    if (!keyStr) throw new Error('CREDENTIAL_ENCRYPTION_KEY not set — cannot decrypt legacy credentials')
    const json = CryptoJS.AES.decrypt(stored.data, keyStr).toString(CryptoJS.enc.Utf8)
    if (!json) throw new Error('Legacy credential decryption failed')
    return JSON.parse(json)
  }

  // Legacy plaintext rows (written before encryption was configured).
  // Read-only support; new writes are always encrypted.
  console.warn('[crypto] Read legacy plaintext credentials — will be re-encrypted on next save')
  return stored
}

export function isEncrypted(credentials) {
  return credentials?.v === 2 && !!credentials?.data
}
