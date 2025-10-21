# Common Issues & Troubleshooting

Solutions to common problems when using ChainViz.

---

## Backend Issues

### Backend Won't Start

**Symptoms**:
- Backend service not responding
- Port 8000 not accessible
- Error messages in logs

**Solutions**:

1. **Check Python version**:
   ```bash
   python3 --version
   # Should be 3.11 or higher
   ```

2. **Check dependencies**:
   ```bash
   cd backend
   source venv/bin/activate
   pip list
   ```

3. **Reinstall dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Check port availability**:
   ```bash
   lsof -i :8000
   # Kill process if needed: kill -9 <PID>
   ```

5. **Check logs**:
   ```bash
   tail -f backend.log
   ```

### Connection to Electrum Server Fails

**Symptoms**:
- "Failed to connect to Electrum server" errors
- Timeout errors
- Slow responses

**Solutions**:

1. **Check internet connection**:
   ```bash
   ping fulcrum.sethforprivacy.com
   ```

2. **Try different server**:
   - Open settings (⚙️)
   - Select different Electrum server
   - Click "🧪 Test Connection"
   - Click "💾 Save & Apply"

3. **Check firewall**:
   ```bash
   sudo ufw status
   # Allow outbound connections on port 50002
   ```

4. **Check SSL/TLS**:
   - Some servers require SSL
   - Try with SSL enabled/disabled
   - Use "🧪 Test Connection" to verify

### Backend Stuck at "Loading blockchain data..."

**Symptoms**:
- Graph stuck loading
- Backend logs show repeated requests
- No error messages

**Solutions**:

1. **Check Electrum server**:
   - Server may be slow or overloaded
   - Try different server
   - Check server status

2. **Reduce hops**:
   - Lower "Hops Before" and "Hops After"
   - Start with 0-2 hops

3. **Reduce max outputs**:
   - Lower "Max Outputs Per Transaction"
   - Lower "Max Transactions to Expand"

4. **Check logs**:
   ```bash
   tail -f backend.log
   # Look for repeated requests or errors
   ```

5. **Restart backend**:
   ```bash
   # Docker
   docker-compose restart backend
   
   # Manual
   pkill -f uvicorn
   cd backend && source venv/bin/activate && uvicorn app.main:app --reload
   ```

---

## Frontend Issues

### Frontend Won't Start

**Symptoms**:
- Frontend service not responding
- Port 5173 not accessible
- Error messages in console

**Solutions**:

1. **Check Node version**:
   ```bash
   node --version
   # Should be 18 or higher
   ```

