// scripts/deployN2.js (L2)
import hre from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "fs";
import "dotenv/config";
import { isLocal } from "../bridge-env.js";

function isSafeLocalRpcUrl(url) {
  if (!url) return false;
  return (
    url.includes("127.0.0.1") ||
    url.includes("localhost") ||
    url.includes("0.0.0.0") ||
    // útil cuando el script corre dentro de Docker y apunta al host (mac/windows)
    url.includes("host.docker.internal")
  );
}

function getBrowserRpcUrlForNetwork(networkName, defaultUrl) {
  // bridge-config.json lo consume el navegador, no los contenedores.
  if (!networkName?.startsWith("docker")) return defaultUrl;
  if (networkName === "dockerN1") return process.env.BROWSER_RPC_URL_N1 ?? "http://127.0.0.1:8546";
  if (networkName === "dockerN2") return process.env.BROWSER_RPC_URL_N2 ?? "http://127.0.0.1:9545";
  return defaultUrl;
}

function getBrowserRpcUrlForEphemery(_defaultUrl) {
  // El deploy puede usar EPHEMERY_RPC_URL=host.docker.internal:8545 desde Docker,
  // pero el browser debe usar localhost/127.0.0.1 para llegar al RPC publicado.
  return process.env.BROWSER_EPHEMERY_RPC_URL ?? "http://127.0.0.1:8545";
}

function looksLikeRpcContainsApiKey(url) {
  if (!url) return false;
  // Heurística simple para evitar volcar keys típicas en bridge-config.json
  // (Infura/Alchemy/query params comunes)
  return (
    url.includes("infura.io/v3/") ||
    url.includes("alchemy.com/v2/") ||
    url.includes("api-key=") ||
    url.includes("apikey=") ||
    url.includes("apiKey=") ||
    url.includes("key=") ||
    url.includes("token=")
  );
}

function getBrowserRpcUrlForPublicNetwork(networkName, rpcUrl) {
  // Para redes públicas (sepolia, mainnet, etc) NO queremos escribir automáticamente
  // el RPC al bridge-config.json porque suele incluir API keys (Infura/Alchemy).
  // Si el usuario quiere monitoreo desde el browser, debe proveer un endpoint "public"
  // o un proxy propio explícitamente vía env:
  //   BROWSER_RPC_URL_SEPOLIA=https://rpc.sepolia.org (o tu proxy)
  if (!networkName) return null;
  const key = `BROWSER_RPC_URL_${String(networkName).toUpperCase()}`;
  if (process.env[key]) return process.env[key];

  // "Reconocer" hardhat.config.js: si NO hay BROWSER_RPC_URL_<NET>,
  // podemos usar el RPC de Hardhat SI parece no contener API keys.
  if (rpcUrl && !looksLikeRpcContainsApiKey(rpcUrl)) return rpcUrl;

  return null;
}

function resolveBrowserRpcUrl(networkName, rpcUrl) {
  if (!rpcUrl) return null;
  if (networkName === "ephemery") return getBrowserRpcUrlForEphemery(rpcUrl);
  if (networkName?.startsWith("docker")) return getBrowserRpcUrlForNetwork(networkName, rpcUrl);
  if (networkName?.startsWith("local") || networkName === "hardhat") return rpcUrl;

  // Public networks (e.g. sepolia): only if explicitly provided
  return getBrowserRpcUrlForPublicNetwork(networkName, rpcUrl);
}

function shouldWriteRpcToConfig(networkName, rpcUrl) {
  // Evitar exponer URLs con API keys en redes públicas,
  // pero en local/docker/ephemery es seguro y útil para el frontend.
  if (!networkName) return false;
  if (networkName.startsWith("local")) return true;
  if (networkName.startsWith("docker")) return true;
  if (networkName === "hardhat") return true;
  if (networkName === "ephemery") return true;
  // Public networks: only if explicitly provided for browser monitoring
  return Boolean(getBrowserRpcUrlForPublicNetwork(networkName, rpcUrl)) || isSafeLocalRpcUrl(rpcUrl);
}

