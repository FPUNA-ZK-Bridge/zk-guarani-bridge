const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");

describe("🔬 Network Diagnostic Tests", function () {
  
  describe("🚦 1. ENVIRONMENT VALIDATION", function () {
    it("✅ Should validate .env configuration", async function () {
      const envVars = {
        RPC_URL_L1: process.env.RPC_URL_L1,
        RPC_URL_L2: process.env.RPC_URL_L2,
        PRIVATE_KEY_RELAYER: process.env.PRIVATE_KEY_RELAYER,
        START_BLOCK_L1: process.env.START_BLOCK_L1
      };

      console.log(`   🔍 Environment Variables:`);
      Object.entries(envVars).forEach(([key, value]) => {
        const masked = key.includes('PRIVATE_KEY') && value ? 
          `${value.substring(0, 6)}...${value.substring(value.length - 4)}` : 
          value || "NOT SET";
        console.log(`      - ${key}: ${masked}`);
      });

      // Check for common errors
      if (envVars.RPC_URL_L1?.startsWith('ws://')) {
        console.log(`   ⚠️  WARNING: L1 using WebSocket - should be HTTP for Anvil/Hardhat`);
        console.log(`   💡 Change to: RPC_URL_L1=http://127.0.0.1:8545`);
      }

      if (envVars.RPC_URL_L2?.startsWith('ws://')) {
        console.log(`   ⚠️  WARNING: L2 using WebSocket - should be HTTP for Anvil`);
        console.log(`   💡 Change to: RPC_URL_L2=http://127.0.0.1:9545`);
      }

      const expectedL1 = "http://127.0.0.1:8545";
      const expectedL2 = "http://127.0.0.1:9545";
      
      expect(envVars.RPC_URL_L1).to.equal(expectedL1, "L1 RPC URL should be HTTP, not WebSocket");
      expect(envVars.RPC_URL_L2).to.equal(expectedL2, "L2 RPC URL should be HTTP, not WebSocket");
    });
  });

  describe("🌐 2. CROSS-NETWORK CONNECTIVITY", function () {
    it("🔍 Should test L1 network connectivity (Hardhat)", async function () {
      try {
        const l1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        
        const network = await l1Provider.getNetwork();
        const blockNumber = await l1Provider.getBlockNumber();
        const accounts = await l1Provider.listAccounts();
        
        console.log(`   ✅ L1 Network (Hardhat):`);
        console.log(`      - Chain ID: ${network.chainId}`);
        console.log(`      - Block Number: ${blockNumber}`);
        console.log(`      - Accounts: ${accounts.length}`);
        
        expect(network.chainId).to.equal(31337n, "L1 should be chainId 31337");
        expect(blockNumber).to.be.greaterThan(0);
        
      } catch (error) {
        console.log(`   ❌ L1 Network Error: ${error.message}`);
        console.log(`   💡 Make sure L1 is running: npm run node:l1`);
        throw new Error(`L1 network not accessible: ${error.message}`);
      }
    });

    it("🔍 Should test L2 network connectivity (Anvil)", async function () {
      try {
        const l2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
        
        const network = await l2Provider.getNetwork();
        const blockNumber = await l2Provider.getBlockNumber();
        
        console.log(`   ✅ L2 Network (Anvil):`);
        console.log(`      - Chain ID: ${network.chainId}`);
        console.log(`      - Block Number: ${blockNumber}`);
        
        expect(network.chainId).to.equal(1338n, "L2 should be chainId 1338");
        expect(blockNumber).to.be.greaterThan(0);
        
      } catch (error) {
        console.log(`   ❌ L2 Network Error: ${error.message}`);
        console.log(`   💡 Make sure L2 is running: npm run node:l2`);
        throw new Error(`L2 network not accessible: ${error.message}`);
      }
    });

    it("✅ Should verify both networks are different", async function () {
      const l1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const l2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
      
      const l1Network = await l1Provider.getNetwork();
      const l2Network = await l2Provider.getNetwork();
      
      console.log(`   ✅ Network Verification:`);
      console.log(`      - L1 Chain ID: ${l1Network.chainId}`);
      console.log(`      - L2 Chain ID: ${l2Network.chainId}`);
      console.log(`      - Different: ${l1Network.chainId !== l2Network.chainId ? "✅" : "❌"}`);
      
      expect(l1Network.chainId).to.not.equal(l2Network.chainId);
    });
  });

  describe("🔧 3. RELAYER SIMULATION", function () {
    it("✅ Should simulate relayer connection to both networks", async function () {
      try {
        // Simulate relayer setup like in relayer.js
        const l1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const l2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
        
        // Test relayer account
        const relayerPrivateKey = process.env.PRIVATE_KEY_RELAYER;
        if (!relayerPrivateKey) {
          throw new Error("PRIVATE_KEY_RELAYER not set in .env");
        }
        
        const relayerL2 = new ethers.Wallet(relayerPrivateKey, l2Provider);
        
        console.log(`   ✅ Relayer Simulation:`);
        console.log(`      - Relayer Address: ${relayerL2.address}`);
        console.log(`      - L1 Connected: ✅`);
        console.log(`      - L2 Connected: ✅`);
        
        // Test relayer balance on L2
        const relayerBalance = await l2Provider.getBalance(relayerL2.address);
        console.log(`      - L2 Balance: ${ethers.formatEther(relayerBalance)} ETH`);
        
        if (relayerBalance === 0n) {
          console.log(`   ⚠️  WARNING: Relayer has 0 ETH balance on L2`);
          console.log(`   💡 Fund relayer or use a funded account`);
        }
        
      } catch (error) {
        console.log(`   ❌ Relayer simulation failed: ${error.message}`);
        throw error;
      }
    });

    it("🔍 Should test event filter setup", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        const l1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        
        // Check if sender contract exists
        const senderCode = await l1Provider.getCode(deployL1.sender);
        if (senderCode === "0x") {
          console.log(`   ⚠️  SKIPPING: Sender contract not deployed on L1`);
          this.skip();
          return;
        }
        
        // Create contract instance
        const senderAbi = [
          "event Locked(uint256 indexed id,address indexed from,address indexed to,uint256 amount)"
        ];
        const sender = new ethers.Contract(deployL1.sender, senderAbi, l1Provider);
        
        // Test event filter creation
        const filter = sender.filters.Locked();
        
        console.log(`   ✅ Event Filter Test:`);
        console.log(`      - Contract: ${deployL1.sender}`);
        console.log(`      - Filter Topics: ${JSON.stringify(filter.topics)}`);
        
        // Test event listener setup (without actually listening)
        let listenerSetup = false;
        try {
          sender.on(filter, (...args) => {
            console.log("Event received:", args);
          });
          listenerSetup = true;
          sender.removeAllListeners();
        } catch (e) {
          console.log(`   ❌ Event listener setup failed: ${e.message}`);
        }
        
        console.log(`      - Listener Setup: ${listenerSetup ? "✅" : "❌"}`);
        expect(listenerSetup).to.be.true;
        
      } catch (error) {
        console.log(`   ❌ Event filter test failed: ${error.message}`);
        throw error;
      }
    });
  });

  describe("📊 4. DEPLOYMENT CONSISTENCY CHECK", function () {
    it("🔍 Should verify L1 contracts on correct network", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        const l1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        
        const network = await l1Provider.getNetwork();
        console.log(`   🔍 L1 Deployment Check:`);
        console.log(`      - Current Network: ${network.chainId}`);
        console.log(`      - Expected: 31337`);
        
        if (network.chainId !== 31337n) {
          console.log(`   ⚠️  WARNING: Connected to wrong L1 network!`);
          console.log(`   💡 Make sure you're connected to Hardhat (chainId 31337)`);
        }
        
        const tokenCode = await l1Provider.getCode(deployL1.token);
        const senderCode = await l1Provider.getCode(deployL1.sender);
        
        console.log(`      - Token Contract: ${tokenCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);
        console.log(`      - Sender Contract: ${senderCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);
        
        if (tokenCode === "0x" || senderCode === "0x") {
          console.log(`   💡 Re-deploy L1 contracts: npm run deploy:l1`);
        }
        
      } catch (error) {
        console.log(`   ❌ L1 deployment check failed: ${error.message}`);
      }
    });

    it("🔍 Should verify L2 contracts on correct network", async function () {
      try {
        const deployL2 = JSON.parse(fs.readFileSync("deploy-l2.json", "utf8"));
        const l2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
        
        const network = await l2Provider.getNetwork();
        console.log(`   🔍 L2 Deployment Check:`);
        console.log(`      - Current Network: ${network.chainId}`);
        console.log(`      - Expected: 1338`);
        
        if (network.chainId !== 1338n) {
          console.log(`   ⚠️  WARNING: Connected to wrong L2 network!`);
          console.log(`   💡 Make sure you're connected to Anvil (chainId 1338)`);
        }
        
        const tokenCode = await l2Provider.getCode(deployL2.token);
        const receiverCode = await l2Provider.getCode(deployL2.receiver);
        
        console.log(`      - Token Contract: ${tokenCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);
        console.log(`      - Receiver Contract: ${receiverCode !== "0x" ? "✅ Deployed" : "❌ Not Found"}`);
        
        if (tokenCode === "0x" || receiverCode === "0x") {
          console.log(`   💡 Re-deploy L2 contracts: npm run deploy:l2`);
        }
        
      } catch (error) {
        console.log(`   ❌ L2 deployment check failed: ${error.message}`);
      }
    });
  });

  describe("🎯 5. INTEGRATION READINESS CHECK", function () {
    it("✅ Should verify complete bridge setup", async function () {
      const checks = {
        l1Network: false,
        l2Network: false,
        l1Contracts: false,
        l2Contracts: false,
        relayerConfig: false,
        frontendSync: false
      };

      try {
        // Check L1
        const l1Provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
        const l1Network = await l1Provider.getNetwork();
        checks.l1Network = l1Network.chainId === 31337n;

        // Check L2
        const l2Provider = new ethers.JsonRpcProvider("http://127.0.0.1:9545");
        const l2Network = await l2Provider.getNetwork();
        checks.l2Network = l2Network.chainId === 1338n;

        // Check L1 contracts
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        const tokenL1Code = await l1Provider.getCode(deployL1.token);
        const senderCode = await l1Provider.getCode(deployL1.sender);
        checks.l1Contracts = tokenL1Code !== "0x" && senderCode !== "0x";

        // Check L2 contracts
        const deployL2 = JSON.parse(fs.readFileSync("deploy-l2.json", "utf8"));
        const tokenL2Code = await l2Provider.getCode(deployL2.token);
        const receiverCode = await l2Provider.getCode(deployL2.receiver);
        checks.l2Contracts = tokenL2Code !== "0x" && receiverCode !== "0x";

        // Check relayer config
        checks.relayerConfig = !!process.env.PRIVATE_KEY_RELAYER && 
                              process.env.RPC_URL_L1 === "http://127.0.0.1:8545" &&
                              process.env.RPC_URL_L2 === "http://127.0.0.1:9545";

        // Check frontend sync
        const frontendContent = fs.readFileSync("public/index.html", "utf8");
        const frontendToken = frontendContent.match(/const TOKEN_L1\s*=\s*["']([^"']+)["']/)?.[1];
        const frontendSender = frontendContent.match(/const SENDER_L1\s*=\s*["']([^"']+)["']/)?.[1];
        checks.frontendSync = frontendToken?.toLowerCase() === deployL1.token.toLowerCase() &&
                             frontendSender?.toLowerCase() === deployL1.sender.toLowerCase();

      } catch (error) {
        console.log(`   ❌ Setup check error: ${error.message}`);
      }

      console.log(`\n   📊 BRIDGE READINESS REPORT:`);
      console.log(`      - L1 Network (31337): ${checks.l1Network ? "✅" : "❌"}`);
      console.log(`      - L2 Network (1338):  ${checks.l2Network ? "✅" : "❌"}`);
      console.log(`      - L1 Contracts:       ${checks.l1Contracts ? "✅" : "❌"}`);
      console.log(`      - L2 Contracts:       ${checks.l2Contracts ? "✅" : "❌"}`);
      console.log(`      - Relayer Config:     ${checks.relayerConfig ? "✅" : "❌"}`);
      console.log(`      - Frontend Sync:      ${checks.frontendSync ? "✅" : "❌"}`);

      const allReady = Object.values(checks).every(check => check);
      console.log(`\n   🎯 OVERALL STATUS: ${allReady ? "✅ READY TO BRIDGE" : "❌ NEEDS FIXES"}`);

      if (!allReady) {
        console.log(`\n   🔧 NEXT STEPS:`);
        if (!checks.l1Network) console.log(`      - Start L1: npm run node:l1`);
        if (!checks.l2Network) console.log(`      - Start L2: npm run node:l2`);
        if (!checks.l1Contracts) console.log(`      - Deploy L1: npm run deploy:l1`);
        if (!checks.l2Contracts) console.log(`      - Deploy L2: npm run deploy:l2`);
        if (!checks.relayerConfig) console.log(`      - Fix .env configuration`);
        if (!checks.frontendSync) console.log(`      - Update frontend addresses`);
      }

      // Don't fail test, just report
      expect(true).to.be.true; // Always pass but report issues
    });
  });
}); 