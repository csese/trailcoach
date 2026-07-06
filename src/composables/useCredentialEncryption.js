/**
 * Encryption utilities for credential storage
 * 
 * Encrypts credentials in the browser before storing in Supabase.
 * The encryption key is stored as a Vercel environment variable
 * (CREDENTIAL_ENCRYPTION_KEY) and is only available to:
 * - The browser (via VITE_ prefix)
 * - The Vercel cron function
 * 
 * This means even if someone accesses the database directly,
 * they cannot read the credentials without the encryption key.
 */

import CryptoJS from 'crypto-js'

// Get encryption key from environment
// In browser: VITE_CREDENTIAL_ENCRYPTION_KEY
// In Node/Vercel: CREDENTIAL_ENCRYPTION_KEY
const getEncryptionKey = () => {
  if (typeof window !== 'undefined') {
    // Browser environment
    return import.meta.env.VITE_CREDENTIAL_ENCRYPTION_KEY || ''
  }
  // Node/Vercel environment
  return process.env.CREDENTIAL_ENCRYPTION_KEY || ''
}

/**
 * Encrypt a credential object before storing in database
 */
export function encryptCredentials(credentials) {
  if (!credentials) return null
  
  const key = getEncryptionKey()
  if (!key) {
    console.warn('No encryption key configured - storing credentials in plaintext!')
    return credentials
  }
  
  try {
    const json = JSON.stringify(credentials)
    const encrypted = CryptoJS.AES.encrypt(json, key).toString()
    return { encrypted: true, data: encrypted }
  } catch (e) {
    console.error('Encryption failed:', e)
    return credentials
  }
}

/**
 * Decrypt credentials retrieved from database
 */
export function decryptCredentials(stored) {
  if (!stored) return null
  
  // Handle already-encrypted format
  if (stored.encrypted && stored.data) {
    const key = getEncryptionKey()
    if (!key) {
      throw new Error('No decryption key available')
    }
    
    try {
      const decrypted = CryptoJS.AES.decrypt(stored.data, key)
      const json = decrypted.toString(CryptoJS.enc.Utf8)
      return JSON.parse(json)
    } catch (e) {
      console.error('Decryption failed:', e)
      throw new Error('Failed to decrypt credentials')
    }
  }
  
  // Handle legacy plaintext (for backward compatibility)
  return stored
}

/**
 * Check if credentials are encrypted
 */
export function isEncrypted(credentials) {
  return credentials?.encrypted === true && !!credentials.data
}

export default { encryptCredentials, decryptCredentials, isEncrypted }
