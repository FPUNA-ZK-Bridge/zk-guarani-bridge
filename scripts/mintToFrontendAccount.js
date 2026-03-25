import { ethers } from "ethers";
import "dotenv/config";
import fs from "fs";

async function mintToAccount() {
  try {
    // Read deployment info
    const deployN1 = JSON.parse(fs.readFileSync('deploy-N1.json', 'utf8'));
    
    // Connect to L1 network
    const provider = new ethers.JsonRpcProvider("http://hardhat-n1:8545");
    const deployer = new ethers.Wallet("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", provider);
    
    // Target account (the one MetaMask is using)
    const targetAccount = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    console.log("Minting tokens to:", targetAccount);
    
    // Load Token ABI
    const tokenAbi = JSON.parse(fs.readFileSync('artifacts/contracts/GuaraniToken.sol/GuaraniToken.json', 'utf8')).abi;
    
    // Create contract instance
    const token = new ethers.Contract(deployN1.token, tokenAbi, deployer);
    
    // Check current balance
    const currentBalance = await token.balanceOf(targetAccount);
    console.log("Current balance:", ethers.formatUnits(currentBalance, 18), "GUA");
    
    // Mint 1000 tokens
    const amount = ethers.parseUnits("1000", 18);
    console.log("Minting 1000 GUA tokens...");
    
    const mintTx = await token.mint(targetAccount, amount);
    console.log("🔄 Transaction sent:", mintTx.hash);
    
    const receipt = await mintTx.wait();
    console.log("✅ Mint successful!");
    
    // Check new balance
    const newBalance = await token.balanceOf(targetAccount);
    console.log("New balance:", ethers.formatUnits(newBalance, 18), "GUA");
    
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

mintToAccount();