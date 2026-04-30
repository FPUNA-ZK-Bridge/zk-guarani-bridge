// relayer/relayer.js  (VERSIÓN ROBUSTA)
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import "dotenv/config";
import { config as bridgeEnv, isLocal } from "../bridge-env.js";
import accountManager from "../utils/accounts.js";
import { fetchBeaconData } from "../generate_data/index.js";
import { transformData } from "../generate_data/transformData.js";

// RPCs resueltos desde bridge-env (override con env vars si están definidos)
const RPC_URL_N1 = process.env.RPC_URL_N1 || bridgeEnv.n1.rpc;
const RPC_URL_N2 = process.env.RPC_URL_N2 || bridgeEnv.n2.rpc;
const PRIVATE_KEY_RELAYER = bridgeEnv.privateKeyRelayer || process.env.PRIVATE_KEY_RELAYER;

const {
  START_BLOCK_N1 = 0,
  N2_GAS_LIMIT,
  N2_GAS_PRICE_GWEI,
  N2_MAX_FEE_GWEI,
  N2_PRIORITY_FEE_GWEI,
} = process.env;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mustReadJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`❌ No pude leer ${path}: ${e.message}`);
    console.error("   Asegúrate de que el archivo exista y sea JSON válido.");
    process.exit(1);
  }
}

function mustHave(obj, key, file) {
  const v = obj?.[key];
  if (!v || typeof v !== "string") {
    console.error(`❌ ${file} no contiene '${key}' válido. Valor actual: ${String(v)}`);
    console.error(`   Contenido de ${file}:`, JSON.stringify(obj, null, 2));
    console.error("   Solución: re-ejecuta el deploy correspondiente para regenerar los JSON.");
    process.exit(1);
  }
  return v;
}

const n1 = mustReadJson("deploy-N1.json");
const n2 = mustReadJson("deploy-N2.json");

const SENDER_N1 = mustHave(n1, "sender", "deploy-N1.json");
const TOKEN_N1 = mustHave(n1, "token", "deploy-N1.json");
const RECEIVER_N2 = mustHave(n2, "receiver", "deploy-N2.json");
const TOKEN_N2 = mustHave(n2, "token", "deploy-N2.json");

/* ---------- providers ---------- */
const providerN1 = RPC_URL_N1?.startsWith("ws")
  ? new ethers.WebSocketProvider(RPC_URL_N1)
  : new ethers.JsonRpcProvider(RPC_URL_N1);

const providerN2 = new ethers.JsonRpcProvider(RPC_URL_N2);

const signerN2 = PRIVATE_KEY_RELAYER
? new ethers.Wallet(PRIVATE_KEY_RELAYER, providerN2)
: accountManager.getRelayerSigner(RPC_URL_N2);





