import { ethers } from "hardhat";
import { BitcoinInterface } from '@teleportdao/bitcoin';
const logger = require('node-color-log');

/*
    Handle Bitcoin Re-org on BitcoinRelay (mainnet)

    Required env vars:
      FORK_HEIGHT       - The height where the re-org starts (e.g., 941881)
      DESIRED_FIN_PARAM - The finalization parameter to set after recovery
      RELAY_ADDRESS     - The BitcoinRelay proxy address

    Run:
      FORK_HEIGHT=941881 DESIRED_FIN_PARAM=2 RELAY_ADDRESS=0x... npx hardhat run scripts/002-handle-reorg.ts --network polygon
*/

async function main() {
    const FORK_HEIGHT = parseInt(process.env.FORK_HEIGHT || "0");
    const DESIRED_FIN_PARAM = parseInt(process.env.DESIRED_FIN_PARAM || "3");
    const RELAY_ADDRESS = process.env.RELAY_ADDRESS || "";

    if (FORK_HEIGHT === 0) {
        throw new Error("FORK_HEIGHT env var is required.");
    }
    if (!RELAY_ADDRESS) {
        throw new Error("RELAY_ADDRESS env var is required.");
    }

    const relay = await ethers.getContractAt("BitcoinRelayLogic", RELAY_ADDRESS);
    logger.color('blue').bold().log("Relay address:", RELAY_ADDRESS);

    // Setup Bitcoin mainnet interface
    const bitcoinInterface = new BitcoinInterface(
        {
            api: {
                enabled: true,
                provider: 'BlockStream',
                token: null,
            },
        },
        'bitcoin'
    );

    // Read current relay state
    const lastSubmittedHeight = (await relay.lastSubmittedHeight()).toNumber();
    const currentFinParam = (await relay.finalizationParameter()).toNumber();

    logger.color('yellow').bold().log("=== Current Relay State ===");
    logger.log("  lastSubmittedHeight:", lastSubmittedHeight);
    logger.log("  finalizationParameter:", currentFinParam);
    logger.log("  forkHeight (B1):", FORK_HEIGHT);
    logger.log("  desiredFinParam after fix:", DESIRED_FIN_PARAM);

    // Calculate required finalization parameter: X = lastSubmittedHeight + 1 - FORK_HEIGHT
    const requiredFinParam = lastSubmittedHeight + 1 - FORK_HEIGHT;
    logger.color('yellow').log("  requiredFinParam (X):", requiredFinParam);

    if (requiredFinParam <= 0) {
        throw new Error("Invalid: requiredFinParam <= 0. Check FORK_HEIGHT.");
    }
    if (requiredFinParam > 432) {
        throw new Error("requiredFinParam exceeds MAX_FINALIZATION_PARAMETER (432). Gap is too large.");
    }

    // We need: anchor (FORK_HEIGHT - 1) + new headers from FORK_HEIGHT to lastSubmittedHeight + 1
    const anchorHeight = FORK_HEIGHT - 1;
    const targetHeight = lastSubmittedHeight + 1;

    logger.color('blue').bold().log("\n=== Fetching Bitcoin Headers ===");
    logger.log(`  Anchor height: ${anchorHeight}`);
    logger.log(`  Fork headers: ${FORK_HEIGHT} to ${targetHeight}`);

    // Fetch anchor header
    const anchorHeader = await bitcoinInterface.getBlockHeaderHex(anchorHeight);
    logger.log(`  Fetched anchor header at height ${anchorHeight}`);

    // Fetch fork headers
    const headerCount = targetHeight - FORK_HEIGHT + 1;
    let forkHeaders = "";
    for (let h = FORK_HEIGHT; h <= targetHeight; h++) {
        const header = await bitcoinInterface.getBlockHeaderHex(h);
        forkHeaders += header;
        logger.log(`  Fetched header at height ${h}`);
    }

    // Check if any header crosses a retarget boundary (multiple of 2016)
    let hasRetarget = false;
    for (let h = FORK_HEIGHT; h <= targetHeight; h++) {
        if (h % 2016 === 0) {
            hasRetarget = true;
            logger.color('red').bold().log(`  WARNING: Height ${h} is a retarget boundary!`);
            break;
        }
    }

    // --- Step 1: Pause the relay ---
    logger.color('blue').bold().log("\n=== Step 1: Pause Relay ===");
    try {
        const pauseTx = await relay.pauseRelay();
        await pauseTx.wait(1);
        logger.color('green').log("  Relay paused. tx:", pauseTx.hash);
    } catch (e: any) {
        if (e.message && e.message.includes("Pausable: paused")) {
            logger.color('yellow').log("  Relay already paused, continuing...");
        } else {
            throw e;
        }
    }

    // --- Step 2: Set finalization parameter to X ---
    logger.color('blue').bold().log("\n=== Step 2: Set Finalization Parameter ===");
    logger.log(`  Setting finalizationParameter to ${requiredFinParam}`);
    const setFinParamTx = await relay.setFinalizationParameter(requiredFinParam);
    await setFinParamTx.wait(1);
    logger.color('green').log("  Finalization parameter updated. tx:", setFinParamTx.hash);

    // --- Step 3: Submit the new fork using ownerAddHeaders ---
    logger.color('blue').bold().log("\n=== Step 3: Submit New Fork Headers ===");

    if (!hasRetarget) {
        logger.log(`  Submitting ${headerCount} headers (${FORK_HEIGHT} to ${targetHeight})`);
        const submitTx = await relay.ownerAddHeaders(
            '0x' + anchorHeader,
            '0x' + forkHeaders,
            { gasLimit: 3000000 }
        );
        await submitTx.wait(1);
        logger.color('green').log("  Fork headers submitted. tx:", submitTx.hash);
    } else {
        // Find the retarget height
        let retargetHeight = FORK_HEIGHT;
        while (retargetHeight % 2016 !== 0) retargetHeight++;

        // Submit headers before the retarget boundary
        if (retargetHeight > FORK_HEIGHT) {
            let preRetargetHeaders = "";
            for (let h = FORK_HEIGHT; h < retargetHeight; h++) {
                const header = await bitcoinInterface.getBlockHeaderHex(h);
                preRetargetHeaders += header;
            }
            logger.log(`  Submitting pre-retarget headers: ${FORK_HEIGHT} to ${retargetHeight - 1}`);
            const preTx = await relay.ownerAddHeaders(
                '0x' + anchorHeader,
                '0x' + preRetargetHeaders
            );
            await preTx.wait(1);
            logger.color('green').log("  Pre-retarget headers submitted. tx:", preTx.hash);
        }

        // Submit headers at and after the retarget boundary
        const periodStartHeight = retargetHeight - 2016;
        const periodStartHeader = await bitcoinInterface.getBlockHeaderHex(periodStartHeight);
        const periodEndHeight = retargetHeight - 1;
        const periodEndHeader = await bitcoinInterface.getBlockHeaderHex(periodEndHeight);

        let postRetargetHeaders = "";
        for (let h = retargetHeight; h <= targetHeight; h++) {
            const header = await bitcoinInterface.getBlockHeaderHex(h);
            postRetargetHeaders += header;
        }

        logger.log(`  Submitting retarget headers: ${retargetHeight} to ${targetHeight}`);
        const retargetTx = await relay.ownerAddHeadersWithRetarget(
            '0x' + periodStartHeader,
            '0x' + periodEndHeader,
            '0x' + postRetargetHeaders
        );
        await retargetTx.wait(1);
        logger.color('green').log("  Retarget headers submitted. tx:", retargetTx.hash);
    }

    // --- Step 4: Verify the new state ---
    logger.color('blue').bold().log("\n=== Step 4: Verify State ===");
    const newLastSubmittedHeight = (await relay.lastSubmittedHeight()).toNumber();
    logger.log("  New lastSubmittedHeight:", newLastSubmittedHeight);

    const numHeaders = (await relay.getNumberOfSubmittedHeaders(FORK_HEIGHT)).toNumber();
    logger.log(`  Number of headers at fork height ${FORK_HEIGHT}: ${numHeaders}`);

    // --- Step 5: Set finalization parameter to desired value ---
    logger.color('blue').bold().log("\n=== Step 5: Restore Finalization Parameter ===");
    logger.log(`  Setting finalizationParameter to ${DESIRED_FIN_PARAM}`);
    const restoreFinParamTx = await relay.setFinalizationParameter(DESIRED_FIN_PARAM);
    await restoreFinParamTx.wait(1);
    logger.color('green').log("  Finalization parameter restored. tx:", restoreFinParamTx.hash);

    // --- Step 6: Unpause the relay ---
    logger.color('blue').bold().log("\n=== Step 6: Unpause Relay ===");
    const unpauseTx = await relay.unpauseRelay();
    await unpauseTx.wait(1);
    logger.color('green').log("  Relay unpaused. tx:", unpauseTx.hash);

    logger.color('green').bold().log("\n=== Re-org Recovery Complete ===");
    logger.log("  Fork height:", FORK_HEIGHT);
    logger.log("  lastSubmittedHeight:", newLastSubmittedHeight);
    logger.log("  finalizationParameter:", DESIRED_FIN_PARAM);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
