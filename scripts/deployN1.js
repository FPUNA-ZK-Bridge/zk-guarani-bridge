import hre from "hardhat";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { HDNodeWallet } from "ethers/wallet";
import { Mnemonic } from "ethers";
import "dotenv/config";
import { isLocal } from "../bridge-env.js";

function isLocalNetwork(name) {
  return isLocal() || name.startsWith("local") || name.startsWith("docker") || name === "hardhat";
}

function isSafeLocalRpcUrl(url) {
  if (!url) return false;
  // Si es un nodo local (geth/anvil/hardhat) no hay API keys que filtrar.
  return (
    url.includes("127.0.0.1") ||
    url.includes("localhost") ||
    url.includes("0.0.0.0")
  );
}

function readExistingBridgeConfig() {
  // Preferimos el alias fijo en raíz (lo usamos como fuente de verdad)
  const candidates = ["bridge-config.json", "public/bridge-config.json"];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      // ignore
    }
  }
  return null;
}

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);

  // Safety: evitar deploy accidental a un RPC default si faltan env vars
  if (networkName === "ephemery" && !process.env.EPHEMERY_PRIVATE_KEY) {
    throw new Error(
      "Falta EPHEMERY_PRIVATE_KEY. Configura EPHEMERY_PRIVATE_KEY y EPHEMERY_RPC_URL antes de desplegar en ephemery."
    );
  }

  // Deploy L1 contracts (Token + Sender)
  const Token = await hre.ethers.getContractFactory("GuaraniToken");
  const token = await Token.deploy(hre.ethers.parseUnits("1000000", 18));
  await token.waitForDeployment();

  const Sender = await hre.ethers.getContractFactory("Sender");
  const sender = await Sender.deploy(token.target);
  await sender.waitForDeployment();

  console.log("Token:", token.target);
  console.log("Sender:", sender.target);

  // ✅ Archivo usado por relayer/scripts (siempre)
  writeFileSync(
    "deploy-N1.json",
    JSON.stringify({ token: token.target, sender: sender.target }, null, 2)
  );

  // chainId actual
  const { chainId } = await hre.ethers.provider.getNetwork();
  const chainIdHex = "0x" + chainId.toString(16);

  const existingCfg = readExistingBridgeConfig();
  const existingL2 = existingCfg?.l2 && typeof existingCfg.l2 === "object" ? existingCfg.l2 : null;

  // ✅ Archivo para el front (principal)
  const bridgeConfig = {
    mode: networkName, // "localN1" | "ephemery" | ...
    l1: {
      chainId: Number(chainId),
      chainIdHex,
      // Evitar exponer API keys de RPC en entornos no-local
      rpc:
        isLocalNetwork(networkName) || isSafeLocalRpcUrl(hre.network.config.url)
          ? hre.network.config.url ?? null
          : null,
      token: token.target,
      sender: sender.target,
    },
    // ✅ preserva L2 si ya estaba configurado (para no romper el frontend al redeployar N1)
    l2:
      existingL2 ??
      {
        chainId: null,
        chainIdHex: null,
        rpc: null,
        token: null,
        receiver: null,
      },
    monitorAccounts: isLocalNetwork(networkName)
      ? [
          // las 10 primeras hardhat
          "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
          "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
          "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
          "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
          "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
          "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
          "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
          "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
          "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
        ]
      : [
          // en ephemery: al menos el deployer
          deployer.address,
        ],
  };

  writeFileSync(
    `bridge-config-${networkName}.json`,
    JSON.stringify(bridgeConfig, null, 2)
  );

  // opcional: también crear un alias fijo que el front siempre lea
  writeFileSync("bridge-config.json", JSON.stringify(bridgeConfig, null, 2));

  // ✅ el frontend sirve `/public`, así que también dejamos una copia ahí
  writeFileSync(
    `public/bridge-config-${networkName}.json`,
    JSON.stringify(bridgeConfig, null, 2)
  );
  writeFileSync(
    "public/bridge-config.json",
    JSON.stringify(bridgeConfig, null, 2)
  );

  // ✅ accounts.json solo en local
  if (isLocalNetwork(networkName)) {
    const mnemonic = Mnemonic.fromPhrase(
      "test test test test test test test test test test test junk"
    );

    const accountData = [];
    for (let i = 0; i < 20; i++) {
      const wallet = HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${i}`);
      accountData.push({
        name: `account#${i}`,
        address: wallet.address,
        privateKey: wallet.privateKey,
      });
    }

    writeFileSync("accounts.json", JSON.stringify(accountData, null, 2));
    console.log("accounts.json generado (solo local).");
  } else {
    console.log("No se genera accounts.json (no-local).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
