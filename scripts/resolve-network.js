// Imprime el nombre de red de hardhat para N1 o N2 según BRIDGE_ENV.
// Uso: node scripts/resolve-network.js n1|n2
import { config } from "../bridge-env.js";

const chain = process.argv[2]; // "n1" o "n2"
if (chain === "n1") {
  process.stdout.write(config.n1.networkName);
} else if (chain === "n2") {
  process.stdout.write(config.n2.networkName);
} else {
  console.error('Uso: node scripts/resolve-network.js n1|n2');
  process.exit(1);
}
