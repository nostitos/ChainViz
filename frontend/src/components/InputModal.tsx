import { useState, useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

interface InputModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    defaultValue?: string;
    placeholder?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
}

export function InputModal({
    isOpen,
    title,
    message,
    defaultValue = '',
    placeholder = '',
    onConfirm,
    onCancel
}: InputModalProps) {
    const [value, setValue] = useState(defaultValue);
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset value when modal opens
    useEffect(() => {
        if (isOpen) {
            setValue(defaultValue);
            // Focus input after a short delay to allow render
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 50);
        }
    }, [isOpen, defaultValue]);

    if (!isOpen) return null;

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        onConfirm(value);
    };

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
                    <FileText size={24} color="#4dabf7" />
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>{title}</h3>
                </div>

                <div style={{ color: '#ccc', marginBottom: '16px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                    {message}
                </div>

                <form onSubmit={handleSubmit}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder={placeholder}
                        style={{
                            width: '100%',
                            padding: '10px',
                            background: '#2a2a2a',
                            border: '1px solid #555',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '14px',
                            marginBottom: '24px',
                            boxSizing: 'border-box',
                        }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button
                            type="button"
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
                            type="submit"
                            style={{
                                padding: '8px 16px',
                                background: '#4dabf7',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#000',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#74c0fc'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#4dabf7'}
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
