const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = 9726;
const SPOOF_OWNER = '0x654467492CB23c05A5316141f9BAc44679EEaf8C';

// BSC USDC and a real BSC NFT
const SPOOF_NFT_CONTRACT = '0x3d8f17d8a4d3bb5d1de6e0531b9ee0912f3a0b3b'.toLowerCase();
const SPOOF_ERC20_CONTRACT = '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'.toLowerCase();

const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';

const zeros32 = (s='') => s.toString().padStart(64, '0');
function encodeUint256(n) { return '0x' + BigInt(n).toString(16).padStart(64, '0'); }
function encodeAddress(a) { return '0x' + a.toLowerCase().replace('0x','').padStart(64,'0'); }
function encodeBool(b) { return '0x' + (b ? '1'.padStart(64,'0') : '0'.padStart(64,'0')); }

app.post('/', (req, res) => {
  const { method, params, id } = req.body || {};
  const replyId = (typeof id !== 'undefined') ? id : null;

  // --- Basic RPC ---
  if (method === 'eth_chainId') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x38' });
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
    if (address === SPOOF_NFT_CONTRACT) {
      const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const toMatch = '0x' + SPOOF_OWNER.replace('0x','').padStart(64,'0');
      if (!topics[0] || topics[0].toLowerCase() === transferSig) {
        const log = {
          address: SPOOF_NFT_CONTRACT,
          topics: [
            transferSig,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            toMatch
          ],
          data: '0x0000000000000000000000000000000000000000000000000000000000000001',
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

    // ERC20 spoof
    if (to === SPOOF_ERC20_CONTRACT) {
      if (data.startsWith('0x70a08231')) {
        const value = BigInt(1000) * BigInt(10)**BigInt(6);
        return res.json({ jsonrpc:'2.0', id:replyId, result:encodeUint256(value) });
      }
      if (data.startsWith('0x313ce567')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeUint256(6) });
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('USDC').toString('hex').padEnd(64,'0') });
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('USD Coin').toString('hex').padEnd(64,'0') });
    }

    // ERC721 spoof
    if (to === SPOOF_NFT_CONTRACT) {
      if (data.startsWith('0x01ffc9a7')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeBool(true) });
      if (data.startsWith('0x6352211e')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeAddress(caller) });
      if (data.startsWith('0x70a08231')) return res.json({ jsonrpc:'2.0', id:replyId, result:encodeUint256(1) });
      if (data.startsWith('0xc87b56dd')) {
        const url = 'https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
        const hex = '0x' + Buffer.from(url).toString('hex').padEnd(64,'0');
        return res.json({ jsonrpc:'2.0', id:replyId, result:hex });
      }
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('BSC Monkey NFT').toString('hex').padEnd(64,'0') });
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('BMONK').toString('hex').padEnd(64,'0') });
    }

    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
  }

  return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
});

app.listen(PORT, () => {
  console.log(`BSC NFT+ERC20 full-spoof RPC running at http://localhost:${PORT}`);
  console.log(`SPOOF_NFT_CONTRACT=${SPOOF_NFT_CONTRACT}`);
  console.log(`SPOOF_ERC20_CONTRACT=${SPOOF_ERC20_CONTRACT}`);
});
