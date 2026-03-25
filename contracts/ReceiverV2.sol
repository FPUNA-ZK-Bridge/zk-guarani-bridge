// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GuaraniToken.sol";

interface IUpdater {
    function isAcceptedLock(uint256 id, address to, uint256 amount) external view returns (bool);
    function lockKey(uint256 id, address to, uint256 amount) external view returns (bytes32);
}

/**
 * Receiver.sol (V2 con Updater)
 *
 * - Vive en C2 (receiver chain)
 * - Solo el relayer puede ejecutar mintRemote (paga gas y coordina)
 * - PERO el mint solo se permite si el Updater ya "aceptó" el lock de C1
 * - Anti-replay: processed[key] para no mintear dos veces el mismo lock
 *
 * ⚠️ Nota: la seguridad real dependerá de cómo el Updater acepta locks.
 * En este MVP, el Updater puede ser "trusted" (soloUpdater).
 * Luego reemplazás acceptLock por verificación real (light-client/zk).
 */
contract ReceiverV2 {
    GuaraniToken public immutable token;
    address public immutable relayer;
    IUpdater public immutable updater;

    // anti-replay por clave domain-separated (derivada en Updater)
    mapping(bytes32 => bool) public processed;

    event Minted(uint256 indexed id, address indexed to, uint256 amount, bytes32 indexed key);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Receiver: not relayer");
        _;
    }

    constructor(GuaraniToken _token, address _relayer, IUpdater _updater) {
        require(address(_token) != address(0), "Receiver: bad token");
        require(_relayer != address(0), "Receiver: bad relayer");
        require(address(_updater) != address(0), "Receiver: bad updater");

        token = _token;
        relayer = _relayer;
        updater = _updater;
    }

    function mintRemote(uint256 id, address to, uint256 amount) external onlyRelayer {
        require(to != address(0), "Receiver: bad recipient");
        require(amount > 0, "Receiver: bad amount");

        // Debe estar aceptado por el Updater (estado validado/probado de C1)
        require(updater.isAcceptedLock(id, to, amount), "Receiver: lock not accepted");

        // Anti-replay usando la misma key del Updater
        bytes32 key = updater.lockKey(id, to, amount);
        require(!processed[key], "Receiver: replay");
        processed[key] = true;

        token.mint(to, amount);
        emit Minted(id, to, amount, key);
    }
}