function getRelayerAddress() {
  // Prefer explícito por env
  if (process.env.RELAYER_ADDRESS) return process.env.RELAYER_ADDRESS;

  // O derivado desde la PK del relayer (recomendado para Sepolia/otros)
  if (process.env.PRIVATE_KEY_RELAYER) {
    return new hre.ethers.Wallet(process.env.PRIVATE_KEY_RELAYER).address;
  }

  // Fallback local: accounts.json (si existe) -> account#1
  if (existsSync("accounts.json")) {
    const accounts = JSON.parse(readFileSync("accounts.json", "utf8"));
    if (Array.isArray(accounts) && accounts[1]?.address) return accounts[1].address;
  }

  throw new Error(
    "No pude determinar el relayer. Setea RELAYER_ADDRESS o PRIVATE_KEY_RELAYER (o genera accounts.json en local)."
  );
}

function getConfigPath(networkName) {
  // Preferimos el alias fijo si existe (es el que usa el frontend)
  if (existsSync("bridge-config.json")) return "bridge-config.json";
  // Si no existe, caer al específico por red (por si el user no quiere alias)
  const perNetwork = `bridge-config-${networkName}.json`;
  return existsSync(perNetwork) ? perNetwork : "bridge-config.json";
}

function upsertBridgeConfig(networkName, l2Patch) {
  const cfgPath = getConfigPath(networkName);
  let cfg = {
    mode: networkName,
    l1: { chainId: null, chainIdHex: null, rpc: null, token: null, sender: null },
    l2: { chainId: null, chainIdHex: null, rpc: null, token: null, receiver: null },
    monitorAccounts: [],
  };

  if (existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    } catch {
      // si está corrupto, lo pisamos con defaults
    }
  }

  cfg.mode = cfg.mode ?? networkName;
  cfg.l2 = { ...(cfg.l2 ?? {}), ...l2Patch };

  // Guardar en raíz y en /public (para que fetch("./bridge-config.json") funcione)
  const out = JSON.stringify(cfg, null, 2);
  writeFileSync(`bridge-config-${networkName}.json`, out);
  writeFileSync("bridge-config.json", out);
  writeFileSync(`public/bridge-config-${networkName}.json`, out);
  writeFileSync("public/bridge-config.json", out);
}

async function main() {
  const networkName = hre.network.name;
  const signers = await hre.ethers.getSigners();
  const deployer = signers[1] ?? signers[0];
  const relayerAddr = getRelayerAddress();

  console.log("\n=== L2 DEPLOY ===");
  console.log("Network :", networkName);
  console.log("Deployer:", deployer.address);
  console.log("Relayer :", relayerAddr);

  // ─────────────────  TOKEN  ─────────────────
  const Token = await hre.ethers.getContractFactory("GuaraniToken");
  const token = await Token.connect(deployer).deploy(0);
  await token.waitForDeployment();

  // ─────────────────  VERIFIER  ──────────────
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.connect(deployer).deploy();
  await verifier.waitForDeployment();
  console.log("Verifier :", verifier.target);

  // ─────────────────  RECEIVER  ──────────────
  const Receiver = await hre.ethers.getContractFactory("Receiver");
  const receiver = await Receiver.connect(deployer).deploy(token.target, relayerAddr, verifier.target);
  await receiver.waitForDeployment();

  // otorga rol de minter al Receiver (deployer es el owner del token)
  await token.connect(deployer).grantRole(await token.MINTER_ROLE(), receiver.target);

  console.log("GUA N2   :", token.target);
  console.log("Receiver :", receiver.target);

  writeFileSync(
    "deploy-N2.json",
    JSON.stringify(
      { token: token.target, receiver: receiver.target, verifier: verifier.target, relayer: relayerAddr },
      null,
      2
    )
  );

  // Completar bridge-config.json con L2 real
  const { chainId } = await hre.ethers.provider.getNetwork();
  const chainIdHex = "0x" + chainId.toString(16);
  const rpcUrl = hre.network.config.url ?? null;

  upsertBridgeConfig(networkName, {
    chainId: Number(chainId),
    chainIdHex,
    rpc: shouldWriteRpcToConfig(networkName, rpcUrl) ? resolveBrowserRpcUrl(networkName, rpcUrl) : null,
    token: token.target,
    receiver: receiver.target,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
