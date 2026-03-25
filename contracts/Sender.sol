// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuaraniToken.sol";

contract Sender {
    GuaraniToken public immutable token;
    uint256 public nonce;

    struct Lock {
    address from;
    address to;
    uint256 amount;
    }

    mapping(uint256 => Lock) public locks;

    event Locked(
        uint256 indexed id,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    constructor(GuaraniToken _token) {
        token = _token;
    }

    /// El usuario (L1) aprueba y después llama a lock()
    function lock(address recipientL2, uint256 amount) external {
        require(recipientL2 != address(0), "Sender: bad recipient");
        require(amount > 0, "Sender: bad amount");
        require(
            token.allowance(msg.sender, address(this)) >= amount,
            "Sender: approve first"
        );
        token.transferFrom(msg.sender, address(this), amount); // el dueno le esta pasando los guarani tokens al contrato

        locks[nonce] = Lock(msg.sender, recipientL2, amount);
        emit Locked(nonce, msg.sender, recipientL2, amount);
        nonce++;
    }

    function lockedBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}
