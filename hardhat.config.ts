import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-contract-sizer";
import "@nomicfoundation/hardhat-verify";

dotenv.config();

const config: HardhatUserConfig = {
	solidity: {
		compilers: [
			{
				version: "0.8.20",
				settings: {
					optimizer: {
						enabled: true
					},
				},
			}
		],
	},
	networks: {
		bob: {
			url: "https://rpc.gobob.xyz/",
			chainId: 60808,
			accounts: [process.env.PRIVATE_KEY ?? ""],
		},
		bsquared: {
			url: "https://rpc.bsquared.network",
			chainId: 223,
			accounts: [process.env.PRIVATE_KEY ?? ""],
		},
		polygon: {
			url: "https://polygon-rpc.com",
			chainId: 137,
			accounts: [process.env.PRIVATE_KEY ?? ""],
		},
		amoy: {
			url: "https://rpc-amoy.polygon.technology",
			chainId: 80002,
			accounts: [process.env.PRIVATE_KEY ?? ""],
		},
		bsc: {
			url: "https://bsc-dataseed.binance.org/",
			chainId: 56,
			accounts: [process.env.PRIVATE_KEY ?? ""],
		},
	},	
  	paths: {
		artifacts: "artifacts",
		deploy: "deploy",
		deployments: "deployments",
  	},
  	typechain: {
		outDir: "src/types",
		target: "ethers-v5",
  	},
  	namedAccounts: {
		deployer: {
			default: 0,
		},
  	},
  	gasReporter: {
		enabled: true,
		currency: "USD",
  	},
  	etherscan: {
		apiKey: {
			bsquared: process.env.ETHERSCAN_API_KEY??"",
    		polygon: process.env.ETHERSCAN_API_KEY??"",
			bsc: process.env.ETHERSCAN_API_KEY??"",
			amoy: process.env.ETHERSCAN_API_KEY??"",
			bob: process.env.ETHERSCAN_API_KEY??"",
  		},
		customChains: [
			{
				network: "bsquared",
				chainId: 223,
				urls: {
					apiURL: "https://explorer.bsquared.network/api",
					browserURL: "https://explorer.bsquared.network"
				}
			},
			{
				network: "bob",
				chainId: 60808,
				urls: {
					apiURL: "https://explorer.gobob.xyz/api",
					browserURL: "https://explorer.gobob.xyz/"
				}
			},
			{
				network: "polygon",
				chainId: 137,
				urls: {
					apiURL: "https://api.polygonscan.com/api",
					browserURL: "https://polygonscan.com/"
				}
			},
			{
				network: "bsc",
				chainId: 56,
				urls: {
					apiURL: "https://api.bscscan.com/api",
					browserURL: "https://bscscan.com/"
				}
			},
			{
				network: "amoy",
				chainId: 80002,
				urls: {
					apiURL: "https://api-amoy.polygonscan.com/api",
					browserURL: "https://amoy.polygonscan.com/"
				}
			}
		]
  	},
};

export default config;
