// bridge-env.js — Configuración centralizada del puente.
// Solo necesitás definir BRIDGE_ENV=local o BRIDGE_ENV=testnet en .env
// y todo lo demás se resuelve automáticamente.

import "dotenv/config";

const BRIDGE_ENV = process.env.BRIDGE_ENV || "local";

const LOCAL_MNEMONIC =
  "test test test test test test test test test test test junk";

// Presets por entorno
const presets = {
  local: {
    n1: {
      networkName: "localN1",
      rpc: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: {
        mnemonic: LOCAL_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    n2: {
      networkName: "localN2",
      rpc: "http://127.0.0.1:9545",
      chainId: 1338,
      accounts: {
        mnemonic: LOCAL_MNEMONIC,
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    // En local se derivan las PKs del mnemonic; no se necesitan en .env
    privateKeyDeployer: null,
    privateKeyRelayer: null,
    relayerAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // account#1
  },

  testnet: {
    n1: {
      networkName: "ephemery",
      rpc: process.env.EPHEMERY_RPC_URL || "http://localhost:8545",
      chainId: process.env.EPHEMERY_CHAIN_ID
        ? Number(process.env.EPHEMERY_CHAIN_ID)
        : undefined,
      accounts: process.env.EPHEMERY_PRIVATE_KEY
        ? [process.env.EPHEMERY_PRIVATE_KEY]
        : undefined,
    },
    n2: {
      networkName: "blockdag",
      rpc: process.env.BLOCKDAG_RPC_URL || "https://rpc.awakening.bdagscan.com",
      chainId: process.env.BLOCKDAG_CHAIN_ID
        ? Number(process.env.BLOCKDAG_CHAIN_ID)
        : 1043,
      accounts: process.env.BLOCKDAG_PRIVATE_KEY
        ? [process.env.BLOCKDAG_PRIVATE_KEY]
        : undefined,
    },
    privateKeyDeployer: process.env.PRIVATE_KEY_DEPLOYER || null,
    privateKeyRelayer: process.env.PRIVATE_KEY_RELAYER || null,
    relayerAddress:
      process.env.RELAYER_ADDRESS ||
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  },
};

if (!presets[BRIDGE_ENV]) {
  console.error(
    `❌ BRIDGE_ENV="${BRIDGE_ENV}" no es válido. Usa "local" o "testnet".`
  );
  process.exit(1);
}

const config = presets[BRIDGE_ENV];

// Helper: ¿es entorno local?
function isLocal() {
  return BRIDGE_ENV === "local";
}

export default config;
export { BRIDGE_ENV, config, isLocal, presets };
