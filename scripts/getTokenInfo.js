import { ethers } from "ethers";
import { readFileSync } from "fs";

/**
 * Script para obtener información completa de un token para MetaMask
 * Uso: node scripts/getTokenInfo.js <direccion_contrato> <red>
 * 
 * Ejemplos:
 * node scripts/getTokenInfo.js 0x1234...5678 1  # Token en L1
 * node scripts/getTokenInfo.js 0x1234...5678 2  # Token en L2
 */

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error("❌ Error: Faltan argumentos");
    console.log("Uso: node scripts/getTokenInfo.js <direccion_contrato> <red>");
    process.exit(1);
  }

  const contractAddress = args[0];
  const network = args[1];

  if (!ethers.isAddress(contractAddress)) {
    console.error("❌ Error: Dirección inválida");
    process.exit(1);
  }

  // Configurar red
  let rpcUrl, networkName, chainId;
  
  if (network === "1") {
    rpcUrl = "http://127.0.0.1:8545";
    networkName = "L1 (Localhost)";
    chainId = 31337;
  } else if (network === "2") {
    rpcUrl = "http://127.0.0.1:9545";
    networkName = "L2 (Localhost)";
    chainId = 1338;
  } else {
    console.error("❌ Error: Red no válida (1 o 2)");
    process.exit(1);
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // Verificar conexión
    await provider.getBlockNumber();
    // Solo necesitas incluir en el ABI las funciones que vas a utilizar.
    // En este caso, basta con las funciones name, symbol, decimals, totalSupply.
    const erc20Abi = [
      "function name() view returns (string)",
      "function symbol() view returns (string)", 
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)"
    ];
    
    const contract = new ethers.Contract(contractAddress, erc20Abi, provider);
    
    // Obtener toda la información
    console.log("🎯 INFORMACIÓN COMPLETA DEL TOKEN");
    console.log("═".repeat(50));
    
    const name = await contract.name();
    const symbol = await contract.symbol();
    const decimals = await contract.decimals();
    const totalSupply = await contract.totalSupply();
    
    console.log("📍 Dirección del contrato:", contractAddress);
    console.log("🌐 Red:", networkName);
    console.log("🔗 Chain ID:", chainId);
    console.log("📊 Nombre:", name);
    console.log("🏷️  Símbolo:", symbol);
    console.log("🔢 Decimales:", decimals);
    console.log("💰 Supply Total:", ethers.formatUnits(totalSupply, decimals));
    
    console.log("\n" + "═".repeat(50));
    console.log("📋 INFORMACIÓN PARA METAMASK");
    console.log("═".repeat(50));
    console.log("Dirección del contrato: " + contractAddress);
    console.log("Símbolo del token: " + symbol);
    console.log("Decimales: " + decimals);
    
    console.log("\n" + "═".repeat(50));
    console.log("⚙️  CONFIGURACIÓN DE RED PARA METAMASK");
    console.log("═".repeat(50));
    console.log("Nombre de la red: " + networkName);
    console.log("URL del RPC: " + rpcUrl);
    console.log("ID de cadena: " + chainId);
    console.log("Símbolo de moneda: ETH");
    
    // Verificar si hay deploy files y mostrar todas las direcciones
    console.log("\n" + "═".repeat(50));
    console.log("📁 TODAS LAS DIRECCIONES DEPLOYADAS");
    console.log("═".repeat(50));
    
    showAllDeployedContracts();
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    
    if (error.message.includes("could not detect network")) {
      console.log("\n💡 SOLUCIÓN:");
      console.log("1. Asegúrate de que Anvil esté corriendo:");
      console.log("   anvil --port 8545  # Para L1");
      console.log("   anvil --port 9545  # Para L2");
      console.log("2. Verifica que la dirección del contrato sea correcta");
    }
  }
}

function showAllDeployedContracts() {
  // Mostrar L1
  try {
    const l1Deploy = JSON.parse(readFileSync("deploy-l1.json", "utf8"));
    console.log("🌐 L1 (Chain ID: 31337):");
    console.log("   GuaraniToken: " + l1Deploy.token);
    console.log("   Sender: " + l1Deploy.sender);
  } catch (e) {
    console.log("🌐 L1: No deployado aún");
  }
  
  // Mostrar L2
  try {
    const l2Deploy = JSON.parse(readFileSync("deploy-l2.json", "utf8"));
    console.log("🌐 L2 (Chain ID: 1338):");
    console.log("   GuaraniToken: " + l2Deploy.token);
    console.log("   Receiver: " + l2Deploy.receiver);
    console.log("   Relayer: " + l2Deploy.relayer);
  } catch (e) {
    console.log("🌐 L2: No deployado aún");
  }
  
  console.log("\n💡 TIP: Usa estas direcciones para importar en MetaMask");
}

main().catch((error) => {
  console.error("💥 Error fatal:", error);
  process.exit(1);
}); 