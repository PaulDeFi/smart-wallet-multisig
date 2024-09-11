import { utils, Wallet, Provider, EIP712Signer, types } from "zksync-ethers";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Put the address of your AA factory
const AA_FACTORY_ADDRESS = "0xeCF80F7DC2aBC2A5b7339A8B69308d2B6245658f"; //sepolia

export default async function (hre: HardhatRuntimeEnvironment) {
  const provider = new Provider("https://sepolia.era.zksync.dev");
  // Private key of the account used to deploy
  const wallet = new Wallet("bc77198037c72f5cbfcbf75a207ac2ac87a9a592e115c8a3322f369667a8a26d").connect(provider);

  const factoryArtifact = await hre.artifacts.readArtifact("AAFactory");

  const aaFactory = new ethers.Contract(AA_FACTORY_ADDRESS, factoryArtifact.abi, wallet);
  console.log('aafactory good')

  // The two owners of the multisig
  const owner1 = Wallet.createRandom();
  const owner2 = Wallet.createRandom();
  console.log('wallet created')

  // For the simplicity of the tutorial, we will use zero hash as salt
  const salt = ethers.ZeroHash;
  console.log('salt done')

  // deploy account owned by owner1 & owner2
  const tx = await aaFactory.deployAccount(salt, owner1.address, owner2.address);
  await tx.wait();
  console.log(`Multisig deployed successfully`);

  // Getting the address of the deployed contract account
  // Always use the JS utility methods
  const abiCoder = new ethers.AbiCoder();
  console.log('AbiCoder knowed')

  const multisigAddress = utils.create2Address(
    AA_FACTORY_ADDRESS,
    await aaFactory.aaBytecodeHash(),
    salt,
    abiCoder.encode(["address", "address"], [owner1.address, owner2.address])
  );
  console.log(`Multisig account deployed on address ${multisigAddress}`);

  console.log("Sending funds to multisig account");
  // Send funds to the multisig account we just deployed
  await (
    await wallet.sendTransaction({
      to: multisigAddress,
      // You can increase the amount of ETH sent to the multisig
      value: ethers.parseEther("0.09"),
      nonce: await wallet.getNonce(),
    })
  ).wait();

  let multisigBalance = await provider.getBalance(multisigAddress);
  console.log(`Multisig account balance is ${multisigBalance.toString()}`);

  // Transaction to deploy a new account using the multisig we just deployed
  let aaTx = await aaFactory.deployAccount.populateTransaction(
    salt,
    // These are accounts that will own the newly deployed account
    Wallet.createRandom().address,
    Wallet.createRandom().address
  );

  const gasLimit = await provider.estimateGas({ ...aaTx, from: wallet.address });
  const gasPrice = await provider.getGasPrice();

  aaTx = {
    ...aaTx,
    // deploy a new account using the multisig
    from: multisigAddress,
    gasLimit: gasLimit,
    gasPrice: gasPrice,
    chainId: (await provider.getNetwork()).chainId,
    nonce: await provider.getTransactionCount(multisigAddress),
    type: 113,
    customData: {
      gasPerPubdata: utils.DEFAULT_GAS_PER_PUBDATA_LIMIT,
    } as types.Eip712Meta,
    value: 0n,
  };

  const signedTxHash = EIP712Signer.getSignedDigest(aaTx);

  // Sign the transaction with both owners
  const signature = ethers.concat([ethers.Signature.from(owner1.signingKey.sign(signedTxHash)).serialized, ethers.Signature.from(owner2.signingKey.sign(signedTxHash)).serialized]);

  aaTx.customData = {
    ...aaTx.customData,
    customSignature: signature,
  };

  console.log(`The multisig's nonce before the first tx is ${await provider.getTransactionCount(multisigAddress)}`);

  const sentTx = await provider.broadcastTransaction(types.Transaction.from(aaTx).serialized);
  console.log(`Transaction sent from multisig with hash ${sentTx.hash}`);

  await sentTx.wait();

  // Checking that the nonce for the account has increased
  console.log(`The multisig's nonce after the first tx is ${await provider.getTransactionCount(multisigAddress)}`);

  multisigBalance = await provider.getBalance(multisigAddress);

  console.log(`Multisig account balance is now ${multisigBalance.toString()}`);
}
