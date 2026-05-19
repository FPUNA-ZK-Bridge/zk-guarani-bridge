import { expect } from "chai";
import hre from "hardhat";
import * as snarkjs from "snarkjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { ethers } = hre;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rutas a los artefactos del nuevo circuito VerifyHeaderMock(512, 7)
const WASM_PATH = path.resolve(__dirname, "../circom/verify_header/verify_header.wasm");
const ZKEY_PATH = path.resolve(__dirname, "../circom/verify_header/verify_header_0001.zkey");
// Fixture con un input válido ya computado del beacon node.
// Si no existe, los tests de prueba ZK se saltan.
const INPUT_FIXTURE = path.resolve(__dirname, "../circom/verify_header/input.json");

// Los proof-path tests necesitan:
//   1) wasm + zkey del nuevo circuito (generarlos con `snarkjs groth16 setup` + contribute)
//   2) un input.json válido (lo genera el relayer a partir del beacon node)
// Saltamos automáticamente si falta alguno.
const hasProofArtifacts =
  fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH) && fs.existsSync(INPUT_FIXTURE);
// SKIP_ZK=1 disables the slow ZK-proof tests (used during mutation testing).
const skipZkEnv = process.env.SKIP_ZK === "1";
const describeProof = (hasProofArtifacts && !skipZkEnv) ? describe : describe.skip;

async function generateProofForContract() {
  const input = JSON.parse(fs.readFileSync(INPUT_FIXTURE, "utf8"));
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [
    [proof.pi_b[0][1], proof.pi_b[0][0]],
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ];
  const pC = [proof.pi_c[0], proof.pi_c[1]];
  const pubSignals = publicSignals.map(String);
  return { pA, pB, pC, pubSignals };
}

