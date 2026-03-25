import { ethers } from "ethers";
import accountManager, { getAccount, getSigner } from "../utils/accounts.js";

async function main() {
  console.log("📋 Ejemplo de uso del Account Manager\n");

  // 1. Obtener cuenta por índice
  console.log("1️⃣ Obtener cuentas por índice:");
  const account0 = getAccount(0);
  const account1 = getAccount(1);
  console.log("Account 0:", account0.name, "->", account0.address);
  console.log("Account 1:", account1.name, "->", account1.address);

  // 2. Usar roles predefinidos
  console.log("\n2️⃣ Usar roles predefinidos:");
  console.log("Deployer:", accountManager.deployer.address);
  console.log("Relayer:", accountManager.relayer.address);
  console.log("User1:", accountManager.user1.address);

  // 3. Obtener signers directamente
  console.log("\n3️⃣ Obtener signers:");
  const deployerSigner = accountManager.getDeployerSigner();
  const relayerSigner = accountManager.getRelayerSigner();
  console.log("Deployer signer:", deployerSigner.address);
  console.log("Relayer signer:", relayerSigner.address);

  // 4. Uso directo con índice
  console.log("\n4️⃣ Uso directo:");
  const userSigner = getSigner(2, "http://127.0.0.1:8545"); // account#2
  console.log("User signer (account#2):", userSigner.address);

  // 5. Listar todas las cuentas
  console.log("\n5️⃣ Todas las cuentas:");
  accountManager.listAccounts();

  // 6. Ejemplo práctico: obtener balance
  console.log("\n6️⃣ Ejemplo práctico - Balance del deployer:");
  const provider = deployerSigner.provider;
  const balance = await provider.getBalance(deployerSigner.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}); 