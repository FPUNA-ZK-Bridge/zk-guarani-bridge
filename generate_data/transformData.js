/**
 * Transform Data - Ethereum Sync Committee to Tusima Format
 *
 * Transforma datos del formato Beacon Node API al formato requerido
 * por Tusima para verificación de firmas BLS.
 *
 * @author Francisco Riquelme
 * @license MIT
 */

import fs from "fs/promises";
import { bls12_381 } from "@noble/curves/bls12-381";
import { ssz } from "@lodestar/types";
import { createHash } from "crypto";

// Configuración
const CONFIG = {
  INPUT_FILE: process.env.INPUT_FILE || "data.json",
  OUTPUT_FILE: process.env.TRANSFORM_OUTPUT_FILE || "tusima_input.json",
  FIELD_SIZE: 7, // Número de limbs para representar coordenadas
  LIMB_SIZE: 55, // Bits por limb
};

/**
 * Convierte un hex string a un array de bytes
 * @param {string} hexString - String hexadecimal (con o sin prefijo 0x)
 * @returns {Array<string>} - Array de bytes como strings
 */
function hexToByteArray(hexString) {
  const cleanHex = hexString.startsWith("0x") ? hexString.slice(2) : hexString;

  const bytes = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.slice(i, i + 2), 16).toString());
  }
  return bytes;
}

/**
 * Convierte un número grande a representación en limbs
 * @param {bigint} value - Valor a convertir
 * @param {number} numLimbs - Número de limbs
 * @param {number} limbSize - Tamaño de cada limb en bits
 * @returns {Array<string>} - Array de limbs como strings
 */
function bigIntToLimbs(value, numLimbs, limbSize) {
  const mask = (1n << BigInt(limbSize)) - 1n;
  const limbs = [];

  for (let i = 0; i < numLimbs; i++) {
    limbs.push(((value >> BigInt(i * limbSize)) & mask).toString());
  }

  return limbs;
}

/**
 * Convierte coordenadas de punto G1 de hex a limbs
 * @param {string} hexPubkey - Clave pública en formato hexadecimal
 * @returns {Array<Array<string>>} - Coordenadas [x, y] en formato limbs
 */
function g1PointToLimbs(hexPubkey) {
  try {
    // Quitar prefijo 0x si existe
    const cleanHex = hexPubkey.startsWith("0x")
      ? hexPubkey.slice(2)
      : hexPubkey;

    // Convertir hex a bytes
    const bytes = new Uint8Array(
      cleanHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
    );

    // Deserializar el punto usando @noble/curves
    const point = bls12_381.G1.ProjectivePoint.fromHex(bytes);
    const affine = point.toAffine();

    // Convertir coordenadas a limbs
    const xLimbs = bigIntToLimbs(affine.x, CONFIG.FIELD_SIZE, CONFIG.LIMB_SIZE);
    const yLimbs = bigIntToLimbs(affine.y, CONFIG.FIELD_SIZE, CONFIG.LIMB_SIZE);

    return [xLimbs, yLimbs];
  } catch (error) {
    console.error(`Error converting G1 point: ${hexPubkey}`, error.message);
    throw error;
  }
}

/**
 * Convierte coordenadas de punto G2 de hex a limbs
 * @param {string} hexSignature - Firma en formato hexadecimal
 * @returns {Array<Array<Array<string>>>} - Coordenadas [[x0, x1], [y0, y1]] en formato limbs
 */
function g2PointToLimbs(hexSignature) {
  try {
    // Quitar prefijo 0x si existe
    const cleanHex = hexSignature.startsWith("0x")
      ? hexSignature.slice(2)
      : hexSignature;

    // Convertir hex a bytes
    const bytes = new Uint8Array(
      cleanHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
    );

    // Deserializar el punto G2 usando @noble/curves
    const point = bls12_381.G2.ProjectivePoint.fromHex(bytes);
    const affine = point.toAffine();

    // G2 tiene coordenadas en Fp2, que son pares de elementos del campo base
    // affine.x y affine.y son objetos Fp2 con propiedades c0 y c1
    const x0Limbs = bigIntToLimbs(
      affine.x.c0,
      CONFIG.FIELD_SIZE,
      CONFIG.LIMB_SIZE
    );
    const x1Limbs = bigIntToLimbs(
      affine.x.c1,
      CONFIG.FIELD_SIZE,
      CONFIG.LIMB_SIZE
    );
    const y0Limbs = bigIntToLimbs(
      affine.y.c0,
      CONFIG.FIELD_SIZE,
      CONFIG.LIMB_SIZE
    );
    const y1Limbs = bigIntToLimbs(
      affine.y.c1,
      CONFIG.FIELD_SIZE,
      CONFIG.LIMB_SIZE
    );

    return [
      [x0Limbs, x1Limbs],
      [y0Limbs, y1Limbs],
    ];
  } catch (error) {
    console.error("Error converting G2 signature:", error.message);
    throw error;
  }
}

/**
 * Calcula el signing root según la spec de Ethereum.
 *
 * signing_root = hash_tree_root(SigningData {
 *   object_root: hash_tree_root(BeaconBlockHeader),
 *   domain: compute_domain(DOMAIN_SYNC_COMMITTEE, ...)
 * })
 *
 * Para el sync committee, el object_root es el block root del bloque
 * que el comité firma (el bloque en el slot anterior al attestation).
 *
 * @param {Object} blockHeader - Header del bloque
 * @param {string} blockRoot - Block root ya calculado por el beacon node
 * @returns {Array<string>} - Signing root como array de 32 bytes (strings decimales)
 */
