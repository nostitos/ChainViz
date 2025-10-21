# Development Setup

Guide for developers who want to contribute to ChainViz or customize it for their needs.

---

## Prerequisites

- **Python 3.11+** with pip
- **Node.js 18+** with npm/pnpm
- **Git** for version control
- **Redis** (optional, for caching)
- **Docker** (optional, for testing)

---

## Backend Development

### Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install development dependencies
pip install pytest pytest-asyncio black isort mypy
```

### Run Development Server

```bash
# With auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# With debug logging
uvicorn app.main:app --reload --log-level debug
```

### Code Style

ChainViz follows Python best practices:

```bash
# Format code
black app/

# Sort imports
isort app/

# Type checking
mypy app/
```

### Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_heuristics.py

# Run with verbose output
pytest -v
```

### Project Structure

```
backend/
├── app/
│   ├── api/              # API endpoints
│   │   ├── trace.py      # Tracing endpoints
│   │   ├── address.py    # Address endpoints
│   │   ├── transaction.py
│   │   ├── bulk.py
│   │   ├── xpub.py
│   │   ├── websocket.py
│   │   └── config.py
│   ├── analysis/         # Heuristic algorithms
│   │   ├── orchestrator.py
│   │   ├── clustering.py
│   │   ├── change_detection.py
│   │   ├── coinjoin.py
│   │   ├── peel_chain.py
│   │   ├── temporal.py
│   │   └── amount_patterns.py
│   ├── services/         # Business logic
│   │   ├── blockchain_data.py
│   │   ├── electrum_client.py
│   │   └── xpub_parser.py
│   ├── models/           # Data models
│   │   ├── api.py
│   │   ├── blockchain.py
│   │   └── analysis.py
│   ├── config.py         # Configuration
│   └── main.py           # FastAPI app
├── tests/                # Test suite
└── requirements.txt      # Dependencies
```

---

## Frontend Development

### Setup

```bash
cd frontend

# Install dependencies
npm install
# or
pnpm install

# Install development dependencies
npm install --save-dev @types/react @types/react-dom
```

### Run Development Server

```bash
npm run dev
# or
pnpm dev
```

Frontend will be available at http://localhost:5173 with hot-reload enabled.

### Build

```bash
# Production build
npm run build

# Preview production build
npm run preview
```

### Code Style

ChainViz uses TypeScript with strict mode:

```bash
# Type checking
npm run type-check
# or
tsc --noEmit

# Linting
npm run lint
```

### Project Structure

```
frontend/
├── src/
│   ├── components/       # React components
│   │   ├── nodes/        # Node components
│   │   │   ├── AddressNode.tsx
│   │   │   ├── TransactionNode.tsx
│   │   │   ├── AddressClusterNode.tsx
│   │   │   └── TransactionClusterNode.tsx
│   │   ├── SearchBar.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── EntityPanel.tsx
│   │   ├── StatsPanel.tsx
│   │   └── EdgeLegend.tsx
│   ├── hooks/            # Custom React hooks
│   │   ├── useForceLayout.ts
│   │   └── useEdgeTension.ts
│   ├── services/         # API clients
│   │   └── api.ts
│   ├── utils/            # Utility functions
│   │   ├── graphBuilderBipartite.ts
│   │   └── treeLayout.ts
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   ├── App.tsx           # Main app component
│   ├── App.css           # Global styles
│   └── main.tsx          # Entry point
├── public/               # Static assets
└── package.json
```

---

## Development Workflow

### 1. Make Changes

Edit code in your favorite editor. Both backend and frontend support hot-reload:

- **Backend**: Automatically restarts when you save Python files
- **Frontend**: Automatically refreshes when you save TypeScript/React files

### 2. Test Changes

```bash
# Backend
pytest

# Frontend
npm run type-check
```

### 3. Format Code

```bash
# Backend
black app/
isort app/

# Frontend
npm run lint
```

### 4. Commit Changes

```bash
git add .
git commit -m "Description of changes"
git push
```

---

## Adding New Features

### Backend: Add New Heuristic