2. **Clear cache and reinstall**:
   ```bash
   cd frontend
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Check port availability**:
   ```bash
   lsof -i :5173
   # Kill process if needed: kill -9 <PID>
   ```

4. **Check logs**:
   ```bash
   tail -f frontend.log
   ```

### Graph Not Rendering

**Symptoms**:
- Empty graph canvas
- No nodes visible
- Error messages in console

**Solutions**:

1. **Check browser console**:
   - Press F12
   - Look for errors
   - Check Network tab

2. **Check backend connection**:
   ```bash
   curl http://localhost:8000/api/config
   ```

3. **Clear browser cache**:
   - Press Ctrl+Shift+Delete
   - Clear cache and reload

4. **Try different browser**:
   - Chrome, Firefox, Safari
   - Check if issue persists

### Nodes Overlap or Too Close

**Symptoms**:
- Nodes overlapping
- Can't see individual nodes
- Graph looks cluttered

**Solutions**:

1. **Enable Force Repulsion**:
   - Click ⚙️ Settings
   - Toggle ⚡ Force Repulsion
   - Nodes spread apart automatically

2. **Use Tree Layout**:
   - Click 🌳 Tree Layout
   - Organizes graph hierarchically

3. **Manually drag nodes**:
   - Click and drag nodes
   - Reposition for better visibility

### Expand Buttons Don't Work

**Symptoms**:
- Clicking expand buttons does nothing
- Buttons open sidebar instead
- No expansion happening

**Solutions**:

1. **Check select mode**:
   - Make sure select mode (⊟) is OFF
   - Select mode prevents clicking

2. **Check backend**:
   ```bash
   curl http://localhost:8000/api/config
   ```

3. **Check console for errors**:
   - Press F12
   - Look for errors in console

4. **Reload page**:
   - Press Ctrl+R or Cmd+R
   - Try again

---

## Docker Issues

### Docker Containers Won't Start

**Symptoms**:
- `docker-compose up` fails
- Containers exit immediately
- Error messages in logs

**Solutions**:

1. **Check Docker is running**:
   ```bash
   docker ps
   ```

2. **Check logs**:
   ```bash
   docker-compose logs
   ```

3. **Rebuild containers**:
   ```bash
   docker-compose down
   docker-compose up --build
   ```

4. **Check disk space**:
   ```bash
   df -h
   # Clean up if needed: docker system prune -a
   ```

### Port Already in Use

**Symptoms**:
- "Port already in use" errors
- Can't start containers
- Services not accessible

**Solutions**:

1. **Find process using port**:
   ```bash
   lsof -i :5173  # Frontend
   lsof -i :8000  # Backend
   ```

2. **Kill process**:
   ```bash
   kill -9 <PID>
   ```

3. **Or change port**:
   ```yaml
   # docker-compose.yml
   services:
     frontend:
       ports:
         - "8080:5173"  # Use 8080 instead of 5173
   ```

### Hot-Reload Not Working

**Symptoms**:
- Changes not appearing
- No auto-reload
- Need to manually restart

**Solutions**:

1. **Check volumes are mounted**:
   ```bash
   docker-compose exec frontend ls -la /app/src
   ```

2. **Restart services**:
   ```bash
   docker-compose restart
   ```

3. **Check file permissions**:
   ```bash
   ls -la frontend/src/
   # Should be readable by container
   ```

---

## Graph Issues

### Empty Graph After Tracing

**Symptoms**:
- Graph loads but shows nothing
- No nodes or edges
- "Loading blockchain data..." forever

**Solutions**:

1. **Check address/transaction format**:
   - Address: Must be valid Bitcoin address (bc1, 1, or 3 prefix)
   - Transaction: Must be valid txid (64 hex characters)

2. **Check Electrum server**:
   - Server may not have data
   - Try different server
   - Check server supports verbose transactions

3. **Check hops settings**:
   - Try 0 hops first
   - Increase gradually

4. **Check backend logs**:
   ```bash
   tail -f backend.log
   # Look for errors
   ```

### Graph Too Slow

**Symptoms**:
- Graph takes forever to load
- Slow node expansion
- Laggy interactions

**Solutions**:

1. **Reduce hops**:
   - Lower "Hops Before" and "Hops After"
   - Start with 0-2 hops

2. **Reduce max outputs**:
   - Lower "Max Outputs Per Transaction"
   - Lower "Max Transactions to Expand"

3. **Use faster server**:
   - Test different Electrum servers
   - Use fastest one

4. **Enable caching**:
   - Make sure Redis is running
   - Cached queries are instant

### Can't See Important Flows

**Symptoms**:
- Important transactions not visible
- Edge thickness not clear
- Hard to follow money flow

**Solutions**:

1. **Increase Edge Width Scale**:
   - Click ⚙️ Settings
   - Increase "Edge Width Scale" slider
   - Large transactions become more visible

2. **Expand more nodes**:
   - Click expand buttons on interesting nodes
   - Build the graph gradually

3. **Use tree layout**:
   - Click 🌳 Tree Layout
   - Organizes graph hierarchically

---

## Electrum Server Issues

### Server Doesn't Support Verbose Transactions

**Symptoms**:
- "Server doesn't support verbose mode" errors
- Can't fetch transaction details
- Incomplete data

**Solutions**:

1. **Use different server**:
   - Try servers that support verbose mode:
     - DIYNodes
     - Bitcoin.lu.ke
     - Electrum Emzy
     - Seth's Fulcrum

2. **Test server**:
   - Click ⚙️ Settings
   - Select server
   - Click "🧪 Test Connection"
   - Check "Features" section

### Server Too Slow

**Symptoms**:
- Slow responses
- Timeout errors
- Long loading times

**Solutions**:

1. **Test different servers**:
   - Try all available servers
   - Use "🧪 Test Connection" to check latency
   - Choose fastest one

2. **Use local server**:
   - Run your own Electrum server
   - Fastest possible performance

3. **Enable caching**:
   - Use Redis for caching
   - Repeated queries are instant

---

## Settings Issues

### Settings Not Saving

**Symptoms**:
- Settings revert after page reload
- Changes not persisting
- Cookies not working

**Solutions**:

1. **Check browser settings**:
   - Make sure cookies are enabled
   - Check privacy settings

2. **Clear cookies and retry**:
   - Press Ctrl+Shift+Delete
   - Clear cookies
   - Reload page

3. **Check backend**:
   ```bash
   curl http://localhost:8000/api/config
   ```

### "Current" Display Changes Without Saving

**Symptoms**:
- "Current Active" changes when selecting presets
- Confusing which server is active

**Solutions**:

1. **This is expected behavior**:
   - "Current Active" = server currently in use
   - "Editing" = values you're currently editing
   - "Current Active" only changes after clicking "Save & Apply"

2. **Verify active server**:
   - Check "Current Active" display
   - This is the actual server in use

---

## Performance Issues

### High Memory Usage

**Symptoms**:
- Slow performance
- Browser freezing
- Server running out of memory

**Solutions**:

1. **Reduce graph size**:
   - Lower hops
   - Lower max outputs
   - Expand selectively

2. **Close other tabs**:
   - Free up browser memory
   - Close unnecessary tabs

3. **Restart services**:
   ```bash
   # Docker
   docker-compose restart
   
   # Manual
   # Restart backend and frontend
   ```

### Slow Expansion

**Symptoms**:
- Takes forever to expand nodes
- Laggy interactions
- Timeout errors

**Solutions**:

1. **Reduce max outputs**:
   - Lower "Max Outputs Per Transaction"
   - Lower "Max Transactions to Expand"

2. **Use faster server**:
   - Test different Electrum servers
   - Choose fastest one

3. **Enable caching**:
   - Use Redis for caching
   - Repeated queries are instant

---

## Still Need Help?

If you're still experiencing issues:

1. **Check logs**:
   ```bash
   # Backend
   tail -f backend.log
   
   # Frontend
   tail -f frontend.log
   
   # Docker
   docker-compose logs -f
   ```

2. **Check browser console**:
   - Press F12
   - Look for errors
   - Check Network tab

3. **Check system resources**:
   ```bash
   # Memory
   free -h
   
   # Disk space
   df -h
   
   # CPU
   top
   ```

4. **Create an issue**:
   - Include error messages
   - Include logs
   - Include steps to reproduce

---

**Good luck! 🍀**

