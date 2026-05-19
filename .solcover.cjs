module.exports = {
  skipFiles: ["Groth16Verifier.sol", "test/MockVerifier.sol", "IVerifier.sol"],
  istanbulReporter: ["text", "html", "lcov"],
  mocha: {
    timeout: 600000,
  },
};
