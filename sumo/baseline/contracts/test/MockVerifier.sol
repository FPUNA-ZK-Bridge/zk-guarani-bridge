// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../IVerifier.sol";

/// @notice Test-only verifier whose result can be toggled. NOT for production.
contract MockVerifier is IVerifier {
    bool public result = true;

    function setResult(bool _result) external {
        result = _result;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[4] calldata
    ) external view returns (bool) {
        return result;
    }
}
