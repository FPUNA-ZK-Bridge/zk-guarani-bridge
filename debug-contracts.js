import { ethers } from "ethers";
import fs from "fs";

async function debugContracts() {
    try {
        console.log("=== DEBUGGING CONTRACTS ===");
        
        // Connect to L1
        const provider = new ethers.JsonRpcProvider("http://localhost:8545");
        const accounts = await provider.listAccounts();
        console.log(`Connected to L1. Available accounts: ${accounts.length}`);
        
        // Read deploy info
        const deployN1 = JSON.parse(fs.readFileSync('./deploy-N1.json', 'utf8'));
        console.log("Deploy N1:", deployN1);
        
        // Check if contracts exist
        const tokenCode = await provider.getCode(deployN1.token);
        const senderCode = await provider.getCode(deployN1.sender);
        
        console.log(`Token contract code length: ${tokenCode.length}`);
        console.log(`Sender contract code length: ${senderCode.length}`);
        
        if (tokenCode === "0x" || senderCode === "0x") {
            console.log("❌ Contracts not deployed!");
            return;
        }
        
        // Get a signer
        const signer = await provider.getSigner(0);
        console.log(`Using signer: ${signer.address}`);
        
        // Load ABIs
        const tokenArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/GuaraniToken.sol/GuaraniToken.json'));
        const senderArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/Sender.sol/Sender.json'));
        
        // Create contract instances
        const token = new ethers.Contract(deployN1.token, tokenArtifact.abi, signer);
        const sender = new ethers.Contract(deployN1.sender, senderArtifact.abi, signer);
        
        // Check token details
        const name = await token.name();
        const symbol = await token.symbol();
        const balance = await token.balanceOf(signer.address);
        
        console.log(`Token: ${name} (${symbol})`);
        console.log(`Balance: ${ethers.formatUnits(balance, 18)} GUA`);
        
        // Check allowance
        const allowance = await token.allowance(signer.address, deployN1.sender);
        console.log(`Allowance: ${ethers.formatUnits(allowance, 18)} GUA`);
        
        // Check sender details
        const tokenAddress = await sender.token();
        const nonce = await sender.nonce();
        
        console.log(`Sender token: ${tokenAddress}`);
        console.log(`Sender nonce: ${nonce}`);
        
        console.log("✅ All contracts are working correctly");
        
    } catch (error) {
        console.error("❌ Error:", error);
    }
}

debugContracts();