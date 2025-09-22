// merged_eth_nft_spoof_wss_render_no_telegram.js
// Full Fake ETH RPC + ERC20 (USDC) + ERC721 (BAYC) spoof + WSS-only + Render-compatible

const { ethers } = require("ethers");
const WebSocket = require('ws');

// In-memory storage for Render (no disk writes)
let spoofedBalances = {};

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

const now = ()=>new Date().toISOString().replace('T',' ').split('.')[0];

// Wallet detection placeholder for WSS
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

    // Basic chain info
    if(method==='eth_chainId') return {jsonrpc:'2.0',id,result:'0x1'};
    if(method==='net_version') return {jsonrpc:'2.0',id,result:'1'};
    if(method==='eth_blockNumber') return {jsonrpc:'2.0',id,result:'0x100000'};
    if(method==='eth_syncing') return {jsonrpc:'2.0',id,result:false};

    // --- eth_getBalance ---
    if(method==='eth_getBalance'){
        const address = (params[0]||'').toLowerCase();
        const info = spoofedBalances[address];
        const balanceHex = info ? info.balance : '0x0';
        const balanceETH = weiHexToETH(balanceHex);
        console.log(`🕒 ${now()} | Spoofing ETH for ${address} | Balance: ${balanceETH} ETH | Wallet: ${wallet} | IP: ${ip}`);
        return {jsonrpc:'2.0',id,result:balanceHex};
    }

    // --- eth_getCode ---
    if(method==='eth_getCode'){
        const address = (params[0]||'').toLowerCase();
        if(address===SPOOF_NFT_CONTRACT||address===SPOOF_ERC20_CONTRACT) return {jsonrpc:'2.0',id,result:FAKE_BYTECODE};
        return {jsonrpc:'2.0',id,result:'0x'};
    }

    // --- eth_getLogs ---
    if(method==='eth_getLogs'){
        const filter = params[0]||{};
        const address = (filter.address||'').toLowerCase();
        const topics = filter.topics||[];
        if(address===SPOOF_NFT_CONTRACT){
            const transferSig='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            const toMatch='0x'+SPOOF_OWNER.replace('0x','').padStart(64,'0');
            if(!topics[0]||topics[0].toLowerCase()===transferSig){
                const log={address:SPOOF_NFT_CONTRACT,topics:[transferSig,'0x'+ '0'.repeat(64),toMatch],data:'0x'+ '1'.padStart(64,'0'),blockNumber:'0x0',transactionHash:'0x0',transactionIndex:'0x0',blockHash:'0x0',logIndex:'0x0',removed:false};
                return {jsonrpc:'2.0',id,result:[log]};
            }
        }
        return {jsonrpc:'2.0',id,result:[]};
    }

    // --- eth_call ---
    if(method==='eth_call'){
        const call=params[0]||{};
        const to=(call.to||'').toLowerCase();
        const data=(call.data||'').toLowerCase();
        const caller=(call.from||SPOOF_OWNER).toLowerCase();

        // ERC20 spoof
        if(to===SPOOF_ERC20_CONTRACT){
            if(data.startsWith('0x70a08231')) return {jsonrpc:'2.0',id,result:encodeUint256(1000n*10n**6n)};
            if(data.startsWith('0x313ce567')) return {jsonrpc:'2.0',id,result:encodeUint256(6)};
            if(data.startsWith('0x95d89b41')) return {jsonrpc:'2.0',id,result:'0x'+Buffer.from('USDC').toString('hex').padEnd(64,'0')};
            if(data.startsWith('0x06fdde03')) return {jsonrpc:'2.0',id,result:'0x'+Buffer.from('USD Coin').toString('hex').padEnd(64,'0')};
        }

        // ERC721 spoof
        if(to===SPOOF_NFT_CONTRACT){
            if(data.startsWith('0x01ffc9a7')) return {jsonrpc:'2.0',id,result:encodeBool(true)};
            if(data.startsWith('0x6352211e')) return {jsonrpc:'2.0',id,result:encodeAddress(caller)};
            if(data.startsWith('0x70a08231')) return {jsonrpc:'2.0',id,result:encodeUint256(1)};
            if(data.startsWith('0xc87b56dd')) {
                const url='https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
                const hex='0x'+Buffer.from(url).toString('hex').padEnd(64,'0');
                return {jsonrpc:'2.0',id,result:hex};
            }
            if(data.startsWith('0x06fdde03')) return {jsonrpc:'2.0',id,result:'0x'+Buffer.from('BoredApeYachtClub').toString('hex').padEnd(64,'0')};
            if(data.startsWith('0x95d89b41')) return {jsonrpc:'2.0',id,result:'0x'+Buffer.from('BAYC').toString('hex').padEnd(64,'0')};
        }

        try{
            const parsed = iface.parseTransaction({ data });
            if(parsed?.name==='balances'){
                const users=parsed.args[0].map(addr=>addr.toLowerCase());
                const results=[];
                users.forEach(user=>{
                    const info=spoofedBalances[user];
                    const balanceHex=info?info.balance:'0x0';
                    const balanceETH=weiHexToETH(balanceHex);
                    console.log(`🕒 ${now()} | Spoofing balance for ${user} | Balance: ${balanceETH} ETH | Wallet: ${wallet} | IP: ${ip}`);
                    results.push(BigInt(balanceHex));
                });
                const encoded = iface.encodeFunctionResult('balances',[results]);
                return {jsonrpc:'2.0',id,result:encoded};
            }
        }catch(e){console.log('eth_call decode error:',e.message);}

        return {jsonrpc:'2.0',id,result:'0x'};
    }

    // --- Transactions ---
    if(method==='eth_estimateGas'){ const tx=params[0]; const value=tx.value||'0x0'; console.log(`🛠 Estimating gas: ${weiHexToETH(value)} ETH`); return {jsonrpc:'2.0',id,result:'0x5208'};}
    if(method==='eth_gasPrice') return {jsonrpc:'2.0',id,result:'0x3B9ACA00'};
    if(method==='eth_sendTransaction'){ const tx=params[0]; console.log(`💸 Sending fake tx: from ${tx.from}, to ${tx.to}, value ${weiHexToETH(tx.value)} ETH`); return {jsonrpc:'2.0',id,result:'0x'+ '0'.repeat(64)};}
    if(method==='eth_getTransactionReceipt'){ const txHash=params[0]; return {jsonrpc:'2.0',id,result:{transactionHash:txHash,status:'0x1',blockNumber:'0x100000',gasUsed:'0x5208',logs:[]}};}
    if(method==='eth_getBlockByNumber'){ return {jsonrpc:'2.0',id,result:{number:'0x100000',hash:'0x'+ '0'.repeat(64),parentHash:'0x'+ '0'.repeat(64),nonce:'0x0',transactions:[],timestamp:Math.floor(Date.now()/1000).toString(16),miner:'0x0000000000000000000000000000000000000000'}};}

    // Unknown method fallback
    console.log(`🕒 ${now()} | Unknown RPC: ${method} | Wallet: ${wallet} | IP: ${ip}`);
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
        const ua = '';
        const response = handleRPC(reqBody, ip, ua);
        ws.send(JSON.stringify(response));
    });
});

console.log(`🚀 WSS-only Fake ETH+NFT+ERC20 RPC running at wss://0.0.0.0:${PORT}`);
