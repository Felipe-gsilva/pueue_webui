import React from 'react';
import { Button, TextInput, Alert } from '@patternfly/react-core';
import { KeyIcon, EyeIcon, EyeSlashIcon } from '@patternfly/react-icons';
import { pueueManager } from '../pueue-manager';

interface AuthViewProps {
    onAuthenticated: (token: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthenticated }) => {
    const [password, setPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [error, setError] = React.useState('');
    const [loading, setLoading] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) {
            setError('Por favor, insira a senha.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await pueueManager.verify_password(password);
            if (res && res.status === 'success' && res.token) {
                localStorage.setItem('pueue_session_token', res.token);
                onAuthenticated(res.token);
            } else {
                setError(res?.message || 'Senha incorreta.');
            }
        } catch (err) {
            setError('Erro ao se conectar ao servidor.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card glass-panel">
                <div className="login-header">
                    <div className="logo-badge" style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                        <img src="/lipai_01_cor.png" alt="LIPAI Logo" style={{ width: '200px', height: 'auto' }} />
                    </div>
                    <h1>G-Pueue</h1>
                    <p>Painel de Controle Auto-Hospedado</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && (
                        <Alert variant="danger" title={error} isInline className="mb-4" />
                    )}

                    <div className="form-group">
                        <label htmlFor="password-input">Senha de Acesso</label>
                        <div className="input-wrapper">
                            <span className="input-icon"><KeyIcon /></span>
                            <TextInput
                                id="password-input"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(_, v) => setPassword(v)}
                                placeholder="Insira sua senha"
                                className="styled-input"
                                autoFocus
                            />
                            <button
                                type="button"
                                className="toggle-password-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={loading}
                        isDisabled={loading}
                        className="login-btn"
                    >
                        {loading ? 'Autenticando...' : 'Entrar'}
                    </Button>
                </form>
            </div>
        </div>
    );
};
