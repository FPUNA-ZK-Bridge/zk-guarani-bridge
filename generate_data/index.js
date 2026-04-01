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

  /**
   * Obtiene el block root del bloque finalizado más reciente
   * @returns {Promise<string>} - Block root en formato hexadecimal
   */
  async getBlockRoot() {
    const data = await this.fetch("/eth/v1/beacon/headers/finalized");
    return data.data.root;
  }

  /**
   * Obtiene el header de un bloque específico
   * @param {string} blockId - ID del bloque (root, slot, o 'finalized')
   * @returns {Promise<Object>} - Datos del bloque incluyendo slot y sync_aggregate
   */
  async getBlockHeader(blockId) {
    const response = await this.fetch(`/eth/v2/beacon/blocks/${blockId}`);
    const { data } = response;

    return {
      slot: data.message.slot,
      proposer_index: data.message.proposer_index,
      parent_root: data.message.parent_root,
      state_root: data.message.state_root,
      sync_aggregate: data.message.body.sync_aggregate,
    };
  }

  /**
   * Obtiene el comité de sincronización actual
   * @param {string} blockId - ID del bloque
   * @returns {Promise<Object>} - Comité de sincronización con pubkeys y aggregate_pubkey
   */
  async getSyncCommittee(blockId) {
    const data = await this.fetch(
      `/eth/v1/beacon/light_client/bootstrap/${blockId}`
    );
    return data.data.current_sync_committee;
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
 * @returns {Promise<Object>} - Data cruda del beacon node
 */
async function fetchBeaconData(beaconUrl) {
  const client = new BeaconNodeClient(beaconUrl || CONFIG.BASE_URL);

  console.log("📡 Obteniendo data del beacon node...");

  const blockRoot = await client.getBlockRoot();
  console.log(`   Block Root: ${blockRoot}`);

  const blockHeader = await client.getBlockHeader(blockRoot);
  console.log(`   Slot: ${blockHeader.slot}`);

  const participation = calculateParticipation(
    blockHeader.sync_aggregate.sync_committee_bits
  );
  console.log(`   Participación: ${participation.participation}%`);

  const syncCommittee = await client.getSyncCommittee(blockRoot);
  console.log(`   Claves del comité: ${syncCommittee.pubkeys.length}`);

  const validPublicKeys = filterParticipatingKeys(
    syncCommittee.pubkeys,
    participation.bitsArray
  );
  console.log(`   Claves que firmaron: ${validPublicKeys.length}`);

  return {
    timestamp: new Date().toISOString(),
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