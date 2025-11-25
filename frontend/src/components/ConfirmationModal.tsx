import { AlertTriangle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmationModal({ isOpen, message, onConfirm, onCancel }: ConfirmationModalProps) {
    if (!isOpen) return null;

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 999,
                }}
                onClick={onCancel}
            />
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: '#1a1a1a',
                    border: '1px solid #444',
                    borderRadius: '8px',
                    padding: '20px',
                    width: '400px',
                    maxWidth: '90vw',
                    zIndex: 1000,
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <AlertTriangle size={24} color="#ff9800" />
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Confirmation Required</h3>
                </div>

                <div style={{ color: '#ccc', marginBottom: '24px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                    {message}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '8px 16px',
                            background: 'transparent',
                            border: '1px solid #666',
                            borderRadius: '4px',
                            color: '#ccc',
                            cursor: 'pointer',
                            fontSize: '14px',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = '#999'}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = '#666'}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '8px 16px',
                            background: '#ff9800',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#000',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            fontSize: '14px',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#ffa726'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#ff9800'}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </>
    );
}
