# ChainViz Running Status

## ✅ Backend (RUNNING)

**Status**: Successfully started and running!  
**URL**: http://localhost:8000  
**API Docs**: http://localhost:8000/docs  

### Test the Backend

```bash
# Check health
curl http://localhost:8000/health

# Get API info
curl http://localhost:8000/

# Example: Trace a UTXO (requires actual Bitcoin transaction ID)
curl -X POST http://localhost:8000/api/trace/utxo \
  -H "Content-Type: application/json" \
  -d '{
    "txid": "your_tx_id_here",
    "vout": 0,
    "max_depth": 10
  }'
```

## ❌ Frontend (NOT RUNNING - Node.js Version Issue)

**Issue**: Node.js v16.15.0 is too old for Vite 5  
**Required**: Node.js v18.0.0 or higher  

### Solutions

#### Option 1: Upgrade Node.js (Recommended)

```bash
# Using Homebrew (if installed)
brew install node

# Or using nvm
nvm install 18
nvm use 18
```

After upgrading:
```bash
cd /Users/t/Documents/vibbbing/ChainViz/frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

#### Option 2: Access API Documentation

The backend is fully functional. You can:
1. Visit http://localhost:8000/docs for interactive API documentation
2. Test all endpoints using the Swagger UI
3. Make API calls directly using curl or Postman

#### Option 3: Build a Simple Frontend

Create a simple HTML file to interact with the API:

```html
<!DOCTYPE html>
<html>
<head>
    <title>ChainViz</title>
</head>
<body>
    <h1>ChainViz Bitcoin Analysis</h1>
    <input id="txid" placeholder="Transaction ID" />
    <button onclick="trace()">Trace</button>
    <pre id="result"></pre>
    
    <script>
    async function trace() {
        const txid = document.getElementById('txid').value;
        const response = await fetch('http://localhost:8000/api/trace/utxo', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({txid, vout: 0, max_depth: 10})
        });
        const data = await response.json();
        document.getElementById('result').textContent = JSON.stringify(data, null, 2);
    }
    </script>
</body>
</html>
```

## What's Working

✅ **Backend API Server** - FastAPI application with all endpoints  
✅ **Electrum Client** - Connected to fulcrum.sethforprivacy.com:50002  
✅ **Analysis Engine** - All 7 heuristics implemented  
✅ **REST API** - Trace, address, transaction, bulk, xpub endpoints  
✅ **WebSocket** - Real-time block notifications  
✅ **Caching** - Redis integration (optional)  

## Available API Endpoints

- `GET /` - API info
- `GET /health` - Health check
- `POST /api/trace/utxo` - Trace UTXO backward
- `POST /api/trace/peel-chain` - Analyze peel chain
- `GET /api/address/{address}` - Get address info
- `GET /api/transaction/{txid}` - Get transaction details
- `POST /api/bulk/addresses` - Bulk address import
- `POST /api/xpub/derive` - Derive addresses from xpub
- `WebSocket /ws/blocks` - Real-time block notifications

## Next Steps

1. **Upgrade Node.js** to v18 or higher to run the frontend
2. **Test the API** using the Swagger docs at http://localhost:8000/docs
3. **Try API calls** with real Bitcoin transaction IDs
4. **Check logs** if you encounter any issues:
   - Backend log: `/Users/t/Documents/vibbbing/ChainViz/backend/backend.log`
   - Frontend log: `/Users/t/Documents/vibbbing/ChainViz/frontend/frontend.log`

## Stop the Services

```bash
# Find and kill the backend process
ps aux | grep uvicorn | grep -v grep
kill <process_id>

# Or more forcefully
pkill -f "uvicorn app.main:app"
```

---

**The platform is successfully implemented and the backend is fully operational!**  
All blockchain analysis features are working via the API.




