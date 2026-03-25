const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");

describe("🏗️ Infrastructure & Network Tests", function () {
  
  describe("📋 1. DEPLOYMENT FILES VERIFICATION", function () {
    it("✅ Should have valid deploy-l1.json", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        
        expect(deployL1).to.have.property("token");
        expect(deployL1).to.have.property("sender");
        expect(ethers.isAddress(deployL1.token)).to.be.true;
        expect(ethers.isAddress(deployL1.sender)).to.be.true;
        
        console.log(`   ✅ L1 Deploy file valid:`);
        console.log(`      - Token:  ${deployL1.token}`);
        console.log(`      - Sender: ${deployL1.sender}`);
      } catch (error) {
        console.log(`   ❌ deploy-l1.json error: ${error.message}`);
        throw error;
      }
    });

    it("✅ Should have valid deploy-l2.json", async function () {
      try {
        const deployL2 = JSON.parse(fs.readFileSync("deploy-l2.json", "utf8"));
        
        expect(deployL2).to.have.property("token");
        expect(deployL2).to.have.property("receiver");
        expect(deployL2).to.have.property("relayer");
        expect(ethers.isAddress(deployL2.token)).to.be.true;
        expect(ethers.isAddress(deployL2.receiver)).to.be.true;
        expect(ethers.isAddress(deployL2.relayer)).to.be.true;
        
        console.log(`   ✅ L2 Deploy file valid:`);
        console.log(`      - Token:    ${deployL2.token}`);
        console.log(`      - Receiver: ${deployL2.receiver}`);
        console.log(`      - Relayer:  ${deployL2.relayer}`);
      } catch (error) {
        console.log(`   ❌ deploy-l2.json error: ${error.message}`);
        throw error;
      }
    });
  });

  describe("🌐 2. NETWORK CONNECTIVITY TESTS", function () {
    it("✅ Should connect to current network", async function () {
      const network = await ethers.provider.getNetwork();
      const blockNumber = await ethers.provider.getBlockNumber();
      const [signer] = await ethers.getSigners();
      
      console.log(`   ✅ Network Info:`);
      console.log(`      - Chain ID: ${network.chainId}`);
      console.log(`      - Name: ${network.name}`);
      console.log(`      - Block Number: ${blockNumber}`);
      console.log(`      - Signer: ${signer.address}`);
      
      expect(blockNumber).to.be.greaterThan(0);
    });

    it("🔍 Should check if L1 contracts are deployed", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        
        // Try to get contract code
        const tokenCode = await ethers.provider.getCode(deployL1.token);
        const senderCode = await ethers.provider.getCode(deployL1.sender);
        
        console.log(`   🔍 L1 Contract Status:`);
        console.log(`      - Token deployed: ${tokenCode !== "0x" ? "✅" : "❌"}`);
        console.log(`      - Sender deployed: ${senderCode !== "0x" ? "✅" : "❌"}`);
        
        if (tokenCode === "0x" || senderCode === "0x") {
          console.log(`   ⚠️  WARNING: Some L1 contracts not found on current network`);
          console.log(`   💡 Run: npm run deploy:l1`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking L1 contracts: ${error.message}`);
      }
    });
  });

  describe("📜 3. DEPLOYED CONTRACTS VERIFICATION", function () {
    it("🔍 Should verify L1 contracts functionality", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        
        // Check if contracts exist
        const tokenCode = await ethers.provider.getCode(deployL1.token);
        const senderCode = await ethers.provider.getCode(deployL1.sender);
        
        if (tokenCode === "0x" || senderCode === "0x") {
          console.log(`   ⚠️  SKIPPING: Contracts not deployed on current network`);
          this.skip();
          return;
        }
        
        // Test contract calls
        const token = await ethers.getContractAt("GuaraniToken", deployL1.token);
        const sender = await ethers.getContractAt("Sender", deployL1.sender);
        
        const tokenSymbol = await token.symbol();
        const tokenDecimals = await token.decimals();
        const senderNonce = await sender.nonce();
        const senderTokenAddr = await sender.token();
        
        console.log(`   ✅ L1 Contract Verification:`);
        console.log(`      - Token Symbol: ${tokenSymbol}`);
        console.log(`      - Token Decimals: ${tokenDecimals}`);
        console.log(`      - Sender Nonce: ${senderNonce}`);
        console.log(`      - Sender->Token: ${senderTokenAddr}`);
        console.log(`      - Match: ${senderTokenAddr.toLowerCase() === deployL1.token.toLowerCase() ? "✅" : "❌"}`);
        
        expect(tokenSymbol).to.equal("GUA");
        expect(tokenDecimals).to.equal(18);
        expect(senderTokenAddr.toLowerCase()).to.equal(deployL1.token.toLowerCase());
        
      } catch (error) {
        console.log(`   ❌ L1 Contract verification failed: ${error.message}`);
        throw error;
      }
    });
  });

  describe("🔄 4. EVENT LISTENING SIMULATION", function () {
    it("✅ Should simulate relayer event listening", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        
        // Check if sender exists
        const senderCode = await ethers.provider.getCode(deployL1.sender);
        if (senderCode === "0x") {
          console.log(`   ⚠️  SKIPPING: Sender contract not deployed`);
          this.skip();
          return;
        }
        
        const sender = await ethers.getContractAt("Sender", deployL1.sender);
        
        // Set up event filter
        const filter = sender.filters.Locked();
        
        console.log(`   ✅ Event Filter Setup:`);
        console.log(`      - Contract: ${deployL1.sender}`);
        console.log(`      - Event: Locked(uint256,address,address,uint256)`);
        console.log(`      - Filter: ${JSON.stringify(filter)}`);
        
        // Try to get past events
        const currentBlock = await ethers.provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 100); // Last 100 blocks
        
        const events = await sender.queryFilter(filter, fromBlock, currentBlock);
        
        console.log(`   📊 Event History (blocks ${fromBlock}-${currentBlock}):`);
        console.log(`      - Found Events: ${events.length}`);
        
        events.forEach((event, index) => {
          const args = event.args;
          console.log(`      - Event ${index}: ID=${args.id}, From=${args.from.substring(0,8)}..., Amount=${ethers.formatUnits(args.amount, 18)} GUA`);
        });
        
        if (events.length === 0) {
          console.log(`   💡 No Locked events found. Try bridging some tokens first.`);
        }
        
      } catch (error) {
        console.log(`   ❌ Event listening simulation failed: ${error.message}`);
        throw error;
      }
    });
  });

  describe("🎯 5. FRONTEND ADDRESS VERIFICATION", function () {
    it("🔍 Should check frontend vs deployed addresses", async function () {
      try {
        const deployL1 = JSON.parse(fs.readFileSync("deploy-l1.json", "utf8"));
        
        // Read frontend file
        const frontendContent = fs.readFileSync("public/index.html", "utf8");
        
        // Extract addresses from frontend
        const tokenMatch = frontendContent.match(/const TOKEN_L1\s*=\s*["']([^"']+)["']/);
        const senderMatch = frontendContent.match(/const SENDER_L1\s*=\s*["']([^"']+)["']/);
        
        const frontendToken = tokenMatch ? tokenMatch[1] : null;
        const frontendSender = senderMatch ? senderMatch[1] : null;
        
        console.log(`   🔍 Address Comparison:`);
        console.log(`      - Deploy L1 Token:  ${deployL1.token}`);
        console.log(`      - Frontend Token:   ${frontendToken || "NOT FOUND"}`);
        console.log(`      - Match: ${deployL1.token.toLowerCase() === frontendToken?.toLowerCase() ? "✅" : "❌"}`);
        console.log(`      - Deploy L1 Sender: ${deployL1.sender}`);
        console.log(`      - Frontend Sender:  ${frontendSender || "NOT FOUND"}`);
        console.log(`      - Match: ${deployL1.sender.toLowerCase() === frontendSender?.toLowerCase() ? "✅" : "❌"}`);
        
        if (deployL1.token.toLowerCase() !== frontendToken?.toLowerCase()) {
          console.log(`   ⚠️  TOKEN ADDRESS MISMATCH! Update frontend.`);
        }
        if (deployL1.sender.toLowerCase() !== frontendSender?.toLowerCase()) {
          console.log(`   ⚠️  SENDER ADDRESS MISMATCH! Update frontend.`);
        }
        
      } catch (error) {
        console.log(`   ❌ Frontend verification failed: ${error.message}`);
      }
    });
  });

  describe("🔧 6. RELAYER CONFIGURATION CHECK", function () {
    it("🔍 Should verify relayer address consistency", async function () {
      try {
        const deployL2 = JSON.parse(fs.readFileSync("deploy-l2.json", "utf8"));
        
        console.log(`   🔍 Relayer Configuration:`);
        console.log(`      - Deploy L2 Relayer: ${deployL2.relayer}`);
        
        // Check if the relayer address matches expected patterns
        const accounts = await ethers.getSigners();
        const accountAddresses = accounts.map(acc => acc.address);
        
        console.log(`      - Available Accounts:`);
        accountAddresses.slice(0, 3).forEach((addr, i) => {
          console.log(`         [${i}]: ${addr}`);
        });
        
        const relayerIsKnownAccount = accountAddresses.includes(deployL2.relayer);
        console.log(`      - Relayer is known account: ${relayerIsKnownAccount ? "✅" : "❌"}`);
        
        if (!relayerIsKnownAccount) {
          console.log(`   ⚠️  WARNING: Relayer address not in available accounts`);
          console.log(`   💡 Make sure the relayer private key is correct in .env`);
        }
        
      } catch (error) {
        console.log(`   ❌ Relayer configuration check failed: ${error.message}`);
      }
    });
  });
}); 