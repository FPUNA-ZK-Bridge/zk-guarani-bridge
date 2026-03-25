// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Updater.sol (MVP / prototipo)
 *
 * Idea: este contrato vive en C2 y mantiene un "estado aceptado" de C1
 * para que el Receiver pueda verificar (on-chain) que un lock fue "provenido"
 * antes de mintear.
 *
 * ⚠️ Importante: Este Updater NO valida light-client real (ni BLS, ni zk).
 * Es un "esqueleto" con control de acceso + registro de roots/locks aceptados.
 * Luego lo reemplazás por verificación real de headers/receipts/zk.
 */
contract Updater {
    // Quién está autorizado a "actualizar" (tu relayer / updater backend)
    address public immutable updater;

    // Identidad del origen (C1). Esto evita colisiones entre orígenes.
    uint256 public immutable sourceChainId;
    address public immutable sourceSender;

    // Root "aceptado" más reciente (placeholder: podría ser blockRoot/stateRoot/etc)
    bytes32 public latestAcceptedRoot;
    uint256 public latestAcceptedBlock;

    // locks aceptados (clave domain-separated)
    mapping(bytes32 => bool) public acceptedLock;

    event HeaderAccepted(uint256 indexed blockNumber, bytes32 indexed root);
    event LockAccepted(bytes32 indexed key, uint256 indexed id, address indexed to, uint256 amount);

    modifier onlyUpdater() {
        require(msg.sender == updater, "Updater: not updater");
        _;
    }

    constructor(address _updater, uint256 _sourceChainId, address _sourceSender) {
        require(_updater != address(0), "Updater: bad updater");
        require(_sourceSender != address(0), "Updater: bad sender");

        updater = _updater;
        sourceChainId = _sourceChainId;
        sourceSender = _sourceSender;
    }

    /**
     * MVP: "actualiza" el estado aceptado de C1.
     * En un light client real, aca verificarias proofs (sync committee / zk / etc).
     */
    function acceptHeader(uint256 blockNumber, bytes32 root) external onlyUpdater {
        // opcional: exigir monotonía (que no retroceda)
        require(blockNumber >= latestAcceptedBlock, "Updater: stale block");

        latestAcceptedBlock = blockNumber;
        latestAcceptedRoot = root;

        emit HeaderAccepted(blockNumber, root);
    }

    /**
     * MVP: marca un lock como aceptado en C2.
     *
     * En un bridge real, esto se derivaria de una prueba:
     * - receipt/log proof (Locked event) contra un header aceptado
     * - o zk proof
     *
     * Aquí lo dejamos como "updater decide" para mantener el esqueleto.
     */
    function acceptLock(uint256 id, address to, uint256 amount) external onlyUpdater {
        require(to != address(0), "Updater: bad recipient");
        require(amount > 0, "Updater: bad amount");

        bytes32 key = lockKey(id, to, amount);
        acceptedLock[key] = true;

        emit LockAccepted(key, id, to, amount);
    }

    /// El Receiver llamará esto antes de mintear.
    function isAcceptedLock(uint256 id, address to, uint256 amount) external view returns (bool) {
        return acceptedLock[lockKey(id, to, amount)];
    }

    /// Domain separation + contenido del lock
    function lockKey(uint256 id, address to, uint256 amount) public view returns (bytes32) {
        return keccak256(abi.encodePacked(sourceChainId, sourceSender, id, to, amount));
    }
}
