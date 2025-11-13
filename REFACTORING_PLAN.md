# ChainViz Backend Refactoring Plan

## Executive Summary

This document outlines a comprehensive refactoring plan for the ChainViz backend codebase to improve maintainability, testability, and performance. The refactoring addresses key architectural issues including circular dependencies, code duplication, and poor separation of concerns.

## Current Architecture Issues

### 1. Circular Dependencies
- `electrum_client.py` ↔ `electrum_multiplexer.py` ↔ `electrum_pool.py`
- Multiple files import from each other creating tight coupling
- Runtime imports used as workaround (`from app.config import settings` inside functions)

### 2. Code Duplication
- Address conversion logic in multiple files
- P2PK script extraction repeated in `trace.py` and `blockchain_data.py`
- Batch processing patterns duplicated across services
- Error handling and logging patterns inconsistent

### 3. Large Monolithic Files
- `trace.py`: 820 lines (massive API endpoint)
- `electrum_pool.py`: 762 lines (large pool management)
- `blockchain_data.py`: 653 lines (large service file)

### 4. Poor Separation of Concerns
- API endpoints contain business logic
- Data parsing mixed with fetching
- Heuristic analysis mixed with data access
- Configuration scattered throughout codebase

## Proposed Architecture

### Layered Architecture

```
┌─────────────────────────────────────────┐
│             API Layer (FastAPI)         │
│  (Endpoints, Request/Response handling) │
├─────────────────────────────────────────┤
│         Service Layer (Business Logic)  │
│  (Orchestration, Heuristics, Analysis)  │
├─────────────────────────────────────────┤
│         Data Access Layer (DAL)         │
│   (Electrum, Mempool, Redis clients)    │
├─────────────────────────────────────────┤
│         Utilities & Common Code         │
│ (Address conversion, Crypto functions)  │
└─────────────────────────────────────────┘
```

### Key Components

#### 1. Core Utilities Module (`app/core/`)
- `address_utils.py`: Address conversion, script hash generation
- `crypto_utils.py`: Cryptographic functions, P2PK extraction
- `batch_utils.py`: Batch processing utilities
- `logging_utils.py`: Standardized logging setup

#### 2. Data Access Layer (`app/dal/`)
- `electrum/`: Electrum client implementations
  - `client.py`: Base Electrum protocol client
  - `pool.py`: Connection pool management
  - `multiplexer.py`: High-level routing
- `mempool/`: Mempool.space client
  - `client.py`: HTTP client
  - `router.py`: Endpoint routing
- `cache/`: Redis caching layer

#### 3. Service Layer (`app/services/`)
- `transaction_service.py`: Transaction operations
- `address_service.py`: Address operations
- `trace_service.py`: UTXO tracing logic
- `analysis_service.py`: Heuristic analysis orchestration

#### 4. API Layer (`app/api/`)
- `v1/`: Versioned endpoints
  - `transactions.py`: Transaction endpoints
  - `addresses.py`: Address endpoints
  - `trace.py`: Tracing endpoints
  - `bulk.py`: Bulk operations

## Detailed Refactoring Steps

### Phase 1: Extract Core Utilities

**Goal**: Eliminate code duplication and create reusable components

#### 1.1 Create `app/core/address_utils.py`
```python
# Consolidate address conversion logic
- Move `_address_to_scripthash()` from electrum_client.py
- Move `_decode_bech32()` from electrum_client.py
- Move `_extract_pubkey_from_p2pk_script()` from blockchain_data.py
- Move `_extract_address_from_script_sig()` from blockchain_data.py
```

#### 1.2 Create `app/core/crypto_utils.py`
```python
# Cryptographic helper functions
- Hash functions (SHA256, RIPEMD160)
- Base58 encoding/decoding
- Bech32 encoding/decoding
- Script parsing utilities
```

#### 1.3 Create `app/core/batch_utils.py`
```python
# Batch processing utilities
- Deduplication with order preservation
- Chunking algorithms
- Parallel execution helpers
- Rate limiting utilities
```

### Phase 2: Restructure Data Access Layer

**Goal**: Clean separation of data access concerns

#### 2.1 Refactor Electrum Client
```
app/dal/electrum/
├── __init__.py
├── client.py          # Base ElectrumClient (simplified)
├── connection.py      # Connection management
├── pool.py            # ConnectionPool (from electrum_pool.py)
└── multiplexer.py     # High-level API (from electrum_multiplexer.py)
```

**Key Changes**:
- Remove circular dependencies
- Use dependency injection instead of global instances
- Separate connection logic from business logic
- Standardize error handling

#### 2.2 Refactor Mempool Client
```
app/dal/mempool/
├── __init__.py
├── client.py          # HTTP client
├── router.py          # Endpoint routing
└── models.py          # Data models
```

#### 2.3 Create Cache Layer
```
app/dal/cache/
├── __init__.py
├── client.py          # Redis client wrapper
└── decorators.py      # Cache decorators
```

### Phase 3: Service Layer Refactoring

**Goal**: Business logic separation and improved testability