function calculateSigningRoot(blockHeader, blockRoot) {
  // DOMAIN_SYNC_COMMITTEE = 0x07000000
  const DOMAIN_SYNC_COMMITTEE = Buffer.alloc(4);
  DOMAIN_SYNC_COMMITTEE[0] = 0x07;

  // El fork version y genesis validators root se necesitan para compute_domain.
  // Para simplificar, usamos el domain type + 28 bytes de ceros (domain sin fork context).
  // En un light client completo, estos valores se obtienen del bootstrap.
  const domain = Buffer.alloc(32);
  DOMAIN_SYNC_COMMITTEE.copy(domain, 0);

  // El object_root es el block root (hash_tree_root del BeaconBlockHeader)
  const objectRoot = hexToBytes(blockRoot);

  // signing_root = SHA256(object_root || domain)
  const signingData = Buffer.concat([objectRoot, domain]);
  const signingRootHash = createHash("sha256").update(signingData).digest();

  return Array.from(signingRootHash).map((b) => b.toString());
}

/**
 * Convierte un hex string a Buffer
 * @param {string} hex - String hexadecimal (con o sin prefijo 0x)
 * @returns {Buffer}
 */
function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
}

/**
 * Transforma los datos del formato API al formato Tusima
 * @param {Object} inputData - Datos en formato API Beacon
 * @returns {Object} - Datos en formato Tusima
 */
async function transformData(inputData) {
  console.log("🔄 Transformando datos al formato Tusima...\n");

  // 1. Calcular signing root
  console.log("1️⃣ Calculando signing root...");
  const signing_root = calculateSigningRoot(inputData.blockHeader, inputData.blockRoot);
  console.log(`   ✓ Signing root: ${signing_root.length} bytes\n`);

  // 2. Convertir todas las pubkeys del sync committee
  console.log("2️⃣ Convirtiendo claves públicas del comité (512 keys)...");
  const pubkeys = [];
  for (let i = 0; i < inputData.syncCommittee.pubkeys.length; i++) {
    const pubkey = inputData.syncCommittee.pubkeys[i];
    try {
      const limbsRepresentation = g1PointToLimbs(pubkey);
      pubkeys.push(limbsRepresentation);

      if ((i + 1) % 100 === 0) {
        console.log(`   ✓ Procesadas ${i + 1}/512 claves...`);
      }
    } catch (error) {
      console.error(`   ⚠️  Error en clave ${i}: ${pubkey.slice(0, 20)}...`);
      throw error;
    }
  }
  console.log(`   ✓ ${pubkeys.length} claves públicas convertidas\n`);

  // 3. Usar el array de bits directamente (nombre del circuito: pubkeybits)
  console.log("3️⃣ Extrayendo bits de participación...");
  const pubkeybits = inputData.participation.bitsArray;
  console.log(`   ✓ ${pubkeybits.length} bits extraídos\n`);

  // El mock VerifyHeaderMock(512, 7) NO consume la firma BLS (asume válida).
  // La firma se sigue calculando/expuesta por si se necesita en otro flow.
  return {
    signing_root,
    pubkeys,
    pubkeybits,
  };
}

/**
 * Guarda los datos transformados en un archivo
 * @param {string} filepath - Ruta del archivo de salida
 * @param {Object} data - Datos a guardar
 */
async function saveTransformedData(filepath, data) {
  try {
    await fs.writeFile(filepath, JSON.stringify(data, null, 4), "utf-8");
    console.log(`✅ Datos transformados guardados en: ${filepath}`);
  } catch (error) {
    console.error("❌ Error guardando archivo:", error.message);
    throw error;
  }
}

/**
 * Lee los datos de entrada del archivo
 * @param {string} filepath - Ruta del archivo de entrada
 * @returns {Object} - Datos parseados
 */
async function readInputData(filepath) {
  try {
    const fileContent = await fs.readFile(filepath, "utf-8");
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Error leyendo archivo ${filepath}:`, error.message);
    throw error;
  }
}

/**
 * Muestra estadísticas del archivo generado
 * @param {Object} data - Datos transformados
 */
function displayStats(data) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 ESTADÍSTICAS DE TRANSFORMACIÓN");
  console.log("=".repeat(60));
  console.log(`\n📝 Signing Root: ${data.signing_root.length} bytes`);
  console.log(`🔑 Public Keys: ${data.pubkeys.length} keys`);
  console.log(`📊 Participation Bits: ${data.pubkeybits.length} bits`);
  console.log(`   • Participantes: ${data.pubkeybits.filter((b) => b === 1).length}`);
  console.log("\n" + "=".repeat(60) + "\n");
}

/**
 * Función principal
 */
async function main() {
  console.log("\n🚀 Transformación de datos para Tusima\n");

  try {
    // 1. Leer datos de entrada
    console.log(`📖 Leyendo datos de entrada: ${CONFIG.INPUT_FILE}`);
    const inputData = await readInputData(CONFIG.INPUT_FILE);
    console.log(`   ✓ Datos cargados correctamente\n`);

    // 2. Transformar datos
    const transformedData = await transformData(inputData);

    // 3. Guardar datos transformados
    await saveTransformedData(CONFIG.OUTPUT_FILE, transformedData);

    // 4. Mostrar estadísticas
    displayStats(transformedData);

    console.log("✨ Transformación completada exitosamente!\n");
  } catch (error) {
    console.error("\n❌ Error en el proceso:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar solo si es el archivo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { transformData, g1PointToLimbs, g2PointToLimbs, hexToByteArray };