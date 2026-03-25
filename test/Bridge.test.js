import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import path from "path";
import { fileURLToPath } from "url";

const { ethers } = hre;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rutas a los artefactos circom
const WASM_PATH = path.resolve(__dirname, "../circom/multiplier2_js/multiplier2.wasm");
const ZKEY_PATH = path.resolve(__dirname, "../circom/multiplier2_0001.zkey");

// Helper: genera proof y la formatea para el contrato
async function generateProofForContract(a, b) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { a: String(a), b: String(b) },
    WASM_PATH,
    ZKEY_PATH
  );
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ];
  const pC = [proof.pi_c[0], proof.pi_c[1]];
  const pubSignals = publicSignals.map(String);
  return { pA, pB, pC, pubSignals };
}

// Helper: proof falsa (todos ceros)
function fakeProof() {
  return {
    pA: ["0", "0"],
    pB: [["0", "0"], ["0", "0"]],
    pC: ["0", "0"],
    pubSignals: ["0"],
  };
}

describe("🌉 GuaraniToken Bridge Tests", function () {
  let deployer, user, relayer;
  let tokenL1, tokenL2, sender, receiver, verifier;
  let deployerAddr, userAddr, relayerAddr;

  beforeEach(async function () {
    [deployer, user, relayer] = await ethers.getSigners();
    deployerAddr = deployer.address;
    userAddr = user.address;
    relayerAddr = relayer.address;

    console.log(`\n📋 Test Setup:`);
    console.log(`   Deployer: ${deployerAddr}`);
    console.log(`   User:     ${userAddr}`);
    console.log(`   Relayer:  ${relayerAddr}`);
  });

  // Helper: despliega Verifier + Receiver
  async function deployReceiverWithVerifier(tokenL2Addr, relAddr) {
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const Receiver = await ethers.getContractFactory("Receiver");
    const recv = await Receiver.deploy(tokenL2Addr, relAddr, verifier.target);
    await recv.waitForDeployment();
    return recv;
  }

  describe("🔧 1. CONTRACT DEPLOYMENT TESTS", function () {
    it("✅ Should deploy GuaraniToken L1 with initial supply", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(ethers.parseUnits("1000000", 18));
      await tokenL1.waitForDeployment();

      const balance = await tokenL1.balanceOf(deployerAddr);
      expect(balance).to.equal(ethers.parseUnits("1000000", 18));

      console.log(`   ✅ TokenL1 deployed: ${tokenL1.target}`);
      console.log(`   ✅ Initial supply: ${ethers.formatUnits(balance, 18)} GUA`);
    });

    it("✅ Should deploy GuaraniToken L2 with zero supply", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL2 = await Token.deploy(0);
      await tokenL2.waitForDeployment();

      const balance = await tokenL2.balanceOf(deployerAddr);
      expect(balance).to.equal(0);

      console.log(`   ✅ TokenL2 deployed: ${tokenL2.target}`);
      console.log(`   ✅ Initial supply: ${ethers.formatUnits(balance, 18)} GUA`);
    });

    it("✅ Should deploy Sender contract", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(ethers.parseUnits("1000000", 18));

      const Sender = await ethers.getContractFactory("Sender");
      sender = await Sender.deploy(tokenL1.target);
      await sender.waitForDeployment();

      expect(await sender.token()).to.equal(tokenL1.target);
      expect(await sender.nonce()).to.equal(0);

      console.log(`   ✅ Sender deployed: ${sender.target}`);
    });

    it("✅ Should deploy Receiver contract with Verifier and grant MINTER_ROLE", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL2 = await Token.deploy(0);

      receiver = await deployReceiverWithVerifier(tokenL2.target, relayerAddr);

      // Grant MINTER_ROLE to receiver
      await tokenL2.grantRole(await tokenL2.MINTER_ROLE(), receiver.target);

      expect(await receiver.token()).to.equal(tokenL2.target);
      expect(await receiver.relayer()).to.equal(relayerAddr);
      expect(await receiver.verifier()).to.equal(verifier.target);

      const hasRole = await tokenL2.hasRole(await tokenL2.MINTER_ROLE(), receiver.target);
      expect(hasRole).to.be.true;

      console.log(`   ✅ Receiver deployed: ${receiver.target}`);
      console.log(`   ✅ Verifier deployed: ${verifier.target}`);
      console.log(`   ✅ MINTER_ROLE granted to Receiver`);
    });
  });

  describe("🔒 2. LOCK FUNCTION TESTS", function () {
    beforeEach(async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(ethers.parseUnits("1000000", 18));

      const Sender = await ethers.getContractFactory("Sender");
      sender = await Sender.deploy(tokenL1.target);

      await tokenL1.transfer(userAddr, ethers.parseUnits("1000", 18));
    });

    it("❌ Should fail to lock without approval", async function () {
      const amount = ethers.parseUnits("100", 18);

      await expect(
        sender.connect(user).lock(userAddr, amount)
      ).to.be.revertedWith("Sender: approve first");

      console.log(`   ✅ Lock correctly fails without approval`);
    });

    it("✅ Should lock tokens and emit Locked event", async function () {
      const amount = ethers.parseUnits("100", 18);

      await tokenL1.connect(user).approve(sender.target, amount);

      const allowance = await tokenL1.allowance(userAddr, sender.target);
      expect(allowance).to.equal(amount);
      console.log(`   ✅ Approval confirmed: ${ethers.formatUnits(allowance, 18)} GUA`);

      const tx = await sender.connect(user).lock(userAddr, amount);
      const receipt = await tx.wait();

      const events = receipt.logs.map(log => {
        try { return sender.interface.parseLog(log); } catch { return null; }
      }).filter(e => e && e.name === "Locked");

      expect(events.length).to.be.greaterThan(0);
      const lockedEvent = events[0];
      expect(lockedEvent.name).to.equal("Locked");
      expect(lockedEvent.args.id).to.equal(0);
      expect(lockedEvent.args.from).to.equal(userAddr);
      expect(lockedEvent.args.to).to.equal(userAddr);
      expect(lockedEvent.args.amount).to.equal(amount);

      expect(await sender.nonce()).to.equal(1);

      const senderBalance = await tokenL1.balanceOf(sender.target);
      expect(senderBalance).to.equal(amount);

      console.log(`   ✅ Lock successful:`);
      console.log(`      - Event ID: ${lockedEvent.args.id}`);
      console.log(`      - Amount: ${ethers.formatUnits(amount, 18)} GUA`);
      console.log(`      - Sender balance: ${ethers.formatUnits(senderBalance, 18)} GUA`);
    });
  });

  describe("🏭 3. MINT FUNCTION TESTS (with ZK proof)", function () {
    beforeEach(async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL2 = await Token.deploy(0);

      receiver = await deployReceiverWithVerifier(tokenL2.target, relayerAddr);
      await tokenL2.grantRole(await tokenL2.MINTER_ROLE(), receiver.target);
    });

    it("❌ Should fail mint from non-relayer", async function () {
      const { pA, pB, pC, pubSignals } = await generateProofForContract(3, 11);
      await expect(
        receiver.connect(user).mintRemote(0, userAddr, ethers.parseUnits("100", 18), pA, pB, pC, pubSignals)
      ).to.be.revertedWith("Receiver: not relayer");

      console.log(`   ✅ mintRemote correctly fails from non-relayer`);
    });

    it("❌ Should fail mint with invalid proof", async function () {
      const { pA, pB, pC, pubSignals } = fakeProof();
      await expect(
        receiver.connect(relayer).mintRemote(0, userAddr, ethers.parseUnits("100", 18), pA, pB, pC, pubSignals)
      ).to.be.revertedWith("Receiver: invalid proof");

      console.log(`   ✅ mintRemote correctly fails with invalid proof`);
    });

    it("✅ Should mint tokens with valid ZK proof", async function () {
      const amount = ethers.parseUnits("100", 18);
      const id = 0;

      const { pA, pB, pC, pubSignals } = await generateProofForContract(id, amount);
      const tx = await receiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals);
      await tx.wait();

      const userBalance = await tokenL2.balanceOf(userAddr);
      expect(userBalance).to.equal(amount);
      expect(await receiver.processed(id)).to.be.true;

      console.log(`   ✅ Mint with valid proof successful:`);
      console.log(`      - User balance: ${ethers.formatUnits(userBalance, 18)} GUA`);
      console.log(`      - ID ${id} marked as processed`);
    });

    it("❌ Should fail replay attack", async function () {
      const amount = ethers.parseUnits("100", 18);
      const id = 0;

      const { pA, pB, pC, pubSignals } = await generateProofForContract(id, amount);
      await receiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals);

      await expect(
        receiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals)
      ).to.be.revertedWith("Receiver: replay");

      console.log(`   ✅ Replay protection working`);
    });
  });

  describe("🔗 4. FULL BRIDGE FLOW TEST (with ZK proof)", function () {
    it("✅ Should complete full bridge flow (L1 → L2) with ZK verification", async function () {
      // 1. Deploy all contracts
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(ethers.parseUnits("1000000", 18));
      tokenL2 = await Token.deploy(0);

      const Sender = await ethers.getContractFactory("Sender");
      sender = await Sender.deploy(tokenL1.target);

      receiver = await deployReceiverWithVerifier(tokenL2.target, relayerAddr);
      await tokenL2.grantRole(await tokenL2.MINTER_ROLE(), receiver.target);

      // 2. Setup user
      const amount = ethers.parseUnits("100", 18);
      await tokenL1.transfer(userAddr, amount);
      await tokenL1.connect(user).approve(sender.target, amount);

      console.log(`\n🌉 FULL BRIDGE FLOW TEST (with ZK proof):`);
      console.log(`   Initial L1 user balance: ${ethers.formatUnits(await tokenL1.balanceOf(userAddr), 18)} GUA`);
      console.log(`   Initial L2 user balance: ${ethers.formatUnits(await tokenL2.balanceOf(userAddr), 18)} GUA`);

      // 3. Lock on L1
      const lockTx = await sender.connect(user).lock(userAddr, amount);
      const lockReceipt = await lockTx.wait();

      const lockEvents = lockReceipt.logs.filter(log => {
        try { return sender.interface.parseLog(log); } catch { return false; }
      });
      const lockEvent = sender.interface.parseLog(lockEvents[0]);

      console.log(`   🔒 L1 Lock completed:`);
      console.log(`      - Event ID: ${lockEvent.args.id}`);
      console.log(`      - Amount: ${ethers.formatUnits(lockEvent.args.amount, 18)} GUA`);

      // 4. Generate ZK proof
      const { pA, pB, pC, pubSignals } = await generateProofForContract(
        lockEvent.args.id,
        lockEvent.args.amount
      );
      console.log(`   🔐 ZK Proof generated`);

      // 5. Mint on L2 with proof verification
      const mintTx = await receiver.connect(relayer).mintRemote(
        lockEvent.args.id,
        lockEvent.args.to,
        lockEvent.args.amount,
        pA, pB, pC, pubSignals
      );
      await mintTx.wait();

      console.log(`   🏭 L2 Mint completed (proof verified on-chain)`);

      // 6. Verify final balances
      const finalL1UserBalance = await tokenL1.balanceOf(userAddr);
      const finalL2UserBalance = await tokenL2.balanceOf(userAddr);
      const senderBalance = await tokenL1.balanceOf(sender.target);

      expect(finalL1UserBalance).to.equal(0);
      expect(finalL2UserBalance).to.equal(amount);
      expect(senderBalance).to.equal(amount);

      console.log(`   ✅ Final balances:`);
      console.log(`      - L1 user: ${ethers.formatUnits(finalL1UserBalance, 18)} GUA`);
      console.log(`      - L2 user: ${ethers.formatUnits(finalL2UserBalance, 18)} GUA`);
      console.log(`      - L1 sender: ${ethers.formatUnits(senderBalance, 18)} GUA`);
      console.log(`   🎉 BRIDGE FLOW WITH ZK VERIFICATION SUCCESSFUL!`);
    });
  });
});
