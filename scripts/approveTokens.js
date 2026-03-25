import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  // Dirección del contrato GuaraniToken desplegado
  const tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  // Dirección del spender (a quien se le aprueba gastar los tokens)
  const spenderAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Dirección especificada
  
  // Conectar al contrato
  const GuaraniToken = await hre.ethers.getContractFactory("GuaraniToken");
  const token = GuaraniToken.attach(tokenAddress);
  
  // Verificar que el contrato existe
  try {
    const name = await token.name();
    console.log("Nombre del token:", name);
  } catch (error) {
    console.error("❌ Error: No se pudo conectar al contrato. ¿Está desplegado?");
    console.error("Dirección verificada:", tokenAddress);
    throw error;
  }
  
  // Cantidad a aprobar: 2000 tokens GUA
  const amount = hre.ethers.parseUnits("2000", 18);
  
  console.log("Aprobando tokens...");
  console.log("Contrato GuaraniToken:", tokenAddress);
  console.log("Spender (quien puede gastar):", spenderAddress);
  console.log("Owner (quien aprueba):", deployer.address);
  console.log("Cantidad:", hre.ethers.formatUnits(amount, 18), "GUA");
  
  // Realizar el approve
  const tx = await token.approve(spenderAddress, amount);
  await tx.wait();
  
  console.log("✅ Approve completado!");
  console.log("Hash de transacción:", tx.hash);
  
  // Verificar el allowance (con manejo de errores)
  try {
    const allowance = await token.allowance(deployer.address, spenderAddress);
    console.log("Allowance aprobado:", hre.ethers.formatUnits(allowance, 18), "GUA");
  } catch (error) {
    console.log("⚠️  No se pudo verificar el allowance, pero el approve debería haber funcionado");
    console.log("Razón:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 