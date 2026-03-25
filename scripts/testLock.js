import { ethers } from "ethers";
import "dotenv/config";
import fs from "fs";

async function testLock() {
  try {
    // Read deployment info
    const deployN1 = JSON.parse(fs.readFileSync('deploy-N1.json', 'utf8'));
    
    // Connect to L1 network
    const provider = new ethers.JsonRpcProvider("http://hardhat-n1:8545");
    const wallet = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    console.log("Connected with:", wallet.address);
    console.log("Token address:", deployN1.token);
    console.log("Sender address:", deployN1.sender);
    
    // Get current nonce to avoid conflicts
    let currentNonce = await provider.getTransactionCount(wallet.address);
    console.log("Current nonce:", currentNonce);
    
    // Load ABIs
    const tokenAbi = JSON.parse(fs.readFileSync('artifacts/contracts/GuaraniToken.sol/GuaraniToken.json', 'utf8')).abi;
    const senderAbi = JSON.parse(fs.readFileSync('artifacts/contracts/Sender.sol/Sender.json', 'utf8')).abi;
    
    // Create contract instances
    const token = new ethers.Contract(deployN1.token, tokenAbi, wallet);
    const sender = new ethers.Contract(deployN1.sender, senderAbi, wallet);
    
    // Check balance
    const balance = await token.balanceOf(wallet.address);
    console.log("Current balance:", ethers.formatUnits(balance, 18), "GUA");
    
    // Check allowance
    const allowance = await token.allowance(wallet.address, deployN1.sender);
    console.log("Current allowance:", ethers.formatUnits(allowance, 18), "GUA");
    
    const amount = ethers.parseUnits("10", 18);
    const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    // Approve if needed
    currentNonce = await provider.getTransactionCount(wallet.address);
    if (allowance < amount) {
      console.log("Approving tokens...");
      console.log("Using nonce:", currentNonce);
      const approveTx = await token.approve(deployN1.sender, amount, {
        nonce: currentNonce
      });
      await approveTx.wait();
      console.log("✅ Approved");
      currentNonce++; // Increment for next transaction
    }
    
    // Try to lock
    console.log("Attempting to lock tokens...");
    console.log("Amount:", ethers.formatUnits(amount, 18));
    console.log("Recipient:", recipient);
    console.log("Using nonce for lock:", currentNonce);
    
    const lockTx = await sender.lock(recipient, amount, {
      nonce: currentNonce
    });
    console.log("🔄 Transaction sent:", lockTx.hash);
    
    const receipt = await lockTx.wait();
    console.log("✅ Lock successful!");
    console.log("Gas used:", receipt.gasUsed.toString());
    
    // Check new balance
    const newBalance = await token.balanceOf(wallet.address);
    console.log("New balance:", ethers.formatUnits(newBalance, 18), "GUA");
    
    // Check nonce
    const nonce = await sender.nonce();
    console.log("Sender nonce:", nonce.toString());
    
  } catch (error) {
    console.error("❌ Error:", error);
    if (error.data) {
      console.error("Error data:", error.data);
    }
    if (error.reason) {
      console.error("Error reason:", error.reason);
    }
  }
}

testLock();