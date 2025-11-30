import { useState, memo } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface MultiAddressInputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTraceAddresses: (addresses: string[], hopsBefore: number, hopsAfter: number) => void;
    isLoading: boolean;
}

export const MultiAddressInputModal = memo(function MultiAddressInputModal({
    isOpen,
    onClose,
    onTraceAddresses,
    isLoading,
}: MultiAddressInputModalProps) {
    const [addresses, setAddresses] = useState<string[]>([]);
    const [currentInput, setCurrentInput] = useState('');
    const [hopsBefore, setHopsBefore] = useState(1);
    const [hopsAfter, setHopsAfter] = useState(1);

    if (!isOpen) return null;

    const handleAddAddress = () => {
        if (!currentInput.trim()) return;

        // Split by comma, newline, or space
        const inputs = currentInput.split(/[\n, ]+/).map(s => s.trim()).filter(s => s);
        const newAddresses: string[] = [];
        let hasInvalid = false;

        for (const input of inputs) {
            // Basic validation - just check it's not a transaction ID
            if (/^[0-9a-fA-F]{64}$/.test(input)) {
                hasInvalid = true;
                continue;
            }

            // Add if not already in list
            if (!addresses.includes(input) && !newAddresses.includes(input)) {
                newAddresses.push(input);
            }
        }

        if (hasInvalid) {
            alert('Some inputs appeared to be transaction IDs and were skipped. Please use Bitcoin addresses only.');
        }

        if (newAddresses.length > 0) {
            setAddresses([...addresses, ...newAddresses]);
            setCurrentInput('');
        } else if (inputs.length > 0 && !hasInvalid) {
            alert('Address(es) already added');
        }
    };


    const handleRemoveAddress = (index: number) => {
        setAddresses(addresses.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        if (addresses.length === 0) {
            alert('Please add at least one address');
            return;
        }

        onTraceAddresses(addresses, hopsBefore, hopsAfter);
        // Reset state
        setAddresses([]);
        setCurrentInput('');
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddAddress();
        }
    };

    return (
        <>
            <div
                className="modal-overlay"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.7)',
                    zIndex: 9999,
                }}
            />
            <div
                className="modal-content"
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    width: '90%',
                    background: '#1a1a1a',
                    border: '1px solid rgba(100, 181, 246, 0.3)',
                    borderRadius: '12px',
                    padding: '0',
                    zIndex: 10000,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)',
                }}
            >
                <div className="modal-header">
                    <h2>🔗 Multi-Address Trace</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Instructions */}
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                        Add multiple Bitcoin addresses to trace their connections simultaneously. You can paste a comma-separated list.
                    </p>
                    {/* Add Address Input */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            value={currentInput}
                            onChange={(e) => setCurrentInput(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Enter Bitcoin addresses (comma separated)..."
                            style={{
                                flex: 1,
                                padding: '10px 12px',
                                background: 'rgba(30, 30, 30, 0.6)',
                                border: '1px solid rgba(100, 181, 246, 0.3)',
                                borderRadius: '6px',
                                color: 'var(--text-primary)',
                                fontSize: '14px',
                            }}
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleAddAddress}
                            disabled={isLoading || !currentInput.trim()}
                            style={{
                                padding: '10px 16px',
                                background: 'rgba(100, 181, 246, 0.2)',
                                border: '1px solid rgba(100, 181, 246, 0.5)',
                                borderRadius: '6px',
                                color: '#64b5f6',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 600,
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => {
                                if (!isLoading && currentInput.trim()) {
                                    e.currentTarget.style.background = 'rgba(100, 181, 246, 0.3)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(100, 181, 246, 0.2)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <Plus size={16} />
                            Add
                        </button>
                    </div>

                    {/* Address List */}
                    <div
                        style={{
                            flex: 1,
                            maxHeight: '300px',
                            overflowY: 'auto',
                            background: 'rgba(20, 20, 20, 0.5)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '8px',
                        }}
                    >
                        {addresses.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', margin: '20px 0' }}>
                                No addresses added yet
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {addresses.map((addr, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px 12px',
                                            background: 'rgba(30, 30, 30, 0.6)',
                                            border: '1px solid rgba(100, 181, 246, 0.2)',
                                            borderRadius: '4px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                fontFamily: 'monospace',
                                                color: 'var(--text-primary)',
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                            }}
                                            title={addr}
                                        >
                                            {addr}
                                        </span>
                                        <button
                                            onClick={() => handleRemoveAddress(index)}
                                            style={{
                                                background: 'rgba(244, 67, 54, 0.2)',
                                                border: '1px solid rgba(244, 67, 54, 0.3)',
                                                borderRadius: '4px',
                                                color: '#f44336',
                                                cursor: 'pointer',
                                                padding: '4px 8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                fontSize: '12px',
                                                transition: 'all 0.2s ease',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(244, 67, 54, 0.3)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)';
                                            }}
                                        >
                                            <Trash2 size={14} />
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Hop Controls */}
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                Hops Backward
                            </label>
                            <input
                                type="number"
                                value={hopsBefore}
                                onChange={(e) => setHopsBefore(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                                min="0"
                                max="10"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'rgba(30, 30, 30, 0.6)',
                                    border: '1px solid rgba(100, 181, 246, 0.3)',
                                    borderRadius: '6px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                }}
                                disabled={isLoading}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                                Hops Forward
                            </label>
                            <input
                                type="number"
                                value={hopsAfter}
                                onChange={(e) => setHopsAfter(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                                min="0"
                                max="10"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    background: 'rgba(30, 30, 30, 0.6)',
                                    border: '1px solid rgba(100, 181, 246, 0.3)',
                                    borderRadius: '6px',
                                    color: 'var(--text-primary)',
                                    fontSize: '14px',
                                }}
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    {/* Summary */}
                    {addresses.length > 0 && (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                            📊 Ready to trace <strong>{addresses.length}</strong> address{addresses.length > 1 ? 'es' : ''}
                        </p>
                    )}
                </div>

                <div className="modal-footer">
                    <button onClick={onClose} disabled={isLoading} style={{ marginRight: '8px' }}>
                        Cancel
                    </button>
                    <button
                        className="modal-confirm"
                        onClick={handleSubmit}
                        disabled={isLoading || addresses.length === 0}
                    >
                        {isLoading ? 'Tracing...' : 'Trace All Addresses'}
                    </button>
                </div>
            </div>
        </>
    );
});