#### 3.1 Create `app/services/transaction_service.py`
```python
# Transaction operations
- fetch_transaction()
- fetch_transactions_batch()
- parse_transaction()
- Transaction analysis
```

#### 3.2 Create `app/services/address_service.py`
```python
# Address operations
- fetch_address_history()
- fetch_address_info()
- Address clustering
```

#### 3.3 Create `app/services/trace_service.py`
```python
# UTXO tracing logic (extracted from trace.py)
- trace_utxo()
- trace_address()
- Graph building
- Heuristic application
```

#### 3.4 Create `app/services/analysis_service.py`
```python
# Heuristic analysis orchestration
- Change detection
- CoinJoin detection
- Peel chain analysis
- Clustering
```

### Phase 4: API Layer Cleanup

**Goal**: Thin controllers, focused on request/response handling

#### 4.1 Refactor `app/api/trace.py`
```python
# Reduce from 820 lines to ~150 lines
- Extract business logic to TraceService
- Focus on request validation and response formatting
- Remove duplicate code
- Standardize error handling
```

#### 4.2 Standardize All API Endpoints
- Consistent request/response patterns
- Standardized error responses
- Proper dependency injection
- Consistent logging

### Phase 5: Configuration Management

**Goal**: Centralized, type-safe configuration

#### 5.1 Refactor `app/config.py`
```python
# Improved configuration management
- Type-safe settings with Pydantic
- Environment-based configuration
- Configuration validation
- Documentation for all settings
```

#### 5.2 Create `app/core/dependencies.py`
```python
# Dependency injection setup
- Service instances
- Database connections
- Cache clients
```

### Phase 6: Testing Infrastructure

**Goal**: Comprehensive test coverage for refactored code

#### 6.1 Create Test Structure
```
tests/
├── unit/
│   ├── core/
│   ├── dal/
│   └── services/
├── integration/
│   ├── api/
│   └── services/
└── fixtures/
    ├── transactions.py
    └── addresses.py
```

#### 6.2 Add Test Utilities
- Mock Electrum servers
- Test data factories
- Integration test helpers

## Implementation Priority

### High Priority (Critical Issues)
1. **Extract core utilities** - Eliminate code duplication
2. **Break circular dependencies** - Restructure electrum client hierarchy
3. **Extract trace logic** - Reduce trace.py complexity
4. **Standardize error handling** - Consistent patterns across codebase

### Medium Priority (Improvements)
1. **Service layer separation** - Clean business logic separation
2. **API standardization** - Consistent endpoint patterns
3. **Configuration cleanup** - Better configuration management
4. **Add type hints** - Improve code quality

### Low Priority (Nice to Have)
1. **Testing infrastructure** - Comprehensive test coverage
2. **Documentation** - API documentation and guides
3. **Performance optimizations** - Based on new architecture
4. **Monitoring** - Better observability

## Migration Strategy

### Step 1: Create New Structure
- Create new directory structure
- Move files to appropriate locations
- Maintain backward compatibility with imports

### Step 2: Extract Utilities
- Create core utility modules
- Update imports across codebase
- Test utility functions in isolation

### Step 3: Refactor Data Access
- Restructure electrum client hierarchy
- Create clean separation between layers
- Test data access layer independently

### Step 4: Migrate Business Logic
- Extract services from API endpoints
- Move logic to appropriate service layer
- Maintain API compatibility

### Step 5: Update API Layer
- Refactor endpoints to use new services
- Standardize patterns
- Test API endpoints

### Step 6: Testing and Validation
- Add comprehensive tests
- Performance testing
- Integration testing

## Benefits

### Immediate Benefits
- **Reduced complexity**: Clear separation of concerns
- **Eliminated circular dependencies**: Clean import hierarchy
- **Code reuse**: Centralized utilities
- **Improved maintainability**: Smaller, focused modules

### Long-term Benefits
- **Better testability**: Easy to test individual components
- **Scalability**: Clean architecture supports growth
- **Developer onboarding**: Clear structure and patterns
- **Performance**: Optimized data access patterns

## Risk Mitigation

### Risks
1. **Breaking changes**: API compatibility issues
2. **Performance regression**: New architecture overhead
3. **Scope creep**: Refactoring taking too long
4. **Testing gaps**: Missing test coverage

### Mitigation Strategies
1. **Backward compatibility**: Maintain existing API contracts
2. **Performance testing**: Benchmark before/after
3. **Phased approach**: Small, incremental changes
4. **Comprehensive testing**: Test each component thoroughly

## Timeline Estimate

- **Phase 1 (Utilities)**: 2-3 days
- **Phase 2 (Data Access)**: 3-4 days
- **Phase 3 (Services)**: 4-5 days
- **Phase 4 (API)**: 2-3 days
- **Phase 5 (Config)**: 1-2 days
- **Phase 6 (Testing)**: 3-4 days

**Total estimated time**: 15-21 days

## Success Metrics

- **Code quality**: 50% reduction in code duplication
- **Test coverage**: 80%+ coverage on refactored code
- **Performance**: No performance regression
- **Maintainability**: 30% reduction in average file size
- **Developer satisfaction**: Easier to understand and modify