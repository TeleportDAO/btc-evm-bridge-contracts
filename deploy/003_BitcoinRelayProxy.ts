import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';
import verify from "../helper-functions"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, network } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const bitcoinRelayLogic = await deployments.get("BitcoinRelayLogic")

    let theArgs = [
        bitcoinRelayLogic.address,
        deployer,
        "0x"
    ]

    const deployedContract = await deploy("BitcoinRelayProxy", {
        from: deployer,
        log: true,
        skipIfAlreadyDeployed: true,
        args: theArgs,
    });

    if (network.name != "hardhat" && process.env.ETHERSCAN_API_KEY && process.env.VERIFY_OPTION == "1") {
        await verify(
            deployedContract.address, 
            theArgs, 
            "contracts/relay/BitcoinRelayProxy.sol:BitcoinRelayProxy"
        )
    }
};

export default func;
func.tags = ["BitcoinRelayProxy"];
