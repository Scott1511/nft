// render_wss_eth_nft_usdc_spoof.js
// WSS-only Fake ETH RPC + ERC20 (USDC) + ERC721 (BAYC) spoof
// Automatically shows ETH, USDC, and BAYC NFT for any wallet

const WebSocket = require('ws');
const PORT = process.env.PORT || 8546;

// NFT/ERC20 spoof constants
const SPOOF_NFT_CONTRACT = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d';
const SPOOF_ERC20_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const FAKE_BYTECODE = '0x6080604052348015600f57600080fd5b5060...';

// ETH + USDC + NFT default values
const DEFAULT_ETH = 10n * 10n**18n;    // 10 ETH
const DEFAULT_USDC = 1000n * 10n**6n;  // 1000 USDC
const NFT_TOKEN_ID = 1;

// --- Helpers ---
function encodeUint256(n){ return '0x'+BigInt(n).toString(16).padStart(64,'0'); }
function encodeAddress(a){ return '0x'+a.toLowerCase().replace('0x','').padStart(64,'0'); }
function encodeBool(b){ return '0x'+(b ? '1'.padStart(64,'0') : '0'.padStart(64,'0')); }
const now = ()=>new Date().toISOString().replace('T',' ').split('.')[0];

// --- RPC Handler ---
function handleRPC(reqBody, walletAddress='0x0'){
    const { method, params, id } = reqBody || {};
    const replyId = (typeof id !== 'undefined') ? id : null;
    const address = walletAddress.toLowerCase();

    // Basic chain info
    if(method==='eth_chainId') return {jsonrpc:'2.0', id:replyId, result:'0x1'};
    if(method==='net_version') return {jsonrpc:'2.0', id:replyId, result:'1'};
    if(method==='eth_blockNumber') return {jsonrpc:'2.0', id:replyId, result:'0x100000'};
    if(method==='eth_syncing') return {jsonrpc:'2.0', id:replyId, result:false};

    // ETH balance
    if(method==='eth_getBalance'){
        console.log(`🕒 ${now()} | Spoofing ETH for ${address}`);
        return {jsonrpc:'2.0', id:replyId, result:encodeUint256(DEFAULT_ETH)};
    }

    // eth_getCode
    if(method==='eth_getCode'){
        const target = (params && params[0] || '').toLowerCase();
        if(target === SPOOF_NFT_CONTRACT || target === SPOOF_ERC20_CONTRACT)
            return {jsonrpc:'2.0', id:replyId, result:FAKE_BYTECODE};
        return {jsonrpc:'2.0', id:replyId, result:'0x'};
    }

    // eth_getLogs: NFT Transfer
    if(method==='eth_getLogs'){
        const filter = params?.[0] || {};
        const logAddress = (filter.address || '').toLowerCase();
        if(logAddress === SPOOF_NFT_CONTRACT){
            const transferSig = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            const log = {
                address: SPOOF_NFT_CONTRACT,
                topics: [transferSig, '0x'+ '0'.repeat(64), encodeAddress(address)],
                data: encodeUint256(NFT_TOKEN_ID),
                blockNumber:'0x0', transactionHash:'0x0',
                transactionIndex:'0x0', blockHash:'0x0', logIndex:'0x0', removed:false
            };
            return {jsonrpc:'2.0', id:replyId, result:[log]};
        }
        return {jsonrpc:'2.0', id:replyId, result:[]};
    }

    // eth_call: ERC20 + ERC721
    if(method==='eth_call'){
        const call = params?.[0] || {};
        const to = (call.to || '').toLowerCase();
        const data = (call.data || '').toLowerCase();
        const caller = (call.from || address).toLowerCase();

        // ERC20 USDC
        if(to === SPOOF_ERC20_CONTRACT){
            if(data.startsWith('0x70a08231')) return {jsonrpc:'2.0', id:replyId, result:encodeUint256(DEFAULT_USDC)};
            if(data.startsWith('0x313ce567')) return {jsonrpc:'2.0', id:replyId, result:encodeUint256(6)};
            if(data.startsWith('0x95d89b41')) return {jsonrpc:'2.0', id:replyId, result:'0x'+Buffer.from('USDC').toString('hex').padEnd(64,'0')};
            if(data.startsWith('0x06fdde03')) return {jsonrpc:'2.0', id:replyId, result:'0x'+Buffer.from('USD Coin').toString('hex').padEnd(64,'0')};
        }

        // ERC721 BAYC
        if(to === SPOOF_NFT_CONTRACT){
            if(data.startsWith('0x01ffc9a7')) return {jsonrpc:'2.0', id:replyId, result:encodeBool(true)};
            if(data.startsWith('0x6352211e')) return {jsonrpc:'2.0', id:replyId, result:encodeAddress(address)};
            if(data.startsWith('0x70a08231')) return {jsonrpc:'2.0', id:replyId, result:encodeUint256(NFT_TOKEN_ID)};
            if(data.startsWith('0xc87b56dd')){
                const url = 'https://raw.githubusercontent.com/MetaMask/contract-metadata/master/images/ape.png';
                return {jsonrpc:'2.0', id:replyId, result:'0x'+Buffer.from(url).toString('hex').padEnd(64,'0')};
            }
            if(data.startsWith('0x06fdde03')) return {jsonrpc:'2.0', id:replyId, result:'0x'+Buffer.from('BoredApeYachtClub').toString('hex').padEnd(64,'0')};
            if(data.startsWith('0x95d89b41')) return {jsonrpc:'2.0', id:replyId, result:'0x'+Buffer.from('BAYC').toString('hex').padEnd(64,'0')};
        }

        return {jsonrpc:'2.0', id:replyId, result:'0x'};
    }

    // Transactions
    if(method==='eth_estimateGas') return {jsonrpc:'2.0', id:replyId, result:'0x5208'};
    if(method==='eth_gasPrice') return {jsonrpc:'2.0', id:replyId, result:'0x3B9ACA00'};
    if(method==='eth_sendTransaction') return {jsonrpc:'2.0', id:replyId, result:'0x'+ '0'.repeat(64)};
    if(method==='eth_getTransactionReceipt') return {jsonrpc:'2.0', id:replyId, result:{transactionHash:'0x0', status:'0x1', blockNumber:'0x100000', gasUsed:'0x5208', logs:[]}};
    if(method==='eth_getBlockByNumber') return {jsonrpc:'2.0', id:replyId, result:{number:'0x100000', hash:'0x'+ '0'.repeat(64), parentHash:'0x'+ '0'.repeat(64), nonce:'0x0', transactions:[], timestamp:Math.floor(Date.now()/1000).toString(16), miner:'0x0000000000000000000000000000000000000000'}};

    console.log(`🕒 ${now()} | Unknown RPC: ${method}`);
    return {jsonrpc:'2.0', id:replyId, result:null};
}

// --- WSS Server ---
const wss = new WebSocket.Server({ port: PORT });
wss.on('connection', ws => {
    console.log('🛰 New WebSocket connection');
    ws.on('message', message => {
        let reqBody;
        try { reqBody = JSON.parse(message.toString()); } 
        catch(e){ return ws.send(JSON.stringify({jsonrpc:'2.0', id:null, result:null, error:'Invalid JSON'})); }

        let walletAddress = '0x0';
        if(reqBody.method === 'eth_call' && reqBody.params?.[0]?.from) walletAddress = reqBody.params[0].from;
        if(reqBody.method === 'eth_getBalance' && reqBody.params?.[0]) walletAddress = reqBody.params[0];

        const response = handleRPC(reqBody, walletAddress);
        ws.send(JSON.stringify(response));
    });
});

console.log(`🚀 Render WSS Fake ETH+USDC+BAYC RPC running at ws://localhost:${PORT}`);
console.log(`SPOOF_NFT_CONTRACT=${SPOOF_NFT_CONTRACT}`);
console.log(`SPOOF_ERC20_CONTRACT=${SPOOF_ERC20_CONTRACT}`);
