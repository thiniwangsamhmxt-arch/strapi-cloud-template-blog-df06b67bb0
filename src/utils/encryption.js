/**
 * Encryption Utility for Social Media Tokens
 * Provides secure encryption/decryption for OAuth tokens and sensitive data
 */

const CryptoJS = require('crypto-js');

class EncryptionService {
  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me';
    
    if (this.encryptionKey === 'default-encryption-key-change-me') {
      console.warn('⚠️  WARNING: Using default encryption key. Please set ENCRYPTION_KEY in your environment variables.');
    }
  }

  /**
   * Encrypt sensitive data
   * @param {string} text - Text to encrypt
   * @returns {string} - Encrypted text
   */
  encrypt(text) {
    if (!text) return '';
    
    try {
      const encrypted = CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   * @param {string} encryptedText - Encrypted text
   * @returns {string} - Decrypted text
   */
  decrypt(encryptedText) {
    if (!encryptedText) return '';
    
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decrypted) {
        throw new Error('Decryption failed - invalid key or corrupted data');
      }
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt object data
   * @param {Object} data - Object to encrypt
   * @returns {string} - Encrypted JSON string
   */
  encryptObject(data) {
    if (!data) return '';
    
    try {
      const jsonString = JSON.stringify(data);
      return this.encrypt(jsonString);
    } catch (error) {
      console.error('Object encryption error:', error);
      throw new Error('Failed to encrypt object');
    }
  }

  /**
   * Decrypt object data
   * @param {string} encryptedText - Encrypted JSON string
   * @returns {Object} - Decrypted object
   */
  decryptObject(encryptedText) {
    if (!encryptedText) return null;
    
    try {
      const decrypted = this.decrypt(encryptedText);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Object decryption error:', error);
      throw new Error('Failed to decrypt object');
    }
  }

  /**
   * Generate a random encryption key
   * @param {number} length - Key length (default: 32)
   * @returns {string} - Random key
   */
  static generateKey(length = 32) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let key = '';
    
    for (let i = 0; i < length; i++) {
      key += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    return key;
  }

  /**
   * Hash data (one-way)
   * @param {string} text - Text to hash
   * @returns {string} - Hashed text
   */
  hash(text) {
    if (!text) return '';
    
    try {
      return CryptoJS.SHA256(text).toString();
    } catch (error) {
      console.error('Hashing error:', error);
      throw new Error('Failed to hash data');
    }
  }

  /**
   * Verify hashed data
   * @param {string} text - Original text
   * @param {string} hash - Hash to verify against
   * @returns {boolean} - Whether hash matches
   */
  verifyHash(text, hash) {
    if (!text || !hash) return false;
    
    try {
      const textHash = this.hash(text);
      return textHash === hash;
    } catch (error) {
      console.error('Hash verification error:', error);
      return false;
    }
  }
}

module.exports = new EncryptionService();
