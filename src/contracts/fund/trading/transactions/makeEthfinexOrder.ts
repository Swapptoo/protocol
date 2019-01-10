import * as web3Utils from 'web3-utils';
import { assetDataUtils } from '@0x/order-utils';
import { createQuantity } from '@melonproject/token-math/quantity';

import { Contracts, Exchanges } from '~/Contracts';

// tslint:disable:max-line-length
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { NULL_ADDRESS } from './take0xOrder';
import {
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getHub } from '../../hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { Make0xOrderArgs } from './make0xOrder';
import { getOriginalToken } from '~/contracts/exchanges/third-party/ethfinex/calls/getOriginalToken';
import { TokenInterface } from '@melonproject/token-math/token';
// tslint:enable:max-line-length

// The order needs to be signed by the manager

const guard: GuardFunction<Make0xOrderArgs> = async (
  environment,
  { signedOrder },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);
  const makerWrapperLock = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const makerToken = await getOriginalToken(environment, makerWrapperLock);

  const makerQuantity = createQuantity(
    makerToken,
    signedOrder.makerAssetAmount.toString(),
  );

  await ensureSufficientBalance(environment, makerQuantity, vaultAddress);
};

const prepareArgs: PrepareArgsFunction<Make0xOrderArgs> = async (
  environment,
  { signedOrder },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.Ethfinex,
  });

  const makerWrapperLock = assetDataUtils.decodeERC20AssetData(
    signedOrder.makerAssetData,
  ).tokenAddress;
  const makerToken: TokenInterface = await getOriginalToken(
    environment,
    makerWrapperLock,
  );

  const takerTokenAddress = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  ).tokenAddress;

  const args = [
    exchangeIndex,
    FunctionSignatures.makeOrder,
    [
      contractAddress.toString(),
      NULL_ADDRESS,
      makerToken.address.toString(),
      takerTokenAddress,
      signedOrder.feeRecipientAddress,
      NULL_ADDRESS,
    ],
    [
      signedOrder.makerAssetAmount.toFixed(),
      signedOrder.takerAssetAmount.toFixed(),
      signedOrder.makerFee.toFixed(),
      signedOrder.takerFee.toFixed(),
      signedOrder.expirationTimeSeconds.toFixed(),
      signedOrder.salt.toFixed(),
      0,
      0,
    ],
    web3Utils.padLeft('0x0', 64),
    signedOrder.makerAssetData,
    signedOrder.takerAssetData,
    `${signedOrder.signature}`,
  ];

  return args;
};

const postProcess: PostProcessFunction<
  Make0xOrderArgs,
  boolean
> = async receipt => {
  // console.log(JSON.stringify(receipt, null, 2));
  return true;
};

const makeEthfinexOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { makeEthfinexOrder };