/* ---------- contratos ---------- */
const senderAbi = [
    {
      "inputs": [
        {
          "internalType": "contract GuaraniToken",
          "name": "_token",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "from",
          "type": "address"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "to",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "Locked",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "recipientL2",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "name": "lock",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "lockedBalance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "nonce",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "token",
      "outputs": [
        {
          "internalType": "contract GuaraniToken",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ];
const receiverAbi = [
    {
      "inputs": [
        { "internalType": "contract GuaraniToken", "name": "_token", "type": "address" },
        { "internalType": "address", "name": "_relayer", "type": "address" },
        { "internalType": "contract Groth16Verifier", "name": "_verifier", "type": "address" }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "uint256", "name": "id", "type": "uint256" },
        { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
      ],
      "name": "Minted",
      "type": "event"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "id", "type": "uint256" },
        { "internalType": "address", "name": "to", "type": "address" },
        { "internalType": "uint256", "name": "amount", "type": "uint256" },
        { "internalType": "uint256[2]", "name": "_pA", "type": "uint256[2]" },
        { "internalType": "uint256[2][2]", "name": "_pB", "type": "uint256[2][2]" },
        { "internalType": "uint256[2]", "name": "_pC", "type": "uint256[2]" },
        { "internalType": "uint256[4]", "name": "_pubSignals", "type": "uint256[4]" }
      ],
      "name": "mintRemote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "name": "processed",
      "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "relayer",
      "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "token",
      "outputs": [{ "internalType": "contract GuaraniToken", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "verifier",
      "outputs": [{ "internalType": "contract Groth16Verifier", "name": "", "type": "address" }],
      "stateMutability": "view",
      "type": "function"
    }
  ];

const sender = new ethers.Contract(SENDER_N1, senderAbi, providerN1);
const receiver = new ethers.Contract(RECEIVER_N2, receiverAbi, signerN2);
const receiverListen = new ethers.Contract(RECEIVER_N2, receiverAbi, providerN2);

const signerN2Address = await signerN2.getAddress().catch(() => null);
console.log("=== Relayer config ===");
console.log("N1 RPC:", RPC_URL_N1);
console.log("N2 RPC:", RPC_URL_N2);
console.log("N1 Sender:", SENDER_N1);
console.log("N2 Receiver:", RECEIVER_N2);
console.log("Relayer signer (N2):", signerN2Address ?? "(no signer address)");

try {
  const n1Net = await providerN1.getNetwork();
  const n2Net = await providerN2.getNetwork();
  console.log("N1 chainId:", Number(n1Net.chainId));
  console.log("N2 chainId:", Number(n2Net.chainId));
} catch (e) {
  console.log("⚠️ No pude leer chainId de alguno de los RPC:", e.message);
}

try {
  const expectedRelayer = await receiver.relayer();
  console.log("Receiver.relayer (esperado):", expectedRelayer);
  if (signerN2Address && expectedRelayer.toLowerCase() !== signerN2Address.toLowerCase()) {
    console.error("❌ El signer del relayer NO coincide con Receiver.relayer().");
    console.error("   Solución: usa PRIVATE_KEY_RELAYER que corresponda a la address configurada al desplegar Receiver.");
    process.exit(1);
  }
} catch (e) {
  console.log("⚠️ No pude leer receiver.relayer():", e.message);
}

console.log("Relayer escuchando Locked()…");

function buildN2TxOverrides() {
  const overrides = {};

  if (N2_GAS_LIMIT) {
    try {
      overrides.gasLimit = BigInt(N2_GAS_LIMIT);
    } catch {
      console.log("⚠️ N2_GAS_LIMIT inválido (se ignora):", N2_GAS_LIMIT);
    }
  }

  // Prefer explicit legacy gasPrice if provided
  if (N2_GAS_PRICE_GWEI) {
    try {
      overrides.gasPrice = ethers.parseUnits(String(N2_GAS_PRICE_GWEI), "gwei");
      return overrides;
    } catch {
      console.log("⚠️ N2_GAS_PRICE_GWEI inválido (se ignora):", N2_GAS_PRICE_GWEI);
    }
  }

  // Otherwise, EIP-1559 overrides (both optional)
  if (N2_MAX_FEE_GWEI) {
    try {
      overrides.maxFeePerGas = ethers.parseUnits(String(N2_MAX_FEE_GWEI), "gwei");
    } catch {
      console.log("⚠️ N2_MAX_FEE_GWEI inválido (se ignora):", N2_MAX_FEE_GWEI);
    }
  }
  if (N2_PRIORITY_FEE_GWEI) {
    try {
      overrides.maxPriorityFeePerGas = ethers.parseUnits(String(N2_PRIORITY_FEE_GWEI), "gwei");
    } catch {
      console.log("⚠️ N2_PRIORITY_FEE_GWEI inválido (se ignora):", N2_PRIORITY_FEE_GWEI);
    }
  }

  return overrides;
}

async function printN2FundsHint(context = "") {
  try {
    const addr = signerN2Address ?? (await signerN2.getAddress());
    const bal = await providerN2.getBalance(addr);
    console.log(`💸 N2 balance relayer ${addr}: ${ethers.formatEther(bal)} (native) ${context}`.trim());
  } catch {
    // ignore
  }
}

// ---------- ZK proof generation ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.resolve(__dirname, "../circom/verify_header/verify_header.wasm");
const ZKEY_PATH = path.resolve(__dirname, "../circom/verify_header/verify_header_0001.zkey");
const CIRCOM_INPUT_DIR = path.resolve(__dirname, "../circom/verify_header");

const BEACON_NODE_URL = process.env.BEACON_NODE_URL || "http://localhost:5052";

/**
 * Construye el input para el circuito VerifyHeaderMock(512, 7):
 *   - signing_root[32]      (público)
 *   - pubkeys[512][2][7]    (privado)
 *   - pubkeybits[512]       (público)
 *
 * 1. Llama al beacon node para obtener la data cruda (sync committee, header, firma)
 * 2. Transforma la data al formato que espera el circuito
 * 3. Mapea los nombres de campos de transformData al esquema del circuito
 */
async function buildCircomInput(transactionHash) {
  if (!transactionHash) {
    throw new Error("Se requiere transactionHash para construir el input circom");
  }

  console.log(`📡 Consultando beacon node usando tx hash ${transactionHash}...`);
  const receipt = await providerN1.getTransactionReceipt(transactionHash);
  if (!receipt?.blockHash) {
    throw new Error(`No pude resolver el bloque de la tx ${transactionHash}`);
  }

  console.log(`   Execution block hash: ${receipt.blockHash}`);
  const beaconData = await fetchBeaconData(BEACON_NODE_URL, {
    transactionHash,
    executionBlockHash: receipt.blockHash,
  });

  const rawPath = path.join(CIRCOM_INPUT_DIR, "beacon_data.json");
  fs.writeFileSync(rawPath, JSON.stringify(beaconData, null, 2));
  console.log(`📁 Data cruda del beacon guardada en: ${rawPath}`);

  console.log("🔄 Transformando data al formato circom...");
  const circomInput = await transformData(beaconData);

  const inputPath = path.join(CIRCOM_INPUT_DIR, "input.json");
  fs.writeFileSync(inputPath, JSON.stringify(circomInput, null, 2));
  console.log(`📁 Input circom guardado en: ${inputPath}`);

  return circomInput;
}

async function generateProof(id, sourceTxHash) {
  console.log(`🔐 Generando prueba ZK para id=${id}...`);

  // 1. Construir input del circuito desde el beacon node
  const circomInput = await buildCircomInput(sourceTxHash);

  // 2. Generar la prueba con VerifyHeaderMock(512, 7)
  console.log("⏳ snarkjs.groth16.fullProve (puede tardar, ~1M constraints)...");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circomInput,
    WASM_PATH,
    ZKEY_PATH
  );
  console.log(`✅ Proof generado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`   Public signals: ${publicSignals.length} (esperado: 4)`);

  // 3. Guardar proof y public signals para referencia
  fs.writeFileSync(path.join(CIRCOM_INPUT_DIR, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(CIRCOM_INPUT_DIR, "public.json"), JSON.stringify(publicSignals, null, 2));
  console.log("📁 proof.json y public.json guardados en circom/");

  // 4. Formatear proof para el contrato Solidity
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ];
  const pC = [proof.pi_c[0], proof.pi_c[1]];
  const pubSignals = publicSignals.map(String);

  return { pA, pB, pC, pubSignals };
}

// Función para manejar eventos Locked con reintentos
const handleLockedEvent = async (id, from, to, amount, retries = 3, sourceTxHash = null) => {
  try {
    console.log(
      `🔒  id=${id}  from=${from.substring(0, 6)}… -> ${to.substring(
        0,
        6
      )}…  amount=${ethers.formatUnits(amount, 18)}`
    );
    if (sourceTxHash) {
      console.log(`🧾 Locked tx hash: ${sourceTxHash}`);
    }

    // Verificar si ya fue procesado en N2
    const alreadyProcessed = await receiver.processed(id);
    if (alreadyProcessed) {
      console.log(`⏭️  id=${id} ya fue procesado (replay), saltando…`);
      return;
    }

    // Generar input circom (beacon node) + prueba ZK antes de mintear
    const { pA, pB, pC, pubSignals } = await generateProof(id, sourceTxHash);

    const overrides = buildN2TxOverrides();
    const tx = await receiver.mintRemote(id, to, amount, pA, pB, pC, pubSignals, overrides);
    console.log(`⛓️   mintRemote tx: ${tx.hash}`);
    await tx.wait();
    console.log("✅  confirmado\n");
  } catch (error) {
    console.log(`❌ Error en handleLockedEvent: ${error.message}`);

    const msg = String(error?.message ?? "");
    const insufficient =
      error?.code === "INSUFFICIENT_FUNDS" ||
      msg.toLowerCase().includes("insufficient funds");

    if (insufficient) {
      await printN2FundsHint("(necesitás fondear esta cuenta en N2 para pagar gas)");
      console.log(
        "➡️ Solución: envía fondos nativos en N2 al relayer (address arriba) o define fees más bajos:\n" +
          "   - N2_GAS_PRICE_GWEI=...\n" +
          "   - o N2_MAX_FEE_GWEI=... y N2_PRIORITY_FEE_GWEI=...\n" +
          "   - opcional N2_GAS_LIMIT=...\n"
      );
      console.log(`💥 Error permanente para id ${id} (no se reintenta por fondos insuficientes)`);
      return;
    }

    if (retries > 0) {
      console.log(`🔄 Reintentando... (${retries} intentos restantes)`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Esperar 2s
      return handleLockedEvent(id, from, to, amount, retries - 1);
    } else {
      console.log(`💥 Error permanente para id ${id}`);
    }
  }
};

// Event listener mejorado con manejo de errores
try {


  // En algunos RPC HTTP (o nodos con filtros efímeros) `eth_newFilter/eth_getFilterChanges`
  // puede fallar con "filter not found". Para hacerlo robusto:
  // - si N1 es WS, usamos subscriptions
  // - si N1 es HTTP, hacemos polling por logs (eth_getLogs)
  const isWsN1 = RPC_URL_N1?.startsWith("ws");

  if (isWsN1) {
    sender.on(sender.getEvent("Locked"), async (id, from, to, amount, event) => {
      const sourceTxHash = event?.log?.transactionHash ?? event?.transactionHash ?? null;
      await handleLockedEvent(id, from, to, amount, 3, sourceTxHash);
    });
  } else {
    const iface = new ethers.Interface(senderAbi);
    const topic0 = iface.getEvent("Locked").topicHash;

    let fromBlock = Number(START_BLOCK_N1 || 0);
    if (!fromBlock) {
      // default: arrancar desde el bloque actual para evitar escanear toda la historia por accidente
      fromBlock = await providerN1.getBlockNumber();
    }

    console.log(`🔎 N1 HTTP mode: scanning logs from block ${fromBlock}…`);

    const pollMs = 4000;
    // loop infinito de polling
    (async () => {
      while (true) {
        try {
          const latest = await providerN1.getBlockNumber();
          if (latest >= fromBlock) {
            const logs = await providerN1.getLogs({
              address: SENDER_N1,
              fromBlock,
              toBlock: latest,
              topics: [topic0],
            });

            for (const log of logs) {
              try {
                const parsed = iface.parseLog(log);
                const { id, from, to, amount } = parsed.args;
                await handleLockedEvent(id, from, to, amount, 3, log.transactionHash ?? null);
              } catch (e) {
                console.log(`⚠️ No pude parsear/procesar log Locked: ${e.message}`);
              }
            }

            fromBlock = latest + 1;
          }
        } catch (e) {
          console.log(`🚨 Error polling logs N1: ${e.message}`);
          // backoff corto
          await sleep(2000);
        }

        await sleep(pollMs);
      }
    })();
  }
  
  // Manejo de errores del provider
  providerN1.on("error", (error) => {
    console.log("🚨 Error en provider N1:", error.message);
  });

  providerN2.on("error", (error) => {
    console.log("🚨 Error en provider N2:", error.message);
  });

} catch (error) {
  console.log("💥 Error crítico al configurar event listeners:", error.message);
  process.exit(1);
}

// Listener de Minted (N2): algunos RPC HTTP no soportan bien filtros -> usar polling por logs.
try {
  const isWsN2 = RPC_URL_N2?.startsWith("ws");
  if (isWsN2) {
    receiverListen.on(receiverListen.getEvent("Minted"), async (id, to, amount, event) => {
      const mintedTxHash = event?.log?.transactionHash ?? event?.transactionHash ?? null;
      console.log(
        `💰  id=${id}  to=${to.substring(0, 6)}…  amount=${ethers.formatUnits(
          amount,
          18
        )}`
      );
      if (mintedTxHash) {
        console.log(`🧾 Minted tx hash: ${mintedTxHash}`);
      }
      console.log("SE TRANSFIRIO ( evento Minted )");
    });
  } else {
    const iface2 = new ethers.Interface(receiverAbi);
    const topic0Minted = iface2.getEvent("Minted").topicHash;
    let fromBlockN2 = await providerN2.getBlockNumber();
    const pollMsN2 = 6000;
    console.log(`🔎 N2 HTTP mode: scanning Minted logs from block ${fromBlockN2}…`);

    (async () => {
      while (true) {
        try {
          const latest = await providerN2.getBlockNumber();
          if (latest >= fromBlockN2) {
            const logs = await providerN2.getLogs({
              address: RECEIVER_N2,
              fromBlock: fromBlockN2,
              toBlock: latest,
              topics: [topic0Minted],
            });

            for (const log of logs) {
              try {
                const parsed = iface2.parseLog(log);
                const { id, to, amount } = parsed.args;
                console.log(
                  `💰  id=${id}  to=${String(to).substring(0, 6)}…  amount=${ethers.formatUnits(
                    amount,
                    18
                  )}`
                );
                if (log.transactionHash) {
                  console.log(`🧾 Minted tx hash: ${log.transactionHash}`);
                }
              } catch (e) {
                console.log(`⚠️ No pude parsear log Minted: ${e.message}`);
              }
            }

            fromBlockN2 = latest + 1;
          }
        } catch (e) {
          console.log(`🚨 Error polling logs N2 (Minted): ${e.message}`);
          await sleep(2000);
        }

        await sleep(pollMsN2);
      }
    })();
  }
} catch (e) {
  console.log("⚠️ No pude configurar listener/polling de Minted:", e.message);
}

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  if (reason?.message?.includes('results is not iterable')) {
    console.log('⚠️ Warning: ethers event polling issue (ignorado)');
    return; // Ignorar este error específico
  }
  if (reason?.message?.includes('filter not found')) {
    console.log('⚠️ Warning: RPC filter not found (ignorado)');
    return;
  }
  console.log('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  if (error?.message?.includes('results is not iterable')) {
    console.log('⚠️ Warning: ethers event polling issue (ignorado)');
    return; // Ignorar este error específico
  }
  if (error?.message?.includes('filter not found')) {
    console.log('⚠️ Warning: RPC filter not found (ignorado)');
    return;
  }
  console.log('🚨 Uncaught Exception:', error.message);
});
