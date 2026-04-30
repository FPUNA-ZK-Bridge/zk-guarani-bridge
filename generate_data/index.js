/**
 * Validación de Firmas - Ethereum Sync Committee
 *
 * Esta herramienta extrae y valida las firmas del comité de sincronización
 * de Ethereum a través de un nodo beacon de Nimbus.
 *
 * @author Francisco Riquelme
 * @license MIT
 */

import fetch from "node-fetch";
import fs from "fs/promises";
import dotenv from "dotenv";
import { transformData } from "./transformData.js";

// Cargar variables de entorno
dotenv.config();

// Configuración
const CONFIG = {
  BASE_URL: process.env.BEACON_NODE_URL || "http://localhost:5052",
  OUTPUT_FILE: process.env.OUTPUT_FILE || "data.json",
  CIRCOM_OUTPUT_FILE: process.env.CIRCOM_OUTPUT_FILE || "circom_input.json",
  SYNC_COMMITTEE_SIZE: 512,
  BEACON_SEARCH_MAX_SLOTS: Number(process.env.BEACON_SEARCH_MAX_SLOTS || 128),
};

/**
 * Cliente para interactuar con el Beacon Node API
 */
class BeaconNodeClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Realiza una petición HTTP al Beacon Node
   * @param {string} endpoint - Endpoint de la API
   * @returns {Promise<Object>} - Respuesta JSON
   */
  async fetch(endpoint) {
    const url = `${this.baseUrl}${endpoint}`;
    console.log(`📡 Fetching: ${endpoint}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ Error fetching ${endpoint}:`, error.message);
      throw error;
    }
  }

  async getBeaconHeader(blockId) {
    const response = await this.fetch(`/eth/v1/beacon/headers/${blockId}`);
    return {
      root: response.data.root,
      canonical: response.data.canonical,
      slot: response.data.header.message.slot,
      proposer_index: response.data.header.message.proposer_index,
      parent_root: response.data.header.message.parent_root,
      state_root: response.data.header.message.state_root,
      body_root: response.data.header.message.body_root,
    };
  }

  /**
   * Obtiene el block root del bloque finalizado más reciente
   * @returns {Promise<string>} - Block root en formato hexadecimal
   */
  async getBlockRoot() {
    const data = await this.getBeaconHeader("finalized");
    return data.root;
  }

  /**
   * Obtiene el bloque beacon completo de un bloque específico
   * @param {string} blockId - ID del bloque (root, slot, o 'finalized')
   * @returns {Promise<Object>} - Datos completos del bloque
   */
  async getBlock(blockId) {
    const response = await this.fetch(`/eth/v2/beacon/blocks/${blockId}`);
    return response.data.message;
  }

  /**
   * Obtiene el header de un bloque específico
   * @param {string} blockId - ID del bloque (root, slot, o 'finalized')
   * @returns {Promise<Object>} - Datos del bloque incluyendo slot y sync_aggregate
   */
  async getBlockHeader(blockId) {
    const data = await this.getBlock(blockId);

    return {
      slot: data.slot,
      proposer_index: data.proposer_index,
      parent_root: data.parent_root,
      state_root: data.state_root,
      sync_aggregate: data.body.sync_aggregate,
      execution_payload: data.body.execution_payload ?? null,
    };
  }

  /**
   * Obtiene el comité de sincronización actual usando el endpoint de estados.
   * A diferencia de /eth/v1/beacon/light_client/bootstrap/{blockRoot}, este
   * endpoint no requiere que el bloque esté finalizado.
   * @param {string|number} stateId - Slot, "head", "finalized", etc.
   * @returns {Promise<Object>} - Comité de sincronización con pubkeys y aggregate_pubkey
   */
  async getSyncCommittee(stateId) {
    // 1. Obtener índices de validadores del sync committee
    const committeeData = await this.fetch(
      `/eth/v1/beacon/states/${stateId}/sync_committees`
    );
    const validatorIndices = committeeData.data.validators;

    // 2. Obtener pubkeys — deduplicar índices para minimizar la consulta
    const uniqueIndices = [...new Set(validatorIndices)];
    const queryIds = uniqueIndices.join(",");
    const validatorsData = await this.fetch(
      `/eth/v1/beacon/states/${stateId}/validators?id=${queryIds}`
    );

    const indexToPubkey = {};
    for (const v of validatorsData.data) {
      indexToPubkey[v.index] = v.validator.pubkey;
    }

    // 3. Construir array de pubkeys en el orden original del sync committee
    const pubkeys = validatorIndices.map((idx) => indexToPubkey[idx]);

    return {
      pubkeys,
      aggregate_pubkey: null,
    };
  }

  /**
   * Busca el bloque beacon cuyo execution payload coincide con un block hash
   * de la execution layer.
   * @param {string} executionBlockHash - Hash del bloque de execution layer
   * @param {number} maxLookbackSlots - Cantidad máxima de slots a revisar
   * @returns {Promise<{blockRoot: string, beaconSlot: string, blockHeader: Object}>}
   */
  async findBeaconBlockByExecutionBlockHash(
    executionBlockHash,
    maxLookbackSlots = CONFIG.BEACON_SEARCH_MAX_SLOTS
  ) {
    const targetHash = executionBlockHash.toLowerCase();
    const headHeader = await this.getBeaconHeader("head");
    const headSlot = Number(headHeader.slot);
    const minSlot = Math.max(0, headSlot - maxLookbackSlots);

    console.log(
      `🔎 Buscando beacon block para execution block ${executionBlockHash} entre slots ${minSlot} y ${headSlot}...`
    );

    for (let slot = headSlot; slot >= minSlot; slot--) {
      try {
        const block = await this.getBlock(String(slot));
        const executionHash = block.body?.execution_payload?.block_hash?.toLowerCase();

        if (executionHash === targetHash) {
          const header = await this.getBeaconHeader(String(slot));
          return {
            blockRoot: header.root,
            beaconSlot: header.slot,
            blockHeader: {
              slot: block.slot,
              proposer_index: block.proposer_index,
              parent_root: block.parent_root,
              state_root: block.state_root,
              sync_aggregate: block.body.sync_aggregate,
              execution_payload: block.body.execution_payload ?? null,
            },
          };
        }
      } catch (error) {
        // Algunos slots pueden estar vacíos o no disponibles; seguimos buscando.
        const message = String(error?.message ?? "");
        if (!message.includes("404")) {
          console.log(`⚠️ Error revisando slot ${slot}: ${message}`);
        }
      }
    }

    throw new Error(
      `No encontré un beacon block para execution block hash ${executionBlockHash} en los últimos ${maxLookbackSlots} slots`
    );
  }
}

