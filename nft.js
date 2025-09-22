// nft_full_spoof_auto.js
// Spoofs ERC-20 (USDC) and ERC-721 (BAYC) for MetaMask/SubWallet testing.
// Automatically shows NFT in MetaMask by simulating a Transfer event.

const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const PORT = 9726;
const SPOOF_OWNER = '0x654467492CB23c05A5316141f9BAc44679EEaf8C';

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

  // --- Minimal client / chain info (wallets probe these) ---
  if (method === 'web3_clientVersion')
    return res.json({ jsonrpc:'2.0', id:replyId, result:'Geth/v1.13.12-stable' });

  if (method === 'eth_chainId') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x1' }); // Ethereum mainnet
  if (method === 'net_version') return res.json({ jsonrpc:'2.0', id:replyId, result:'1' });

  // --- gas / fee stubs ---
  if (method === 'eth_gasPrice')
    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x3b9aca00' }); // 1 Gwei

  if (method === 'eth_maxPriorityFeePerGas')
    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x3b9aca00' }); // 1 Gwei

  if (method === 'eth_estimateGas')
    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x5208' }); // 21000

  // --- basic block / syncing ---
  if (method === 'eth_blockNumber') return res.json({ jsonrpc:'2.0', id:replyId, result:'0x0' });
  if (method === 'eth_syncing') return res.json({ jsonrpc:'2.0', id:replyId, result:false });

  // --- fake block object often requested by wallets ---
  if (method === 'eth_getBlockByNumber') {
    // params: [blockNumber, booleanWithTransactions]
    return res.json({
      jsonrpc:'2.0',
      id:replyId,
      result:{
        number:'0x1',
        hash:'0x' + '11'.repeat(32),
        parentHash:'0x' + '22'.repeat(32),
        nonce:'0x0000000000000000',
        sha3Uncles:'0x' + '33'.repeat(32),
        logsBloom:'0x' + '00'.repeat(256),
        transactionsRoot:'0x' + '44'.repeat(32),
        stateRoot:'0x' + '55'.repeat(32),
        receiptsRoot:'0x' + '66'.repeat(32),
        miner:'0x0000000000000000000000000000000000000000',
        difficulty:'0x0',
        totalDifficulty:'0x0',
        size:'0x0',
        extraData:'0x',
        gasLimit:'0x1c9c380', // 30,000,000
        gasUsed:'0x0',
        timestamp:'0x5ba43b740',
        transactions:[],
        uncles:[]
      }
    });
  }

  // --- eth_getBalance fallback (wallets sometimes call directly) ---
  if (method === 'eth_getBalance') {
    // params: [address, blockTag]
    const address = (params && params[0] || '').toLowerCase();
    // default to zero balance unless you want to spoof some addresses here
    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x0' });
  }

  // --- minimal tx send/receipt stubs ---
  if (method === 'eth_sendTransaction' || method === 'eth_sendRawTransaction') {
    // return a dummy tx hash so wallets don't error out
    const fakeTxHash = '0x' + '0'.repeat(64);
    return res.json({ jsonrpc:'2.0', id:replyId, result:fakeTxHash });
  }

  if (method === 'eth_getTransactionReceipt') {
    const txHash = (params && params[0]) || null;
    if (!txHash) return res.json({ jsonrpc:'2.0', id:replyId, result:null });
    return res.json({
      jsonrpc:'2.0',
      id:replyId,
      result:{
        transactionHash: txHash,
        status: '0x1',
        blockNumber: '0x1',
        gasUsed: '0x5208',
        logs: []
      }
    });
  }

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
      // keccak256("Transfer(address,address,uint256)")
      const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const toMatch = '0x' + SPOOF_OWNER.replace('0x','').padStart(64,'0');
      if (!topics[0] || topics[0].toLowerCase() === transferSig) {
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
      if (data.startsWith('0xc87b56dd')) {
        const url = 'https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
        const hex = '0x' + Buffer.from(url).toString('hex').padEnd(64,'0');
        return res.json({ jsonrpc:'2.0', id:replyId, result:hex });
      }
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('BoredApeYachtClub').toString('hex').padEnd(64,'0') });
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' + Buffer.from('BAYC').toString('hex').padEnd(64,'0') });
    }

    return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
  }

  // --- fallback for unknown ---
  return res.json({ jsonrpc:'2.0', id:replyId, result:'0x' });
});

app.listen(PORT, () => {
  console.log(`NFT+ERC20 full-spoof RPC (auto-detect) running at http://localhost:${PORT}`);
  console.log(`SPOOF_NFT_CONTRACT=${SPOOF_NFT_CONTRACT}`);
  console.log(`SPOOF_ERC20_CONTRACT=${SPOOF_ERC20_CONTRACT}`);
});
