import { readFileSync } from "fs";
import { ethers } from "ethers";

/**
 * Helper para manejar cuentas de Hardhat de forma centralizada
 */
class AccountManager {
  constructor() {
    this.accounts = null;
    this.loadAccounts();
  }

  /**
   * Carga las cuentas desde accounts.json
   */
  loadAccounts() {
    try {
      this.accounts = JSON.parse(readFileSync("accounts.json", "utf8"));
    } catch (error) {
      throw new Error("No se pudo cargar accounts.json. Ejecuta el deploy primero.");
    }
  }

  /**
   * Obtiene una cuenta por índice
   * @param {number} index - Índice de la cuenta (0-19)
   * @returns {Object} Objeto con name, address, privateKey
   */
  getAccount(index) {
    if (!this.accounts || index < 0 || index >= this.accounts.length) {
      throw new Error(`Cuenta ${index} no encontrada. Índices válidos: 0-${this.accounts.length - 1}`);
    }
    return this.accounts[index];
  }

  /**
   * Obtiene un signer de ethers para una cuenta específica
   * @param {number} index - Índice de la cuenta
   * @param {string} rpcUrl - URL del RPC (opcional, default: localhost L1)
   * @returns {ethers.Wallet} Wallet/Signer conectado
   */
  getSigner(index, rpcUrl = "http://127.0.0.1:8545") {
    const account = this.getAccount(index);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    return new ethers.Wallet(account.privateKey, provider);
  }

  /**
   * Obtiene múltiples cuentas
   * @param {number} count - Número de cuentas a obtener (default: 5)
   * @returns {Array} Array con las primeras 'count' cuentas
   */
  getAccounts(count = 5) {
    return this.accounts.slice(0, count);
  }

  /**
   * Obtiene todas las cuentas disponibles
   * @returns {Array} Array con todas las cuentas
   */
  getAllAccounts() {
    return this.accounts;
  }

  /**
   * Obtiene la dirección de una cuenta por índice
   * @param {number} index - Índice de la cuenta
   * @returns {string} Dirección de la cuenta
   */
  getAddress(index) {
    return this.getAccount(index).address;
  }

  /**
   * Obtiene la private key de una cuenta por índice
   * @param {number} index - Índice de la cuenta
   * @returns {string} Private key de la cuenta
   */
  getPrivateKey(index) {
    return this.getAccount(index).privateKey;
  }

  /**
   * Roles predefinidos para fácil acceso
   */
  get deployer() {
    return this.getAccount(0); // account#0
  }

  get relayer() {
    return this.getAccount(1); // account#1
  }

  get user1() {
    return this.getAccount(2); // account#2
  }

  get user2() {
    return this.getAccount(3); // account#3
  }

  /**
   * Obtiene signers para roles específicos
   */
  getDeployerSigner(rpcUrl = "http://127.0.0.1:8545") {
    return this.getSigner(0, rpcUrl);
  }

  getRelayerSigner(rpcUrl = "http://127.0.0.1:9545") {
    return this.getSigner(1, rpcUrl);
  }

  getUserSigner(userIndex = 1, rpcUrl = "http://127.0.0.1:8545") {
    return this.getSigner(userIndex + 1, rpcUrl); // user1 = account#2, user2 = account#3, etc.
  }

  /**
   * Información de debugging
   */
  listAccounts() {
    console.log("📋 Cuentas disponibles:");
    this.accounts.forEach((account, index) => {
      console.log(`  ${index}: ${account.address} (${account.name})`);
    });
  }
}

// Exportar instancia singleton
const accountManager = new AccountManager();
export default accountManager;

// También exportar funciones directas para mayor comodidad
export const getAccount = (index) => accountManager.getAccount(index);
export const getSigner = (index, rpcUrl) => accountManager.getSigner(index, rpcUrl);
export const getAddress = (index) => accountManager.getAddress(index);
export const getPrivateKey = (index) => accountManager.getPrivateKey(index); 
export const getRelayer = () => accountManager.relayer;