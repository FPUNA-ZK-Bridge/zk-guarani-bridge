// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VerifierStub {
    function verify(bytes calldata /*proof*/, bytes32 /*commitment*/)
        external
        pure
        returns (bool)
    {
        return true; // reemplázalo por un verificador Noir/Plonk cuando lo tengas
    }
}