// Helper: proof falsa con el tamaño correcto de pubSignals (4)
function fakeProof() {
  return {
    pA: ["0", "0"],
    pB: [["0", "0"], ["0", "0"]],
    pC: ["0", "0"],
    pubSignals: ["0", "0", "0", "0"],
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

    it("❌ Should fail to lock with zero recipient", async function () {
      const amount = ethers.parseUnits("100", 18);
      await tokenL1.connect(user).approve(sender.target, amount);

      await expect(
        sender.connect(user).lock(ethers.ZeroAddress, amount)
      ).to.be.revertedWith("Sender: bad recipient");

      console.log(`   ✅ Lock correctly fails with zero recipient`);
    });

    it("❌ Should fail to lock with zero amount", async function () {
      await expect(
        sender.connect(user).lock(userAddr, 0)
      ).to.be.revertedWith("Sender: bad amount");

      console.log(`   ✅ Lock correctly fails with zero amount`);
    });

    it("❌ Should fail to lock without approval", async function () {
      const amount = ethers.parseUnits("100", 18);

      await expect(
        sender.connect(user).lock(userAddr, amount)
      ).to.be.revertedWith("Sender: approve first");

      console.log(`   ✅ Lock correctly fails without approval`);
    });

    it("✅ lockedBalance() should reflect tokens held by Sender", async function () {
      const amount = ethers.parseUnits("250", 18);

      expect(await sender.lockedBalance()).to.equal(0);

      await tokenL1.connect(user).approve(sender.target, amount);
      await sender.connect(user).lock(userAddr, amount);

      expect(await sender.lockedBalance()).to.equal(amount);
      console.log(`   ✅ lockedBalance() returns ${ethers.formatUnits(amount, 18)} GUA`);
    });

    it("✅ Should expose Lock struct via locks(id) mapping", async function () {
      const amount = ethers.parseUnits("75", 18);
      await tokenL1.connect(user).approve(sender.target, amount);
      await sender.connect(user).lock(userAddr, amount);

      const stored = await sender.locks(0);
      expect(stored.from).to.equal(userAddr);
      expect(stored.to).to.equal(userAddr);
      expect(stored.amount).to.equal(amount);
      console.log(`   ✅ locks(0) returns stored Lock`);
    });

    it("✅ Should accept the minimum positive amount (1 wei)", async function () {
      await tokenL1.connect(user).approve(sender.target, 1);
      await expect(sender.connect(user).lock(userAddr, 1))
        .to.emit(sender, "Locked").withArgs(0, userAddr, userAddr, 1);

      expect(await sender.nonce()).to.equal(1);
      console.log(`   ✅ Lock with amount=1 wei succeeded`);
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

  describe("🪙 2.5. GUARANI TOKEN ROLE TESTS", function () {
    it("✅ Token exposes name 'GuaraniToken' and symbol 'GUA'", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(0);

      expect(await tokenL1.name()).to.equal("GuaraniToken");
      expect(await tokenL1.symbol()).to.equal("GUA");
      console.log(`   ✅ name='GuaraniToken' symbol='GUA'`);
    });

    it("✅ MINTER_ROLE equals keccak256('MINTER_ROLE')", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(0);

      const expected = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
      expect(await tokenL1.MINTER_ROLE()).to.equal(expected);
      console.log(`   ✅ MINTER_ROLE = ${expected}`);
    });

    it("✅ Constructor grants DEFAULT_ADMIN_ROLE and MINTER_ROLE to deployer", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(0);

      const adminRole = await tokenL1.DEFAULT_ADMIN_ROLE();
      const minterRole = await tokenL1.MINTER_ROLE();

      expect(await tokenL1.hasRole(adminRole, deployerAddr)).to.be.true;
      expect(await tokenL1.hasRole(minterRole, deployerAddr)).to.be.true;
      console.log(`   ✅ Roles granted to deployer`);
    });

    it("✅ MINTER_ROLE holder can mint", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(0);

      const amount = ethers.parseUnits("42", 18);
      await tokenL1.mint(userAddr, amount);

      expect(await tokenL1.balanceOf(userAddr)).to.equal(amount);
      console.log(`   ✅ Minted ${ethers.formatUnits(amount, 18)} GUA to user`);
    });

    it("❌ Non-MINTER cannot mint", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(0);

      await expect(
        tokenL1.connect(user).mint(userAddr, ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(tokenL1, "AccessControlUnauthorizedAccount");

      console.log(`   ✅ Non-MINTER mint correctly reverts`);
    });

    it("✅ Admin can grant MINTER_ROLE to a third party", async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL1 = await Token.deploy(0);

      const minterRole = await tokenL1.MINTER_ROLE();
      await tokenL1.grantRole(minterRole, userAddr);

      await tokenL1.connect(user).mint(userAddr, ethers.parseUnits("5", 18));
      expect(await tokenL1.balanceOf(userAddr)).to.equal(ethers.parseUnits("5", 18));
      console.log(`   ✅ Granted MINTER_ROLE and minted successfully`);
    });
  });

  describe("🛡️  3a. RECEIVER REVERT TESTS (no ZK proof needed)", function () {
    beforeEach(async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL2 = await Token.deploy(0);

      receiver = await deployReceiverWithVerifier(tokenL2.target, relayerAddr);
      await tokenL2.grantRole(await tokenL2.MINTER_ROLE(), receiver.target);
    });

    it("❌ Should fail mint from non-relayer (fake proof)", async function () {
      const { pA, pB, pC, pubSignals } = fakeProof();
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

    it("✅ Constructor wires token / relayer / verifier", async function () {
      expect(await receiver.token()).to.equal(tokenL2.target);
      expect(await receiver.relayer()).to.equal(relayerAddr);
      expect(await receiver.verifier()).to.equal(verifier.target);
      expect(await receiver.processed(0)).to.be.false;
      console.log(`   ✅ Receiver state correctly initialized`);
    });
  });

  describe("🧪 3c. RECEIVER HAPPY-PATH TESTS (MockVerifier, fast)", function () {
    let mockVerifier, mockReceiver;

    beforeEach(async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL2 = await Token.deploy(0);

      const MockVerifier = await ethers.getContractFactory("MockVerifier");
      mockVerifier = await MockVerifier.deploy();
      await mockVerifier.waitForDeployment();

      const Receiver = await ethers.getContractFactory("Receiver");
      mockReceiver = await Receiver.deploy(tokenL2.target, relayerAddr, mockVerifier.target);
      await mockReceiver.waitForDeployment();

      await tokenL2.grantRole(await tokenL2.MINTER_ROLE(), mockReceiver.target);
    });

    it("✅ mintRemote mints tokens, marks processed and emits Minted", async function () {
      const amount = ethers.parseUnits("100", 18);
      const id = 7;
      const { pA, pB, pC, pubSignals } = fakeProof();

      await expect(
        mockReceiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals)
      ).to.emit(mockReceiver, "Minted").withArgs(id, userAddr, amount);

      expect(await tokenL2.balanceOf(userAddr)).to.equal(amount);
      expect(await mockReceiver.processed(id)).to.be.true;
      console.log(`   ✅ Mint flow validated against MockVerifier`);
    });

    it("❌ Replay attack reverts on second mintRemote with same id", async function () {
      const amount = ethers.parseUnits("100", 18);
      const id = 7;
      const { pA, pB, pC, pubSignals } = fakeProof();

      await mockReceiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals);

      await expect(
        mockReceiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals)
      ).to.be.revertedWith("Receiver: replay");
      console.log(`   ✅ Replay protection working`);
    });

    it("❌ Reverts when MockVerifier returns false", async function () {
      await mockVerifier.setResult(false);
      const { pA, pB, pC, pubSignals } = fakeProof();

      await expect(
        mockReceiver.connect(relayer).mintRemote(0, userAddr, 1, pA, pB, pC, pubSignals)
      ).to.be.revertedWith("Receiver: invalid proof");
      console.log(`   ✅ verifier.verifyProof()==false rejected`);
    });

    it("✅ Different ids can be processed independently", async function () {
      const amount = ethers.parseUnits("10", 18);
      const { pA, pB, pC, pubSignals } = fakeProof();

      await mockReceiver.connect(relayer).mintRemote(1, userAddr, amount, pA, pB, pC, pubSignals);
      await mockReceiver.connect(relayer).mintRemote(2, userAddr, amount, pA, pB, pC, pubSignals);

      expect(await tokenL2.balanceOf(userAddr)).to.equal(amount * 2n);
      expect(await mockReceiver.processed(1)).to.be.true;
      expect(await mockReceiver.processed(2)).to.be.true;
      console.log(`   ✅ Two distinct ids minted`);
    });
  });

  describeProof("🏭 3b. MINT FUNCTION TESTS (with ZK proof)", function () {
    this.timeout(600000);

    beforeEach(async function () {
      const Token = await ethers.getContractFactory("GuaraniToken");
      tokenL2 = await Token.deploy(0);

      receiver = await deployReceiverWithVerifier(tokenL2.target, relayerAddr);
      await tokenL2.grantRole(await tokenL2.MINTER_ROLE(), receiver.target);
    });

    it("✅ Should mint tokens with valid ZK proof", async function () {
      const amount = ethers.parseUnits("100", 18);
      const id = 0;

      const { pA, pB, pC, pubSignals } = await generateProofForContract();
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

      const { pA, pB, pC, pubSignals } = await generateProofForContract();
      await receiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals);

      await expect(
        receiver.connect(relayer).mintRemote(id, userAddr, amount, pA, pB, pC, pubSignals)
      ).to.be.revertedWith("Receiver: replay");

      console.log(`   ✅ Replay protection working`);
    });
  });

  describeProof("🔗 4. FULL BRIDGE FLOW TEST (with ZK proof)", function () {
    this.timeout(600000);

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
