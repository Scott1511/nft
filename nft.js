const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 9798;
const HOST = '0.0.0.0';

app.use(bodyParser.json());

// Minimal JSON-RPC handler
app.post('/', (req, res) => {
    const { method, params, id } = req.body;

    if (method === 'eth_chainId') {
        return res.json({ jsonrpc: '2.0', id, result: '0x1' }); // Ethereum mainnet
    }

    if (method === 'net_version') {
        return res.json({ jsonrpc: '2.0', id, result: '1' });
    }

    if (method === 'eth_blockNumber') {
        return res.json({ jsonrpc: '2.0', id, result: '0x100000' });
    }

    if (method === 'eth_syncing') {
        return res.json({ jsonrpc: '2.0', id, result: false });
    }

    if (method === 'eth_estimateGas') {
        return res.json({ jsonrpc: '2.0', id, result: '0x5208' }); // 21000
    }

    if (method === 'eth_gasPrice') {
        return res.json({ jsonrpc: '2.0', id, result: '0x3B9ACA00' }); // 1 Gwei
    }

    if (method === 'eth_sendTransaction') {
        const fakeTxHash = '0x' + '0'.repeat(64);
        return res.json({ jsonrpc: '2.0', id, result: fakeTxHash });
    }

    if (method === 'eth_getTransactionReceipt') {
        const txHash = params[0];
        return res.json({
            jsonrpc: '2.0',
            id,
            result: {
                transactionHash: txHash,
                status: '0x1',
                blockNumber: '0x100000',
                gasUsed: '0x5208',
                logs: []
            }
        });
    }

    if (method === 'eth_getBlockByNumber') {
        return res.json({
            jsonrpc: '2.0',
            id,
            result: {
                number: '0x100000',
                hash: '0x' + '0'.repeat(64),
                parentHash: '0x' + '0'.repeat(64),
                nonce: '0x0000000000000000',
                transactions: [],
                timestamp: Math.floor(Date.now() / 1000).toString(16),
                miner: '0x0000000000000000000000000000000000000000',
            }
        });
    }

    if (method === 'eth_getCode') {
        return res.json({ jsonrpc: '2.0', id, result: '0x' });
    }

    // Fallback for unknown methods
    return res.json({ jsonrpc: '2.0', id, result: null });
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Minimal Ethereum RPC server running at http://${HOST}:${PORT}`);
});
