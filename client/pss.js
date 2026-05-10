// pss.js — Protection Security Safety system
// Легко встраиваемая, модульная система шифрования для мессенджеров

class PSS {
  static async generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    return { publicKey: publicKeyJwk, privateKey: privateKeyJwk };
  }

  static async importPublicKey(publicKeyJwk) {
    return await crypto.subtle.importKey(
      'jwk', publicKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    );
  }

  static async importPrivateKey(privateKeyJwk) {
    return await crypto.subtle.importKey(
      'jwk', privateKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
    );
  }

  static async generateEphemeralKeyPair() {
    return this.generateKeyPair();
  }

  static async deriveSharedSecret(privateKey, publicKey) {
    return await crypto.subtle.deriveBits(
      { name: 'ECDH', public: publicKey }, privateKey, 256
    );
  }

  static async deriveAesKey(sharedSecretBits, salt) {
    const baseKey = await crypto.subtle.importKey('raw', sharedSecretBits, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('pss-messaging') },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async encryptMessage(recipientPublicKeyJwk, message) {
    const ephemeralKeyPair = await this.generateEphemeralKeyPair();
    const recipientPublicKey = await this.importPublicKey(recipientPublicKeyJwk);
    const ephemeralPrivateKey = await this.importPrivateKey(ephemeralKeyPair.privateKey);
    const sharedSecretBits = await this.deriveSharedSecret(ephemeralPrivateKey, recipientPublicKey);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await this.deriveAesKey(sharedSecretBits, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(message)
    );
    return {
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
      salt: this._toBase64(salt),
      iv: this._toBase64(iv),
      ciphertext: this._toBase64(new Uint8Array(ciphertext))
    };
  }

  static async decryptMessage(privateKeyJwk, encryptedPackage) {
    const { ephemeralPublicKey, salt, iv, ciphertext } = encryptedPackage;
    const recipientPrivateKey = await this.importPrivateKey(privateKeyJwk);
    const ephemeralPublic = await this.importPublicKey(ephemeralPublicKey);
    const sharedSecretBits = await this.deriveSharedSecret(recipientPrivateKey, ephemeralPublic);
    const saltBytes = this._fromBase64(salt);
    const aesKey = await this.deriveAesKey(sharedSecretBits, saltBytes);
    const ivBytes = this._fromBase64(iv);
    const ciphertextBytes = this._fromBase64(ciphertext);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes }, aesKey, ciphertextBytes
    );
    return new TextDecoder().decode(decrypted);
  }

  static _toBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  static _fromBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
}

export default PSS;