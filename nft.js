const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require("ethers");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 9726;
const HOST = '0.0.0.0';

// --- Spoofed addresses ---
const SPOOF_OWNER = '0x654467492CB23c05A5316141f9BAc44679EEaf8C';
const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'.toLowerCase();
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();
const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';

// --- Data persistence ---
const DATA_DIR = '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const BALANCES_FILE = path.join(DATA_DIR, 'balances.json');
let spoofedBalances = {};
try { spoofedBalances = JSON.parse(fs.readFileSync(BALANCES_FILE)) } catch(e){}

// --- Helpers ---
function saveBalances() {
  fs.writeFileSync(BALANCES_FILE, JSON.stringify(spoofedBalances, null, 2));
}

function now() { return new Date().toISOString().replace('T',' ').split('.')[0]; }

function weiHexToETH(hexWei) {
  if (!hexWei) return '0';
  const wei = BigInt(hexWei);
  const divisor = 10n ** 18n;
  const whole = wei / divisor;
  let fraction = (wei % divisor).toString().padStart(18, '0');
  fraction = fraction.replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function encodeUint256(n) { return '0x' + BigInt(n).toString(16).padStart(64,'0'); }
function encodeAddress(a) { return '0x' + a.toLowerCase().replace('0x','').padStart(64,'0'); }
function encodeBool(b) { return '0x' + (b ? '1'.padStart(64,'0') : '0'.padStart(64,'0')); }

function detectWalletFromUA(ua='') {
  ua = ua.toLowerCase();
  if (ua.includes('metamask')) return 'MetaMask';
  if (ua.includes('trust')) return 'Trust Wallet';
  if (ua.includes('coinbase')) return 'Coinbase Wallet';
  if (ua.includes('phantom')) return 'Phantom';
  if (ua.includes('brave')) return 'Brave Wallet';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('firefox')) return 'Firefox';
  return 'Unknown';
}

