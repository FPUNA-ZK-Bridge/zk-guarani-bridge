import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // Dirección del contrato GuaraniToken desplegado
  const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  // Conectar al contrato
  const GuaraniToken = await hre.ethers.getContractFactory("GuaraniToken");
  const token = GuaraniToken.attach(tokenAddress);
  
  // Cantidad a mintear: 1000 tokens GUA
  const amount = hre.ethers.parseUnits("2000", 18);
  
  console.log("Minteando tokens...");
  console.log("Contrato:", tokenAddress);
  console.log("Destinatario:", deployer.address);
  console.log("Cantidad:", hre.ethers.formatUnits(amount, 18), "GUA");
  
  // Realizar el mint
  const tx = await token.mint(deployer.address, amount);
  await tx.wait();
  
  console.log("✅ Mint completado!");
  console.log("Hash de transacción:", tx.hash);
  
  // Verificar el balance
  const balance = await token.balanceOf(deployer.address);
  console.log("Nuevo balance del deployer:", hre.ethers.formatUnits(balance, 18), "GUA");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 