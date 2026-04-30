pragma circom 2.0.3;

include "../utils/pubkey_poseidon.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * ============================================================================
 * VERSIÓN MOCK de zkBridge Header Verification
 * ============================================================================
 * 
 * Esta versión implementa las partes del paper de zkBridge que SÍ pueden
 * correr en hardware limitado (Mac M3 16GB):
 * 
 * ✅ Poseidon hash del Sync Committee (commitment de las pubkeys)
 * ✅ Verificación de participación (bitmask de validadores)
 * ✅ Hash del signing_root (lo que se firmó)
 * ✅ Threshold check (>2/3 de validadores firmaron)
 * 
 * ❌ Verificación BLS (OMITIDA - requiere ~20M constraints)
 *    En producción esto lo haría deVirgo distribuido
 * 
 * ARQUITECTURA DEL PAPER:
 * ┌────────────────────────────────────────────────────────────┐
 * │  Ethereum Beacon Chain                                     │
 * │  ├── Block Header (slot, state_root, etc.)                │
 * │  ├── Sync Committee (512 validadores)                      │
 * │  └── BLS Signature (firma agregada del committee)          │
 * └────────────────────────────────────────────────────────────┘
 *                            ↓
 * ┌────────────────────────────────────────────────────────────┐
 * │  Light Client (este circuito)                              │
 * │  ├── Verifica que >2/3 validadores firmaron               │
 * │  ├── Computa Poseidon(pubkeys) para commitment             │
 * │  └── [MOCK] Asume firma BLS válida                         │
 * └────────────────────────────────────────────────────────────┘
 *                            ↓
 * ┌────────────────────────────────────────────────────────────┐
 * │  Smart Contract (on-chain)                                 │
 * │  ├── Verifica prueba ZK                                    │
 * │  └── Actualiza estado del light client                     │
 * └────────────────────────────────────────────────────────────┘
 * 
 * ============================================================================
 */

/**
 * Verifica que la cantidad de bits activos (validadores que firmaron)
 * supera el threshold de 2/3
 * @param b Número de validadores
 */
template ThresholdCheck(b) {
    signal input bits[b];
    signal output bitSum;
    signal output isValid;
    
    // Sumar todos los bits
    signal partialSum[b];
    partialSum[0] <== bits[0];
    for (var i = 1; i < b; i++) {
        partialSum[i] <== partialSum[i-1] + bits[i];
    }
    bitSum <== partialSum[b-1];
    
    // Threshold: más de 2/3 deben firmar
    // Para b=8 validadores, necesitamos > 5.33, es decir >= 6
    // Para simplificar, verificamos: bitSum * 3 > b * 2
    // Esto es equivalente a bitSum > (2*b)/3
    
    // isValid = 1 si bitSum * 3 > b * 2
    // Usamos LessThan(bitSum*3, b*2+1) = false significa que bitSum*3 >= b*2+1
    // que es lo mismo que bitSum*3 > b*2
    var twoThirdsTimesThree = 2 * b;  // b*2 (threshold * 3)
    
    component lt = LessThan(12); // 12 bits para valores hasta 4096
    lt.in[0] <== twoThirdsTimesThree; // b * 2
    lt.in[1] <== bitSum * 3;          // bitSum * 3
    
    // isValid = 1 si b*2 < bitSum*3 (es decir, bitSum > 2b/3)
    isValid <== lt.out;
}

/**
 * Hash Poseidon del signing_root (32 bytes -> 1 field element)
 */
template HashSigningRoot() {
    signal input signing_root[32];
    signal output out;
    
    // Dividir en chunks de 16 bytes para Poseidon
    component toField[2];
    toField[0] = Bytes16ToField();
    toField[1] = Bytes16ToField();
    
    for (var i = 0; i < 16; i++) {
        toField[0].bytes[i] <== signing_root[i];
        toField[1].bytes[i] <== signing_root[16 + i];
    }
    
    component hasher = Poseidon(2);
    hasher.inputs[0] <== toField[0].out;
    hasher.inputs[1] <== toField[1].out;
    
    out <== hasher.out;
}

/**
 * Convierte 16 bytes a un field element
 */
template Bytes16ToField() {
    signal input bytes[16];
    signal output out;
    
    signal acc[16];
    acc[0] <== bytes[0];
    for (var i = 1; i < 16; i++) {
        acc[i] <== acc[i-1] * 256 + bytes[i];
    }
    out <== acc[15];
}

/**
 * CIRCUITO PRINCIPAL MOCK
 * 
 * @param b Número de validadores (2, 4, 8, 16 para testing)
 * @param k Registros por pubkey (7 para BLS12-381)
 */
template VerifyHeaderMock(b, k) {
    // === INPUTS ===
    signal input pubkeys[b][2][k];      // Pubkeys del sync committee
    signal input pubkeybits[b];         // Bitmask: quién firmó
    signal input signing_root[32];      // Hash del header firmado
    
    // === OUTPUTS ===
    signal output syncCommitteePoseidon;  // Commitment de las pubkeys
    signal output bitSum;                  // Cantidad de firmantes
    signal output thresholdMet;            // 1 si >2/3 firmaron
    signal output signingRootHash;         // Hash del signing_root
    
    // --- Paso 1: Calcular Poseidon hash de las pubkeys ---
    // Este es el "commitment" del sync committee que se usa on-chain
    component poseidonCommittee = PubkeyPoseidon(b, k);
    for (var i = 0; i < b; i++) {
        for (var j = 0; j < k; j++) {
            poseidonCommittee.pubkeys[i][0][j] <== pubkeys[i][0][j];
            poseidonCommittee.pubkeys[i][1][j] <== pubkeys[i][1][j];
        }
    }
    syncCommitteePoseidon <== poseidonCommittee.out;
    log("Poseidon Commitment:", syncCommitteePoseidon);
    
    // --- Paso 2: Verificar threshold de participación ---
    // El paper requiere >2/3 de validadores para aceptar
    component threshold = ThresholdCheck(b);
    for (var i = 0; i < b; i++) {
        threshold.bits[i] <== pubkeybits[i];
    }
    bitSum <== threshold.bitSum;
    thresholdMet <== threshold.isValid;
    log("Validators who signed:", bitSum);
    log("Threshold met (>2/3):", thresholdMet);
    
    // --- Paso 3: Hash del signing_root ---
    component signingRootHasher = HashSigningRoot();
    for (var i = 0; i < 32; i++) {
        signingRootHasher.signing_root[i] <== signing_root[i];
    }
    signingRootHash <== signingRootHasher.out;
    log("Signing root hash:", signingRootHash);
    
    // --- Paso 4: MOCK de verificación BLS ---
    // En la versión real (paper), aquí iría:
    //   component blsVerify = CoreVerifyPubkeyG1(n, k);
    //   ... ~20M constraints de verificación BLS ...
    // 
    // Para este MOCK, asumimos que la firma es válida.
    // En producción, esto lo verificaría deVirgo en la capa 1.
    log("=== BLS VERIFICATION MOCKED (would be done by deVirgo) ===");
}

// ============================================================================
// INSTANCIAS DEL CIRCUITO
// ============================================================================

// Solo los outputs del template son públicos (4 signals).
// signing_root y pubkeybits quedan privados — sus commitments ya están expuestos
// vía signingRootHash, bitSum y thresholdMet, que son outputs del template.
component main = VerifyHeaderMock(512, 7);