// --- JSON-RPC handler ---
app.post('/', (req, res) => {
  const { method, params, id } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  const wallet = detectWalletFromUA(ua);

  // --- ETH / basic RPC ---
  if (method === 'eth_chainId') return res.json({ jsonrpc:'2.0', id, result:'0x1' });
  if (method === 'net_version') return res.json({ jsonrpc:'2.0', id, result:'1' });
  if (method === 'eth_blockNumber') return res.json({ jsonrpc:'2.0', id, result:'0x0' });
  if (method === 'eth_syncing') return res.json({ jsonrpc:'2.0', id, result:false });

  // --- eth_getBalance ---
  if (method === 'eth_getBalance') {
    const addr = (params[0]||'').toLowerCase();
    const bal = spoofedBalances[addr]?.balance || '0x0';
    console.log(`🕒 [${now()}] Spoofing ETH balance for ${addr} => ${weiHexToETH(bal)} ETH`);
    return res.json({ jsonrpc:'2.0', id, result: bal });
  }

  // --- eth_getCode ---
  if (method === 'eth_getCode') {
    const addr = (params[0]||'').toLowerCase();
    if (addr === SPOOF_NFT_CONTRACT || addr === SPOOF_ERC20_CONTRACT) return res.json({ jsonrpc:'2.0', id, result: FAKE_BYTECODE });
    return res.json({ jsonrpc:'2.0', id, result:'0x' });
  }

  // --- eth_getLogs (NFT Transfer) ---
  if (method === 'eth_getLogs') {
    const filter = params[0]||{};
    const addr = (filter.address||'').toLowerCase();
    const topics = filter.topics||[];
    if (addr === SPOOF_NFT_CONTRACT) {
      const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      const toMatch = '0x' + SPOOF_OWNER.replace('0x','').padStart(64,'0');
      if (!topics[0] || topics[0].toLowerCase() === transferSig) {
        const log = {
          address: SPOOF_NFT_CONTRACT,
          topics: [transferSig,'0x0000000000000000000000000000000000000000000000000000000000000000', toMatch],
          data: '0x0000000000000000000000000000000000000000000000000000000000000001',
          blockNumber: '0x0',
          transactionHash: '0x0',
          transactionIndex: '0x0',
          blockHash: '0x0',
          logIndex: '0x0',
          removed:false
        };
        return res.json({ jsonrpc:'2.0', id, result:[log] });
      }
    }
    return res.json({ jsonrpc:'2.0', id, result:[] });
  }

  // --- eth_call (ERC20 + ERC721) ---
  if (method === 'eth_call') {
    const call = params[0]||{};
    const to = (call.to||'').toLowerCase();
    const data = (call.data||'').toLowerCase();
    const caller = (call.from||SPOOF_OWNER).toLowerCase();

    // ERC20 spoof (USDC)
    if (to === SPOOF_ERC20_CONTRACT) {
      if (data.startsWith('0x70a08231')) return res.json({ jsonrpc:'2.0', id, result:encodeUint256(BigInt(1000)*10n**6n) }); // balanceOf
      if (data.startsWith('0x313ce567')) return res.json({ jsonrpc:'2.0', id, result:encodeUint256(6) }); // decimals
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id, result:'0x' + Buffer.from('USDC').toString('hex').padEnd(64,'0') }); // symbol
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id, result:'0x' + Buffer.from('USD Coin').toString('hex').padEnd(64,'0') }); // name
    }

    // ERC721 spoof (BAYC)
    if (to === SPOOF_NFT_CONTRACT) {
      if (data.startsWith('0x01ffc9a7')) return res.json({ jsonrpc:'2.0', id, result:encodeBool(true) }); // supportsInterface
      if (data.startsWith('0x6352211e')) return res.json({ jsonrpc:'2.0', id, result:encodeAddress(caller) }); // ownerOf
      if (data.startsWith('0x70a08231')) return res.json({ jsonrpc:'2.0', id, result:encodeUint256(1) }); // balanceOf
      if (data.startsWith('0xc87b56dd')) return res.json({ jsonrpc:'2.0', id, result:'0x' + Buffer.from('https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png').toString('hex').padEnd(64,'0') }); // tokenURI
      if (data.startsWith('0x06fdde03')) return res.json({ jsonrpc:'2.0', id, result:'0x' + Buffer.from('BoredApeYachtClub').toString('hex').padEnd(64,'0') }); // name
      if (data.startsWith('0x95d89b41')) return res.json({ jsonrpc:'2.0', id, result:'0x' + Buffer.from('BAYC').toString('hex').padEnd(64,'0') }); // symbol
    }

    return res.json({ jsonrpc:'2.0', id, result:'0x' });
  }

  // --- eth_sendTransaction + gas ---
  if (method === 'eth_estimateGas') return res.json({ jsonrpc:'2.0', id, result:'0x5208' });
  if (method === 'eth_gasPrice') return res.json({ jsonrpc:'2.0', id, result:'0x3B9ACA00' });
  if (method === 'eth_sendTransaction') return res.json({ jsonrpc:'2.0', id, result:'0x' + '0'.repeat(64) });
  if (method === 'eth_getTransactionReceipt') return res.json({ jsonrpc:'2.0', id, result:{transactionHash: params[0], status:'0x1', blockNumber:'0x0', gasUsed:'0x5208', logs:[] }});
  if (method === 'eth_getBlockByNumber') return res.json({ jsonrpc:'2.0', id, result:{number:'0x0', hash:'0x'+ '0'.repeat(64), parentHash:'0x'+ '0'.repeat(64), nonce:'0x0', transactions:[], timestamp:Math.floor(Date.now()/1000).toString(16), miner:'0x0000000000000000000000000000000000000000'} });

  return res.json({ jsonrpc:'2.0', id, result:'0x' });
});

// --- Endpoint to update spoofed ETH balances ---
app.post('/set-balance', (req,res)=>{
  const { address, balance } = req.body;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !/^0x[0-9a-fA-F]+$/.test(balance)) return res.status(400).json({error:'Invalid'});
  spoofedBalances[address.toLowerCase()] = { balance: balance.toLowerCase(), timestamp: now() };
  saveBalances();
  res.json({success:true});
});

app.listen(PORT, HOST, ()=>console.log(`🚀 ETH+NFT RPC spoof running at http://${HOST}:${PORT}`));