1. Create file in `app/analysis/`:
   ```python
   # app/analysis/my_heuristic.py
   from app.models.analysis import HeuristicResult

   async def detect_my_pattern(tx_data, confidence=0.8):
       # Your logic here
       return HeuristicResult(
           name="My Pattern",
           confidence=confidence,
           metadata={}
       )
   ```

2. Integrate in `app/analysis/orchestrator.py`:
   ```python
   from app.analysis.my_heuristic import detect_my_pattern

   # Add to heuristic pipeline
   ```

3. Test:
   ```bash
   pytest tests/test_my_heuristic.py
   ```

### Frontend: Add New Node Type

1. Create component in `src/components/nodes/`:
   ```typescript
   // src/components/nodes/MyNode.tsx
   import { Handle, Position } from 'reactflow';

   export function MyNode({ data }) {
     return (
       <div className="my-node">
         <Handle type="target" position={Position.Left} />
         <div>{data.label}</div>
         <Handle type="source" position={Position.Right} />
       </div>
     );
   }
   ```

2. Register in `src/App.tsx`:
   ```typescript
   import { MyNode } from './components/nodes/MyNode';

   const nodeTypes = {
     myNode: MyNode,
     // ... other types
   };
   ```

3. Use in graph builder:
   ```typescript
   nodes.push({
     type: 'myNode',
     data: { label: 'My Node' },
     // ...
   });
   ```

---

## Debugging

### Backend

**Enable debug logging**:
```bash
uvicorn app.main:app --reload --log-level debug
```

**View logs**:
```bash
tail -f backend.log
```

**Use debugger**:
```python
import pdb; pdb.set_trace()
# or
import ipdb; ipdb.set_trace()
```

### Frontend

**Enable React DevTools**:
- Install browser extension
- Open DevTools (F12)
- Go to "React" tab

**Use debugger**:
```typescript
debugger; // Pauses execution
console.log('Debug:', variable);
```

**View network requests**:
- Open DevTools (F12)
- Go to "Network" tab
- Filter by "Fetch/XHR"

---

## Performance Profiling

### Backend

```python
# Add timing decorator
import time

def timing_decorator(func):
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        end = time.time()
        print(f"{func.__name__} took {end - start:.2f}s")
        return result
    return wrapper

@timing_decorator
def my_function():
    # ...
```

### Frontend

```typescript
// Use React Profiler
import { Profiler } from 'react';

function onRenderCallback(id, phase, actualDuration) {
  console.log(`Component ${id} (${phase}) took ${actualDuration}ms`);
}

<Profiler id="Graph" onRender={onRenderCallback}>
  <ReactFlow ... />
</Profiler>
```

---

## Environment Variables

Create `.env` file in `backend/`:

```bash
# Electrum Server
ELECTRUM_HOST=fulcrum.sethforprivacy.com
ELECTRUM_PORT=50002
ELECTRUM_USE_SSL=true

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Debug
DEBUG=true
LOG_LEVEL=INFO
```

---

## Contributing

### Before Submitting PR

1. **Run tests**:
   ```bash
   pytest  # Backend
   npm test  # Frontend
   ```

2. **Format code**:
   ```bash
   black app/  # Backend
   npm run lint  # Frontend
   ```

3. **Update documentation**:
   - Update relevant `.md` files
   - Add code comments
   - Update API docs if needed

4. **Commit with clear message**:
   ```bash
   git commit -m "feat: add new heuristic for pattern detection"
   ```

### Code Review Checklist

- [ ] Code follows style guide
- [ ] Tests pass
- [ ] Documentation updated
- [ ] No console.log/debugger statements
- [ ] Error handling implemented
- [ ] Performance considered

---

## Resources

- **Backend API Docs**: http://localhost:8000/docs
- **React Flow Docs**: https://reactflow.dev/
- **FastAPI Docs**: https://fastapi.tiangolo.com/
- **TypeScript Docs**: https://www.typescriptlang.org/docs/

---

## Need Help?

- Check [Troubleshooting](../troubleshooting/common-issues.md)
- Review [Architecture](../architecture/backend-architecture.md)
- See [API Reference](../guides/api-reference.md)
- Ask in issues or discussions

**Happy coding! 🚀**

