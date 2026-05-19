// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuaraniToken.sol";
import "./IVerifier.sol";

contract Receiver {
    GuaraniToken public immutable token;
    address public immutable relayer;
    IVerifier public immutable verifier;
    mapping(uint256 => bool) public processed;

    event Minted(
        uint256 indexed id,
        address indexed to,
        uint256 amount
    );

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Receiver: not relayer");
        _;
    }

    constructor(GuaraniToken _token, address _relayer, IVerifier _verifier) {
        token = _token;
        relayer = _relayer;
        verifier = _verifier;
    }

    function mintRemote(
        uint256 id,
        address to,
        uint256 amount,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[4] calldata _pubSignals
    ) external onlyRelayer {
        require(!processed[id], "Receiver: replay");
        require(
            verifier.verifyProof(_pA, _pB, _pC, _pubSignals),
            "Receiver: invalid proof"
        );
        processed[id] = true;
        token.mint(to, amount);
        emit Minted(id, to, amount);
    }
}