/**
 * Calcula la participación del comité de sincronización
 * @param {string} syncCommitteeBits - Bits del comité en formato hexadecimal
 * @returns {Object} - Estadísticas de participación
 */
function calculateParticipation(syncCommitteeBits) {
  // Limpiar el prefijo "0x" si existe
  const cleanHex = syncCommitteeBits.startsWith("0x")
    ? syncCommitteeBits.slice(2)
    : syncCommitteeBits;

  // Convertir hexadecimal a binario
  const bits = BigInt("0x" + cleanHex).toString(2);

  // Rellenar con ceros a la izquierda hasta 512 bits
  const paddedBits = bits.padStart(CONFIG.SYNC_COMMITTEE_SIZE, "0");

  // Convertir a array de enteros
  const bitsArray = paddedBits.split("").map((bit) => parseInt(bit));

  // Contar participantes
  const totalParticipants = bitsArray.filter((bit) => bit === 1).length;
  const participation = (totalParticipants / CONFIG.SYNC_COMMITTEE_SIZE) * 100;

  return {
    participation: parseFloat(participation.toFixed(2)),
    bitsArray,
    totalParticipants,
    totalCommitteeSize: CONFIG.SYNC_COMMITTEE_SIZE,
  };
}

/**
 * Filtra las claves públicas que participaron en la firma
 * @param {Array<string>} pubkeys - Array de claves públicas
 * @param {Array<number>} bitsArray - Array de bits de participación
 * @returns {Array<string>} - Claves públicas que participaron
 */
function filterParticipatingKeys(pubkeys, bitsArray) {
  return pubkeys.filter((_, index) => bitsArray[index] === 1);
}

/**
 * Guarda los datos en un archivo JSON
 * @param {string} filepath - Ruta del archivo
 * @param {Object} data - Datos a guardar
 */
