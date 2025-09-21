// nft_full_spoof_auto.js
// Spoofs ERC-20 (USDC) and ERC-721 (BAYC) for MetaMask testing.
// Automatically shows NFT in MetaMask by simulating a Transfer event.

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = 9726;
const SPOOF_OWNER = '0xD5A4903D1dE1D8DFcF2d9A8316503A1aC2B9c9A8';

const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'.toLowerCase();
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();

const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';

const zeros32 = (s='') => s.toString().padStart(64, '0');
function encodeUint256(n) { return '0x' + BigInt(n).toString(16).padStart(64, '0'); }
function encodeAddress(a) { return '0x' + a.toLowerCase().replace('0x','').padStart(64,'0'); }
function encodeBool(b) { return '0x' + (b ? '1'.padStart(64,'0') : '0'.padStart(64,'0')); }

app.post('/', (req, res) => {
  const { method, params, id } = req.body || {};
  const replyId = (typeof id !== 'undefined') ? id : null;

  // --- Basic RPC ---
  if (method === 'eth_chainId') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x1' });
  if (method === 'eth_blockNumber') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x0' });
  if (method === 'eth_syncing') return res.json({ jsonrpc:'2.0', id:replyId, result:false });

  // --- eth_getCode ---
  if (method === 'eth_getCode') {
    const address = (params && params[0] || '').toLowerCase();
    if (address === SPOOF_NFT_CONTRACT || address === SPOOF_ERC20_CONTRACT)
      return res.json({ jsonrpc:'2.0', id:replyId, result:FAKE_BYTECODE });
    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
  }

  // --- eth_getLogs: simulate NFT Transfer ---
  if (method === 'eth_getLogs') {
    const filter = params && params[0] || {};
    const address = (filter.address || '').toLowerCase();
    const topics = filter.topics || [];
    // only spoof logs for our NFT contract and to SPOOF_OWNER
    if (address === SPOOF_NFT_CONTRACT) {
      // keccak256("Transfer(address,address,uint256)")
      const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const toMatch = '0x' + SPOOF_OWNER.replace('0x','').padStart(64,'0');
      // check if topics[0] matches Transfer or not set
      if (!topics[0] || topics[0].toLowerCase() === transferSig) {
        // return a single fake transfer log
        const log = {
          address: SPOOF_NFT_CONTRACT,
          topics: [
            transferSig,
            '0x0000000000000000000000000000000000000000000000000000000000000000', // from=0x0 (mint)
            toMatch
          ],
          data: '0x0000000000000000000000000000000000000000000000000000000000000001', // tokenId=1
          blockNumber: '0x0',
          transactionHash: '0x0',
          transactionIndex: '0x0',
          blockHash: '0x0',
          logIndex: '0x0',
          removed: false
        };
        return res.json({ jsonrpc:'2.0', id:replyId, result:[log] });
      }
    }
    return res.json({ jsonrpc:'2.0', id:replyId, result:[] });
  }

  // --- eth_call ---
  if (method === 'eth_call') {
    const call = (params && params[0]) || {};
    const to = (call.to || '').toLowerCase();
    const data = (call.data || '').toLowerCase();
    const caller = (call.from || SPOOF_OWNER).toLowerCase();

    console.log(`[${new Date().toISOString()}] eth_call to=${to} from=${caller} data=${data.slice(0,10)}...`);

    // --- ERC20 spoof ---
    if (to === SPOOF_ERC20_CONTRACT) {
      if (data.startsWith('0x70a08231')) { // balanceOf
        const value = BigInt(1000) * BigInt(10)**BigInt(6);
        return res.json({ jsonrpc:'2.0', id:replyId, result:encodeUint256(value) });
      }
      if (data.startsWith('0x313ce567')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeUint256(6) });
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('USDC').toString('hex').padEnd(64,'0') });
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('USD Coin').toString('hex').padEnd(64,'0') });
    }

    // --- ERC721 spoof ---
    if (to === SPOOF_NFT_CONTRACT) {
      if (data.startsWith('0x01ffc9a7')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeBool(true) });
      if (data.startsWith('0x6352211e')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeAddress(caller) });
      if (data.startsWith('0x70a08231')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeUint256(1) });
      if (data.startsWith('0xc87b56dd')) { // tokenURI
        const url = 'https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
        const hex = '0x' + Buffer.from(url).toString('hex').padEnd(64,'0');
        return res.json({ jsonrpc:'2.0', id:replyId, result:hex });
      }
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('BoredApeYachtClub').toString('hex').padEnd(64,'0') });
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('BAYC').toString('hex').padEnd(64,'0') });
    }

    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
  }

  return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
});

app.listen(PORT, () => {
  console.log(`NFT+ERC20 full-spoof RPC (auto-detect) running at http://localhost:${PORT}`);
  console.log(`SPOOF_NFT_CONTRACT=${SPOOF_NFT_CONTRACT}`);
  console.log(`SPOOF_ERC20_CONTRACT=${SPOOF_ERC20_CONTRACT}`);
});
