// test_real.js
const { ethers, Interface } = require('ethers');

(async () => {
  const RPC = 'http://localhost:9726'; // must match server port
  const provider = new ethers.JsonRpcProvider(RPC);

  // real contracts used by the server
  const nft = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D'; // BAYC
  const erc20 = '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC

  const nftIface = new Interface([
    'function ownerOf(uint256) view returns (address)',
    'function tokenURI(uint256) view returns (string)'
  ]);
  const erc20Iface = new Interface(['function balanceOf(address) view returns (uint256)']);

  const caller = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

  // ownerOf(1)
  const ownerCalldata = nftIface.encodeFunctionData('ownerOf', [1]);
  const rawOwner = await provider.send('eth_call', [{ to: nft, data: ownerCalldata, from: caller }, 'latest']);
  const owner = nftIface.decodeFunctionResult('ownerOf', rawOwner)[0];
  console.log('ownerOf(1) ->', owner);

  // tokenURI(1)
  const uriCalldata = nftIface.encodeFunctionData('tokenURI', [1]);
  const rawUri = await provider.send('eth_call', [{ to: nft, data: uriCalldata, from: caller }, 'latest']);
  const tokenURI = nftIface.decodeFunctionResult('tokenURI', rawUri)[0];
  console.log('tokenURI(1) ->', tokenURI);
  if (tokenURI.startsWith('data:application/json;base64,')) {
    const b64 = tokenURI.split(',')[1];
    console.log('decoded metadata ->', Buffer.from(b64, 'base64').toString('utf8'));
  }

  // USDC balanceOf(caller)
  const balCalldata = erc20Iface.encodeFunctionData('balanceOf', [caller]);
  const rawBal = await provider.send('eth_call', [{ to: erc20, data: balCalldata, from: caller }, 'latest']);
  const bal = erc20Iface.decodeFunctionResult('balanceOf', rawBal)[0];
  console.log('erc20 balanceOf(caller) ->', bal.toString());
  console.log('erc20 human ->', Number(bal) / 1e6); // USDC uses 6 decimals
})();
