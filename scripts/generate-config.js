import { readFileSync, writeFileSync, existsSync } from "fs";

function generateFrontendConfig() {
  try {
    // Verificar que el archivo de deploy existe
    if (!existsSync("deploy-N1.json")) {
      console.error(
        "❌ deploy-N1.json no encontrado. Ejecuta: npm run deploy:N1"
      );
      process.exit(1);
    }

    // Leer configuración de deploy
    const deployData = JSON.parse(readFileSync("deploy-N1.json", "utf8"));

    if (!deployData.token || !deployData.sender) {
      console.error(
        "❌ deploy-N1.json inválido. Debe contener 'token' y 'sender'"
      );
      process.exit(1);
    }

    // Generar config para el frontend
    const frontendConfig = `// Auto-generado desde deploy-N1.json - NO EDITAR MANUALMENTE
window.CONTRACT_CONFIG = {
  CHAIN_N1: "0x7a69",   // 31337 (Hardhat local)
  TOKEN_N1: "${deployData.token}",
  SENDER_N1: "${deployData.sender}",
  NETWORK_NAME: "Local Hardhat N1",
  GENERATED_AT: "${new Date().toISOString()}"
};

console.log("📄 Config cargada:", window.CONTRACT_CONFIG);
`;

    writeFileSync("public/config.js", frontendConfig);
    console.log("✅ Configuración generada en public/config.js");
    console.log(`   TOKEN_L1: ${deployData.token}`);
    console.log(`   SENDER_L1: ${deployData.sender}`);
  } catch (error) {
    console.error("❌ Error generando configuración:", error.message);
    process.exit(1);
  }
}

generateFrontendConfig();