async function saveToFile(filepath, data) {
  try {
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Datos guardados en: ${filepath}`);
  } catch (error) {
    console.error(`❌ Error guardando archivo:`, error.message);
    throw error;
  }
}

/**
 * Muestra un resumen de los resultados en la consola
 * @param {Object} results - Resultados de la validación
 */
function displaySummary(results) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMEN DE VALIDACIÓN");
  console.log("=".repeat(60));
  console.log(`\n🔗 Block Root: ${results.blockRoot}`);
  console.log(`📦 Slot: ${results.blockHeader.slot}`);
  console.log(`\n👥 Participación del Comité de Sincronización:`);
  console.log(
    `   • Total: ${results.participation.totalParticipants}/${results.participation.totalCommitteeSize}`
  );
  console.log(`   • Porcentaje: ${results.participation.participation}%`);
  console.log(
    `\n🔑 Claves Públicas Validadas: ${results.validPublicKeys.length}`
  );
  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Obtiene la data cruda del beacon node (sync committee, header, participación)
 * @param {string} [beaconUrl] - URL del beacon node (default: CONFIG.BASE_URL)
 * @param {Object} [options]
 * @param {string} [options.transactionHash] - Hash de la transacción origen
 * @param {string} [options.executionBlockHash] - Hash del bloque EL que contiene la transacción
 * @returns {Promise<Object>} - Data cruda del beacon node
 */
async function fetchBeaconData(beaconUrl, options = {}) {
  const client = new BeaconNodeClient(beaconUrl || CONFIG.BASE_URL);
  const { transactionHash = null, executionBlockHash = null } = options;

  console.log("📡 Obteniendo data del beacon node...");

  let blockRoot;
  let blockHeader;

  if (executionBlockHash) {
    const matchedBlock = await client.findBeaconBlockByExecutionBlockHash(
      executionBlockHash
    );
    blockRoot = matchedBlock.blockRoot;
    blockHeader = matchedBlock.blockHeader;
    console.log(`   Tx Hash: ${transactionHash ?? "(no provisto)"}`);
    console.log(`   Execution Block Hash: ${executionBlockHash}`);
    console.log(`   Beacon Slot: ${matchedBlock.beaconSlot}`);
    console.log(`   Block Root: ${blockRoot}`);
  } else {
    blockRoot = await client.getBlockRoot();
    console.log(`   Block Root: ${blockRoot}`);
    blockHeader = await client.getBlockHeader(blockRoot);
  }

  console.log(`   Slot: ${blockHeader.slot}`);

  const participation = calculateParticipation(
    blockHeader.sync_aggregate.sync_committee_bits
  );
  console.log(`   Participación: ${participation.participation}%`);

  const syncCommittee = await client.getSyncCommittee(blockHeader.slot);
  console.log(`   Claves del comité: ${syncCommittee.pubkeys.length}`);

  const validPublicKeys = filterParticipatingKeys(
    syncCommittee.pubkeys,
    participation.bitsArray
  );
  console.log(`   Claves que firmaron: ${validPublicKeys.length}`);

  return {
    timestamp: new Date().toISOString(),
    transactionHash,
    executionBlockHash,
    blockRoot,
    blockHeader,
    participation,
    syncCommittee,
    validPublicKeys,
  };
}

/**
 * Función principal
 */
async function main() {
  console.log(
    "\n🚀 Iniciando validación de firmas del comité de sincronización\n"
  );

  try {
    // 1. Obtener data cruda del beacon node
    const results = await fetchBeaconData();

    // 2. Guardar data cruda
    console.log("\n6️⃣ Guardando data cruda...");
    await saveToFile(CONFIG.OUTPUT_FILE, results);

    // 3. Mostrar resumen
    displaySummary(results);

    // 4. Transformar a formato circom
    console.log("7️⃣ Transformando a formato circom...\n");
    const circomInput = await transformData(results);
    await saveToFile(CONFIG.CIRCOM_OUTPUT_FILE, circomInput);
    console.log(`\n✅ Input para circom guardado en: ${CONFIG.CIRCOM_OUTPUT_FILE}`);

    console.log("\n✨ Proceso completado exitosamente!\n");
  } catch (error) {
    console.error("\n❌ Error en el proceso:", error.message);
    process.exit(1);
  }
}

// Ejecutar solo si es el archivo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fetchBeaconData, calculateParticipation, filterParticipatingKeys };