// nft_full_spoof.js
// Spoofs ERC-20 (USDC) and ERC-721 (BAYC) for MetaMask testing.
// Now returns tokenURI as a data:application/json;base64,... blob so MetaMask will show image inline.

const express = require('express');
const bodyParser = require('body-parser');
const { Interface } = require('ethers'); // ethers v6 Interface

const app = express();
app.use(bodyParser.json());

const PORT = 9726;
const SPOOF_OWNER = '0x4af0C9BC3e6B24082d3ae5009E32d9d475BDa0D4'.toLowerCase();

// Contracts to spoof (BAYC + USDC)
const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'.toLowerCase();
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();

// ABI fragments for proper encoding
const ERC721_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function balanceOf(address owner) view returns (uint256)',
  'function supportsInterface(bytes4 interfaceID) view returns (bool)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)'
];

const erc721Iface = new Interface(ERC721_ABI);
const erc20Iface = new Interface(ERC20_ABI);

// Helper encoders (fallback shorter helpers)
function encodeUint256(n) { return '0x' + BigInt(n).toString(16).padStart(64, '0'); }

// Minimal fake bytecode (non-empty so eth_getCode appears as contract)
const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';

// build data URI metadata for a tokenId
function buildDataURI(tokenId) {
  const metadata = {
    name: `Spoofed BAYC #${tokenId}`,
    description: `Demo spoof of BAYC token ${tokenId}`,
    // use an HTTPS image URL so wallets can render if they attempt to fetch,
    // but we embed metadata as data URI so no external fetch is required.
    image: `https://picsum.photos/seed/${tokenId}/512`,
    estimated_value_usd: 1000
  };
  const json = JSON.stringify(metadata);
  const b64 = Buffer.from(json).toString('base64');
  return `data:application/json;base64,${b64}`;
}

// helper to make a valid JSON-RPC response
function sendResult(res, id, result) {
  if (result === undefined || result === null) result = '0x';
  res.json({ jsonrpc: '2.0', id, result });
}

app.post('/', (req, res) => {
  const { method, params, id } = req.body || {};
  const replyId = (typeof id !== 'undefined') ? id : null;

  // Basic chain responses
  if (method === 'eth_chainId') return sendResult(res, replyId, '0x1');
  if (method === 'eth_blockNumber') return sendResult(res, replyId, '0x0');
  if (method === 'eth_syncing') return sendResult(res, replyId, false);

  // eth_getCode: return non-empty code for our spoofed contracts
  if (method === 'eth_getCode') {
    const address = (params && params[0] || '').toLowerCase();
    if (address === SPOOF_NFT_CONTRACT || address === SPOOF_ERC20_CONTRACT) {
      return sendResult(res, replyId, FAKE_BYTECODE);
    }
    return sendResult(res, replyId, '0x');
  }

  // Only handle eth_call further
  if (method !== 'eth_call') return sendResult(res, replyId, '0x');

  const call = (params && params[0]) || {};
  const to = (call.to || '').toLowerCase();
  const data = (call.data || '').toLowerCase();
  const caller = (call.from || SPOOF_OWNER).toLowerCase();

  console.log(`[${new Date().toISOString()}] eth_call to=${to} from=${caller} data=${data.slice(0,10)}...`);

  // --- ERC20 (USDC) spoof ---
  if (to === SPOOF_ERC20_CONTRACT) {
    // balanceOf(address) selector: 70a08231
    if (data.startsWith('0x70a08231')) {
      const value = BigInt(1000) * BigInt(10) ** BigInt(6); // USDC has 6 decimals
      const encoded = erc20Iface.encodeFunctionResult('balanceOf', [value]);
      return sendResult(res, replyId, encoded);
    }
    if (data.startsWith('0x313ce567')) { // decimals()
      const encoded = erc20Iface.encodeFunctionResult('decimals', [6]);
      return sendResult(res, replyId, encoded);
    }
    if (data.startsWith('0x95d89b41')) { // symbol()
      const encoded = erc20Iface.encodeFunctionResult('symbol', ['USDC']);
      return sendResult(res, replyId, encoded);
    }
    if (data.startsWith('0x06fdde03')) { // name()
      const encoded = erc20Iface.encodeFunctionResult('name', ['USD Coin']);
      return sendResult(res, replyId, encoded);
    }
  }

  // --- ERC721 (BAYC) spoof ---
  if (to === SPOOF_NFT_CONTRACT) {
    try {
      // supportsInterface(bytes4) selector: 01ffc9a7
      if (data.startsWith('0x01ffc9a7')) {
        const encoded = erc721Iface.encodeFunctionResult('supportsInterface', [true]);
        return sendResult(res, replyId, encoded);
      }

      // ownerOf(uint256) selector: 6352211e
      if (data.startsWith('0x6352211e')) {
        const encoded = erc721Iface.encodeFunctionResult('ownerOf', [caller]);
        return sendResult(res, replyId, encoded);
      }

      // balanceOf(address) selector: 70a08231
      if (data.startsWith('0x70a08231')) {
        const encoded = erc721Iface.encodeFunctionResult('balanceOf', [BigInt(1)]);
        return sendResult(res, replyId, encoded);
      }

      // tokenURI(uint256) selector: c87b56dd
      if (data.startsWith('0xc87b56dd')) {
        // parse tokenId from calldata (last 32 bytes)
        let tokenId = '1';
        try {
          const hex = data.slice(-64);
          tokenId = BigInt('0x' + hex).toString();
        } catch (e) { tokenId = '1'; }

        const dataUri = buildDataURI(tokenId);
        const encoded = erc721Iface.encodeFunctionResult('tokenURI', [dataUri]);
        return sendResult(res, replyId, encoded);
      }

      // name() / symbol()
      if (data.startsWith('0x06fdde03')) {
        const encoded = erc721Iface.encodeFunctionResult('name', ['BoredApeYachtClub']);
        return sendResult(res, replyId, encoded);
      }
      if (data.startsWith('0x95d89b41')) {
        const encoded = erc721Iface.encodeFunctionResult('symbol', ['BAYC']);
        return sendResult(res, replyId, encoded);
      }
    } catch (e) {
      console.error('erc721 handler error', e);
    }
  }

  // fallback
  return sendResult(res, replyId, '0x');
});

app.listen(PORT, () => {
  console.log(`NFT+ERC20 full-spoof RPC running at http://localhost:${PORT}`);
  console.log(`SPOOF_NFT_CONTRACT=${SPOOF_NFT_CONTRACT}`);
  console.log(`SPOOF_ERC20_CONTRACT=${SPOOF_ERC20_CONTRACT}`);
  console.log(`SPOOF_OWNER=${SPOOF_OWNER}`);
});
