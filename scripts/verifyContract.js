import { ethers } from "ethers";
import { readFileSync } from "fs";

/**
 * Script para verificar si un contrato está deployado
 * Uso: node scripts/verifyContract.js <direccion_contrato> <red>
 * 
 * Ejemplos:
 * node scripts/verifyContract.js 0x1234...5678 1  # Verificar en L1
 * node scripts/verifyContract.js 0x1234...5678 2  # Verificar en L2
 */

async function main() {
  // Obtener argumentos de línea de comandos
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("❌ Error: Faltan argumentos");
    console.log("Uso: node scripts/verifyContract.js <direccion_contrato> <red>");
    console.log("  direccion_contrato: Dirección del contrato a verificar");
    console.log("  red: 1 para L1, 2 para L2");
    console.log("\nEjemplos:");
    console.log("  node scripts/verifyContract.js 0x1234567890123456789012345678901234567890 1");
    console.log("  node scripts/verifyContract.js 0x1234567890123456789012345678901234567890 2");
    process.exit(1);
  }

  const contractAddress = args[0];
  const network = args[1];

  // Validar dirección
  if (!ethers.isAddress(contractAddress)) {
    console.error("❌ Error: La dirección del contrato no es válida");
    process.exit(1);
  }

  // Configurar red
  let rpcUrl;
  let networkName;
  
  if (network === "1") {
    rpcUrl = "http://127.0.0.1:8545";
    networkName = "L1 (localL1)";
  } else if (network === "2") {
    rpcUrl = "http://127.0.0.1:9545";
    networkName = "L2 (localL2)";
  } else {
    console.error("❌ Error: Red no válida. Usa 1 para L1 o 2 para L2");
    process.exit(1);
  }

  console.log("🔍 Verificando contrato...");
  console.log("📍 Dirección:", contractAddress);
  console.log("🌐 Red:", networkName);
  console.log("🔗 RPC:", rpcUrl);
  console.log("─".repeat(50));

  try {
    // Conectar al proveedor
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Verificar conectividad
    try {
      const blockNumber = await provider.getBlockNumber();
      console.log("✅ Conectado a la red - Bloque actual:", blockNumber);
    } catch (connectError) {
      console.error("❌ Error: No se puede conectar a la red");
      console.error("   Asegúrate de que Anvil esté corriendo en:", rpcUrl);
      process.exit(1);
    }

    // Obtener código del contrato
    const code = await provider.getCode(contractAddress);
    
    if (code === "0x") {
      console.log("❌ RESULTADO: No hay contrato deployado en esta dirección");
      console.log("   La dirección no contiene código de contrato");
    } else {
      console.log("✅ RESULTADO: Contrato encontrado y deployado");
      console.log("   Tamaño del bytecode:", (code.length - 2) / 2, "bytes");
      
      // Información adicional
      const balance = await provider.getBalance(contractAddress);
      console.log("💰 Balance del contrato:", ethers.formatEther(balance), "ETH");
      
      // Intentar verificar si es un GuaraniToken
      await verifyGuaraniToken(provider, contractAddress);
    }

  } catch (error) {
    console.error("❌ Error al verificar el contrato:", error.message);
    process.exit(1);
  }
}

/**
 * Intenta verificar si el contrato es un GuaraniToken válido
 */
async function verifyGuaraniToken(provider, contractAddress) {
  try {
    console.log("\n🔬 Verificando si es un GuaraniToken...");
    
    // ABI mínimo para verificar funciones básicas de ERC20
    const erc20Abi = [
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)"
    ];
    
    const contract = new ethers.Contract(contractAddress, erc20Abi, provider);
    
    // Intentar obtener información básica del token
    const name = await contract.name();
    const symbol = await contract.symbol();
    const decimals = await contract.decimals();
    const totalSupply = await contract.totalSupply();
    
    console.log("📊 Información del token:");
    console.log("   Nombre:", name);
    console.log("   Símbolo:", symbol);
    console.log("   Decimales:", decimals);
    console.log("   Supply total:", ethers.formatUnits(totalSupply, decimals));
    
    // Verificar si es probablemente un GuaraniToken
    if (symbol === "GUA" || name.includes("Guarani")) {
      console.log("🎯 Este parece ser un GuaraniToken válido");
    } else {
      console.log("⚠️  Este no parece ser un GuaraniToken (diferente símbolo/nombre)");
    }
    
  } catch (error) {
    console.log("⚠️  No se pudo verificar como token ERC20:", error.message);
    console.log("   El contrato podría no ser un token o tener una interfaz diferente");
  }
}

/**
 * Función helper para cargar direcciones desde archivos de deploy
 */
function loadDeployedAddresses() {
  try {
    console.log("\n📁 Direcciones de contratos conocidos:");
    
    // Cargar L1
    try {
      const l1Deploy = JSON.parse(readFileSync("deploy-l1.json", "utf8"));
      console.log("   L1 - Token:", l1Deploy.token);
      console.log("   L1 - Sender:", l1Deploy.sender);
    } catch (e) {
      console.log("   L1: No encontrado (deploy-l1.json)");
    }
    
    // Cargar L2
    try {
      const l2Deploy = JSON.parse(readFileSync("deploy-l2.json", "utf8"));
      console.log("   L2 - Token:", l2Deploy.token);
      console.log("   L2 - Receiver:", l2Deploy.receiver);
    } catch (e) {
      console.log("   L2: No encontrado (deploy-l2.json)");
    }
    
  } catch (error) {
    // No hacer nada si no se pueden cargar
  }
}

// Mostrar direcciones conocidas al final
process.on('beforeExit', () => {
  loadDeployedAddresses();
});

main().catch((error) => {
  console.error("💥 Error fatal:", error);
  process.exit(1);
}); 