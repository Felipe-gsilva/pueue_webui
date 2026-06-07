import React from 'react';
import { createRoot } from 'react-dom/client';

import { pueueManager, establishWebsocket } from './pueue-manager';
import { PueueView } from './views/pueue-view';
import { AuthView } from './views/auth-view';
import { views } from './views';

import "@patternfly/patternfly/patternfly";
import "@patternfly/patternfly/patternfly-theme-dark";
import "./styles";

const App = () => {
    const [authRequired, setAuthRequired] = React.useState<boolean | null>(null);
    const [authenticated, setAuthenticated] = React.useState<boolean>(false);
    const [loading, setLoading] = React.useState<boolean>(true);

    const checkAuth = React.useCallback(async () => {
        try {
            const required = await pueueManager.is_password_required();
            setAuthRequired(required);
            if (required) {
                const token = localStorage.getItem('pueue_session_token');
                if (token) {
                    const ok = await pueueManager.verify_session_token(token);
                    if (ok) {
                        setAuthenticated(true);
                    } else {
                        localStorage.removeItem('pueue_session_token');
                    }
                }
            } else {
                setAuthenticated(true);
            }
        } catch (err) {
            console.error('Error during auth check:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    const handleAuthenticated = (token: string) => {
        setAuthenticated(true);
    };

    const handleLogout = async () => {
        const token = localStorage.getItem('pueue_session_token');
        if (token) {
            try {
                await pueueManager.logout(token);
            } catch (err) {
                console.error(err);
            }
            localStorage.removeItem('pueue_session_token');
        }
        setAuthenticated(false);
    };

    if (loading) {
        return (
            <div className="analytics-loading" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    if (authRequired && !authenticated) {
        return <AuthView onAuthenticated={handleAuthenticated} />;
    }

    const viewsSorted = views.filter(Boolean);
    viewsSorted.sort((a, b) => a.priority - b.priority);

    return (
        <PueueView followGlobalDark={false} onLogout={handleLogout} authEnabled={!!authRequired}>
            {viewsSorted.map((x) => <React.Fragment key={x.priority}>{x.view}<br/></React.Fragment>)}
        </PueueView>
    );
};

document.addEventListener('DOMContentLoaded', async () => {
    await pueueManager.connect(establishWebsocket('ws://' + window.location.host));
    
    const e = document.getElementById('main-views');
    if (e) {
        createRoot(e).render(<App />);
    }
});
