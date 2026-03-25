import "@nomicfoundation/hardhat-toolbox";
import { config as bridgeConfig, BRIDGE_ENV } from "./bridge-env.js";

console.log(`[hardhat] BRIDGE_ENV=${BRIDGE_ENV}`);

const { n1, n2 } = bridgeConfig;

export default {
  solidity: "0.8.24",
  networks: {
    // ── Redes dinámicas según BRIDGE_ENV ──
    [n1.networkName]: {
      url: n1.rpc,
      chainId: n1.chainId,
      ...(n1.accounts ? { accounts: n1.accounts } : {}),
      ...(BRIDGE_ENV === "local" ? { mining: { auto: true, interval: 100000 } } : {}),
    },
    [n2.networkName]: {
      url: n2.rpc,
      chainId: n2.chainId,
      ...(n2.accounts ? { accounts: n2.accounts } : {}),
    },

    // ── Redes Docker (siempre disponibles) ──
    dockerN1: {
      url: "http://hardhat-n1:8545",
      chainId: 31337,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
      mining: { auto: true, interval: 100000 },
    },
    dockerN2: {
      url: "http://anvil-n2:9545",
      chainId: 1338,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
  },
};
