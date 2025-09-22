// eth_nft_spoof.js
// Minimal ETH RPC for ERC-20 + ERC-721 spoofing (MetaMask compatible)

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 9726;

// Spoof addresses
const SPOOF_OWNER = '0x654467492CB23c05A5316141f9BAc44679EEaf8C';
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC
const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'; // BAYC

// Fake contract bytecode
const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';

// Helpers to encode solidity types
const encodeUint256 = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const encodeAddress = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const encodeBool = (b) => b ? encodeUint256(1) : encodeUint256(0);

// Main RPC handler
app.post('/', (req, res) => {
  const { method, params, id } = req.body || {};
  const replyId = (id !== undefined) ? id : null;

  // --- Basic ETH RPC ---
  if (method === 'eth_chainId') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x1' });
  if (method === 'eth_blockNumber') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x0' });
  if (method === 'eth_syncing') return res.json({ jsonrpc:'2.0', id:replyId, result:false });

  // --- eth_getBalance (spoofed ETH) ---
  if (method === 'eth_getBalance') {
    const address = (params && params[0] || '').toLowerCase();
    const balance = (address === SPOOF_OWNER.toLowerCase()) 
      ? encodeUint256(1000 * 10**18)  // 1000 ETH
      : encodeUint256(1000 * 10**18); // all addresses same
    return res.json({ jsonrpc:'2.0', id:replyId, result: balance });
  }

  // --- eth_getCode ---
  if (method === 'eth_getCode') {
    const address = (params && params[0] || '').toLowerCase();
    if (address === SPOOF_ERC20_CONTRACT || address === SPOOF_NFT_CONTRACT)
      return res.json({ jsonrpc:'2.0', id:replyId, result: FAKE_BYTECODE });
    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
  }

  // --- eth_call (ERC-20 + ERC-721 spoof) ---
  if (method === 'eth_call') {
    const call = (params && params[0]) || {};
    const to = (call.to || '').toLowerCase();
    const data = (call.data || '').toLowerCase();
    const caller = (call.from || SPOOF_OWNER).toLowerCase();

    // ERC-20 spoof (USDC)
    if (to === SPOOF_ERC20_CONTRACT) {
      if (data.startsWith('0x70a08231')) { // balanceOf(address)
        const value = BigInt(1000) * BigInt(10)**BigInt(6); // 1000 USDC
        return res.json({ jsonrpc:'2.0', id:replyId, result: encodeUint256(value) });
      }
    }

    // ERC-721 spoof (BAYC)
    if (to === SPOOF_NFT_CONTRACT) {
      if (data.startsWith('0x6352211e')) return res.json({ jsonrpc:'2.0', id:replyId, result: encodeAddress(caller) }); // ownerOf
      if (data.startsWith('0x70a08231')) return res.json({ jsonrpc:'2.0', id:replyId, result: encodeUint256(1) }); // balanceOf
      if (data.startsWith('0xc87b56dd')) { // tokenURI
        const url = 'https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
        const hex = '0x' + Buffer.from(url).toString('hex').padEnd(64,'0');
        return res.json({ jsonrpc:'2.0', id:replyId, result: hex });
      }
    }

    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
  }

  // --- fallback ---
  return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
});

// Health check
app.get('/', (req,res) => res.send('ETH NFT RPC spoof running ✅'));

app.listen(PORT, () => console.log(`🚀 ETH NFT spoof RPC running on port ${PORT}`));
