import { ethers } from "ethers";
import { readFileSync } from "fs";
import accountManager from "../utils/accounts.js";

async function main() {
  // Cargar configuración desde deploy-l1.json
  const l1Config = JSON.parse(readFileSync("deploy-N1.json", "utf8"));
  
  // Usar el account manager para obtener el deployer
  const deployer = accountManager.getDeployerSigner("http://127.0.0.1:8545");
  
  console.log("🔧 Deployer address:", deployer.address);
  
  // Direcciones desde la configuración
  const tokenAddress = l1Config.token;
  const senderAddress = l1Config.sender;

  
  // ABI del contrato Sender
  const senderABI = [
    "function lock(address recipientL2, uint256 amount)",
    "function lockedBalance() view returns (uint256)",
    "event Locked(uint256 indexed id, address indexed from, address indexed to, uint256 amount)"
  ];
  
  // ABI del contrato GuaraniToken (para verificar allowance)
  const tokenABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
  ];
  
  // Conectar a los contratos
  const sender = new ethers.Contract(senderAddress, senderABI, deployer);
  const token = new ethers.Contract(tokenAddress, tokenABI, deployer);
  
  console.log("Contratos conectados:");
  console.log("- GuaraniToken:", tokenAddress);
  console.log("- Sender:", senderAddress);
  
  // Parámetros para el lock  
  const recipientL2 = accountManager.getAddress(0); // Misma dirección del deployer en L2
  const amount = ethers.parseUnits("3500", 18); // 3500 tokens GUA
  
  console.log("\nParámetros del lock:");
  console.log("- Recipient L2:", recipientL2);
  console.log("- Amount:", ethers.formatUnits(amount, 18), "GUA");
  
  // Verificar allowance
  try {
    const allowance = await token.allowance(deployer.address, senderAddress);
    console.log("\nAllowance actual:", ethers.formatUnits(allowance, 18), "GUA");
    
    if (allowance < amount) {
      console.log("❌ Error: No hay suficiente allowance.");
      console.log("Necesitas aprobar primero con el script approveTokensNode.js");
      console.log("O asegúrate de que el allowance sea >= 3500 GUA");
      return;
    }
  } catch (error) {
    console.log("⚠️  No se pudo verificar allowance, continuando...");
  }
  
  // Verificar balance
  try {
    const balance = await token.balanceOf(deployer.address);
    console.log("Balance actual:", ethers.formatUnits(balance, 18), "GUA");
    
    if (balance < amount) {
      console.log("❌ Error: No hay suficiente balance para hacer lock.");
      return;
    }
  } catch (error) {
    console.log("⚠️  No se pudo verificar balance, continuando...");
  }
  
  console.log("\nEjecutando lock...");
  
  // Realizar el lock
  try {
    const tx = await sender.lock(recipientL2, amount);
    console.log("Transacción enviada, esperando confirmación...");
    console.log("Hash:", tx.hash);
    
    const receipt = await tx.wait();
    
    console.log("✅ Lock completado!");
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas usado:", receipt.gasUsed.toString());
    
    // Buscar el evento Locked
    const lockedEvents = receipt.logs.filter(log => {
      try {
        const parsed = sender.interface.parseLog(log);
        return parsed.name === 'Locked';
      } catch {
        return false;
      }
    });
    
    if (lockedEvents.length > 0) {
      const parsedEvent = sender.interface.parseLog(lockedEvents[0]);
      console.log("\n📊 Evento Locked emitido:");
      console.log("- ID:", parsedEvent.args.id.toString());
      console.log("- From:", parsedEvent.args.from);
      console.log("- To:", parsedEvent.args.to);
      console.log("- Amount:", ethers.formatUnits(parsedEvent.args.amount, 18), "GUA");
    }
    
    // Verificar balance bloqueado
    try {
      const lockedBalance = await sender.lockedBalance();
      console.log("\n💰 Balance total bloqueado en Sender:", ethers.formatUnits(lockedBalance, 18), "GUA");
    } catch (error) {
      console.log("⚠️  No se pudo verificar balance bloqueado");
    }
    
  } catch (error) {
    console.error("❌ Error al ejecutar lock:");
    console.error(error.message);
    
    if (error.message.includes("approve first")) {
      console.log("\n💡 Solución: Ejecuta primero el approve con approveTokensNode.js");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 