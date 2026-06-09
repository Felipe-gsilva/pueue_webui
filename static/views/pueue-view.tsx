import React from 'react';
import {
    ExpandableRowContent,
    Table, Thead, Tbody, Tr, Th, Td,
    ActionsColumn,
    InnerScrollContainer,
} from '@patternfly/react-table';
import {
    ActionList,
    ActionListItem,
    Alert,
    AlertActionCloseButton,
    AlertGroup,
    Button,
    Card,
    CardBody,
    DescriptionList,
    DescriptionListDescription,
    DescriptionListGroup,
    DescriptionListTerm,
    Label,
    Switch,
    Tab,
    Tabs,
    Text,
    TextInput,
    TextInputGroup,
    TextInputGroupMain,
    TextInputGroupUtilities,
    getBreakpoint,
    Modal,
    ModalVariant,
    Form,
    FormGroup,
} from '@patternfly/react-core';

import { TimesIcon, RedoIcon, PlusCircleIcon, ArrowRightIcon, TrashIcon, EditIcon, BarsIcon, ListIcon, ChartLineIcon, SignOutAltIcon } from '@patternfly/react-icons';
import { pueueManager, PueueMessageEvent } from '../pueue-manager';
import { AnalyticsView } from './analytics-view';
import { DocsView } from './docs-view';
import {
    timeout,
    formatTime,
    PueueTask,
    PueueGroup,
    PueueMeta,
    PueueContext,
    pueueContext,
    PueueContextProvider,
    textInputBinder,
} from '../utils';


const LogView = ({ id } : { id : string }) => {
    const [ log, setLog ] = React.useState<string>('');
    const [ follow, setFollow ] = React.useState<boolean>(true);
    const [ isCollapsed, setIsCollapsed ] = React.useState<boolean>(true);
    const [ logDetails, setLogDetails ] = React.useState<{
        startSize: number;
        endSize: number;
        isTruncated: boolean;
        loadedFull: boolean;
    }>({ startSize: 0, endSize: 0, isTruncated: false, loadedFull: false });

    // Search state
    const [ showSearch, setShowSearch ] = React.useState<boolean>(false);
    const [ searchQuery, setSearchQuery ] = React.useState<string>('');
    const [ currentMatchIndex, setCurrentMatchIndex ] = React.useState<number>(0);

    const elemRef = React.useRef<HTMLDivElement>(null);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const context = React.useContext(pueueContext);

    const formatBytes = (bytes: number, decimals = 1) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const appendLog = (e : Event) => {
        const data = (e as PueueMessageEvent).data;
        if (data[0] != id) {
            console.log(data[0], id);
            return;
        }
        // data post processing for better visualization
        const log_data = data[3].replace(/[\r\n]+/g, '\n'); // normalize all line breaks
        setLog((l) => l + log_data);
    };

    const task = context.tasks[id] || new PueueTask();
    const taskStatusStr = JSON.stringify(task.status);

    React.useEffect(() => {
        setLog('');
        setLogDetails({ startSize: 0, endSize: 0, isTruncated: false, loadedFull: false });
        pueueManager.observer.addEventListener('onLogUpdated', appendLog);
        pueueManager.pueue_log_subscription(id, true)
            .then((data) => {
                setLogDetails({
                    startSize: data[1],
                    endSize: data[2],
                    isTruncated: data[1] > 0,
                    loadedFull: false
                });
                pueueManager.observer.dispatchEvent(new PueueMessageEvent('onLogUpdated', data));
            });
        return () => {
            pueueManager.pueue_log_subscription(id, false);
            pueueManager.observer.removeEventListener('onLogUpdated', appendLog);
        };
    }, [id, taskStatusStr]);

    React.useEffect(() => {
        if (elemRef.current && follow) {
            elemRef.current.scrollTop = elemRef.current.scrollHeight;
        }
    }, [log]);

    // Scroll to active match
    React.useEffect(() => {
        if (!searchQuery || !elemRef.current) return;
        const activeEl = elemRef.current.querySelector('.log-search-match.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [currentMatchIndex, searchQuery]);

    const escapeRegExp = (string: string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const totalMatches = React.useMemo(() => {
        if (!searchQuery) return 0;
        try {
            const matches = log.match(new RegExp(escapeRegExp(searchQuery), 'gi'));
            return matches ? matches.length : 0;
        } catch (e) {
            return 0;
        }
    }, [log, searchQuery]);

    const handlePrevMatch = () => {
        if (totalMatches === 0) return;
        setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
    };

    const handleNextMatch = () => {
        if (totalMatches === 0) return;
        setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                handlePrevMatch();
            } else {
                handleNextMatch();
            }
        } else if (e.key === 'Escape') {
            setShowSearch(false);
            setSearchQuery('');
            setCurrentMatchIndex(0);
        }
    };

    const getHighlightedLog = (text: string, search: string) => {
        if (!search) return text;
        
        let parts;
        try {
            parts = text.split(new RegExp(`(${escapeRegExp(search)})`, 'gi'));
        } catch (e) {
            return text;
        }

        let matchCounter = 0;
        return parts.map((part, index) => {
            if (part.toLowerCase() === search.toLowerCase()) {
                const isCurrent = matchCounter === currentMatchIndex;
                matchCounter++;
                return (
                    <mark 
                        key={index} 
                        className={`log-search-match ${isCurrent ? 'active' : ''}`}
                    >
                        {part}
                    </mark>
                );
            }
            return part;
        });
    };

    const loadFullLog = () => {
        // Load up to 50MB (50,000,000 bytes) and 1,000,000 lines
        pueueManager.pueue_log_subscription(id, true, { bytes: 50000000, lines: 1000000 })
            .then((data) => {
                setLog(''); // Clear current log to prevent duplicate content
                setLogDetails({
                    startSize: data[1],
                    endSize: data[2],
                    isTruncated: data[1] > 0,
                    loadedFull: true
                });
                pueueManager.observer.dispatchEvent(new PueueMessageEvent('onLogUpdated', data));
            });
    };

    const refresh = () => {
        setLog('');
        pueueManager.pueue_log_subscription(id, false);
        const options = logDetails.loadedFull ? { bytes: 50000000, lines: 1000000 } : {};
        pueueManager.pueue_log_subscription(id, true, options)
            .then((data) => {
                setLogDetails({
                    startSize: data[1],
                    endSize: data[2],
                    isTruncated: data[1] > 0,
                    loadedFull: logDetails.loadedFull
                });
                pueueManager.observer.dispatchEvent(new PueueMessageEvent('onLogUpdated', data));
            });
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(log || '')
            .then(() => {
                context.addAlert('Logs copiados para a área de transferência!', 'Copiado', 'success');
            })
            .catch((err) => {
                console.error('Failed to copy: ', err);
                context.addAlert('Não foi possível copiar os logs.', 'Erro', 'danger');
            });
    };

    return (
        <div className="log-view-container">
            <div className="log-header-actions">
                <span className="log-summary-text">Logs do Processo #{id}</span>
                <div className="log-action-buttons">
                    <Button variant='plain' size="sm" onClick={refresh} title="Recarregar Logs">
                        <RedoIcon style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}/>
                        Recarregar
                    </Button>
                    <Button variant='plain' size="sm" onClick={() => {
                        setShowSearch((s) => {
                            if (!s) {
                                setTimeout(() => searchInputRef.current?.focus(), 50);
                            } else {
                                setSearchQuery('');
                                setCurrentMatchIndex(0);
                            }
                            return !s;
                        });
                    }} className={showSearch ? "follow-active" : ""}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        Pesquisar
                    </Button>
                    <Button variant='plain' size="sm" onClick={() => setFollow((b) => !b)} className={follow ? "follow-active" : ""}>
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {follow ? "Seguindo" : "Seguir"}
                    </Button>
                    <Button variant='plain' size="sm" onClick={handleCopy} title="Copiar Logs">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copiar
                    </Button>
                    <Button variant='plain' size="sm" onClick={() => setIsCollapsed((c) => !c)}>
                        {isCollapsed ? (
                            <>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><polyline points="6 9 12 15 18 9"/></svg>
                                Expandir
                            </>
                        ) : (
                            <>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><polyline points="18 15 12 9 6 15"/></svg>
                                Recolher
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {showSearch && (
                <div className="log-search-bar glass-panel animate-fade-in">
                    <div className="log-search-input-wrapper">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="search-input-icon"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Pesquisar nos logs (Enter para próximo, Esc para fechar)..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentMatchIndex(0);
                            }}
                            onKeyDown={handleKeyDown}
                            className="log-search-input"
                        />
                        {searchQuery && (
                            <span className="log-search-matches-count">
                                {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : 'Sem resultados'}
                            </span>
                        )}
                    </div>
                    <div className="log-search-nav-buttons">
                        <button 
                            onClick={handlePrevMatch} 
                            disabled={totalMatches === 0} 
                            title="Resultado anterior"
                            className="log-search-nav-btn"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                        </button>
                        <button 
                            onClick={handleNextMatch} 
                            disabled={totalMatches === 0} 
                            title="Próximo resultado"
                            className="log-search-nav-btn"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <button 
                            onClick={() => {
                                setShowSearch(false);
                                setSearchQuery('');
                                setCurrentMatchIndex(0);
                            }} 
                            title="Fechar pesquisa"
                            className="log-search-nav-btn close-btn"
                        >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
            )}
            
            {logDetails.isTruncated && !logDetails.loadedFull && (
                <div className="log-truncated-warning glass-panel">
                    <span className="warning-icon">⚠️</span>
                    <span className="warning-text">
                        Exibindo os últimos {formatBytes(logDetails.endSize - logDetails.startSize)} do log (Tamanho total: {formatBytes(logDetails.endSize)}).
                    </span>
                    <Button variant="link" size="sm" onClick={loadFullLog} className="load-full-log-btn">
                        Carregar Log Completo (Até 50MB)
                    </Button>
                </div>
            )}

            <div ref={elemRef} className={`log-view ${isCollapsed ? 'collapsed' : 'expanded'}`}>
                <pre>{getHighlightedLog(log, searchQuery) || '(Sem registros no log)'}</pre>
            </div>
        </div>
    );
};

const Desc = (kv : any) => {
    const context = React.useContext(pueueContext);
    const horizon = !(kv.wrapOnSm && context.sm);

    return (
        <>
            <DescriptionListGroup>
                <DescriptionListTerm>{kv.name}</DescriptionListTerm>
                <DescriptionListDescription>{horizon && kv.children}</DescriptionListDescription>
            </DescriptionListGroup>
            {!horizon && kv.children}
        </>
    );
};

import styles from '@patternfly/react-styles/css/components/FormControl/form-control';
import { css } from '@patternfly/react-styles';

const TextArea = (prop: any) => {
    const ref = React.useRef<HTMLTextAreaElement | null>(null);
    React.useEffect(() => {
        ref.current?.style.setProperty('height', '0');
        ref.current?.style.setProperty('height', (ref.current?.scrollHeight + 1) + 'px');
    }, []);

    const handleChange = (e) => {
        ref.current?.style.setProperty('height', '0');
        ref.current?.style.setProperty('height', (ref.current?.scrollHeight + 1) + 'px');
        prop.onChange(e, e.currentTarget.value);
    };

    return (
    <span className={css(styles.formControl)}>
        <textarea onChange={handleChange} placeholder={prop.placeholder} value={prop.value} ref={ref} style={{fontFamily: 'monospace', resize: 'vertical'}} />
    </span>
    );
};

const getTaskStatusCategory = (task: PueueTask) => {
    if (!task || !task.status) return 'queued';
    
    const unfoldStatus = (s: any): string[] => {
        if (s && typeof s === 'object') {
            const key = Object.keys(s)[0];
            return key === 'Done' ? unfoldStatus(s[key]) : [key, ...unfoldStatus(s[key])];
        }
        return [String(s)];
    };
    
    const statusArray = unfoldStatus(task.status);
    if (statusArray.indexOf('Running') >= 0) return 'running';
    if (statusArray.indexOf('Success') >= 0) return 'success';
    if (statusArray.indexOf('Failed') >= 0 || statusArray.indexOf('Killed') >= 0 || statusArray.indexOf('DependencyFailed') >= 0) return 'failed';
    return 'queued';
};

const extractTimesFromStatus = (status: any) => {
    let start = '';
    let end = '';
    let enqueued = '';
    
    const traverse = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        
        if (obj.start) start = obj.start;
        if (obj.end) end = obj.end;
        if (obj.enqueued_at) enqueued = obj.enqueued_at;
        
        for (const key of Object.keys(obj)) {
            traverse(obj[key]);
        }
    };
    
    traverse(status);
    return { start, end, enqueued };
};

const getCleanStatusText = (status: any): string => {
    if (!status) return 'Queued';
    if (typeof status === 'object') {
        const key = Object.keys(status)[0];
        if (key === 'Done') {
            const doneObj = status[key];
            if (doneObj && typeof doneObj === 'object') {
                if (doneObj.result) {
                    if (typeof doneObj.result === 'object') {
                        return Object.keys(doneObj.result)[0] || 'Done';
                    }
                    return String(doneObj.result);
                }
            }
            return 'Done';
        }
        return key;
    }
    return String(status);
};

const getPortugueseStatusText = (status: any): string => {
    const cleanText = getCleanStatusText(status);
    switch (cleanText) {
        case 'Running':
            return 'Executando';
        case 'Queued':
            return 'Na Fila';
        case 'Paused':
            return 'Pausado';
        case 'Stashed':
            return 'Pausado (Stashed)';
        case 'Success':
            return 'Sucesso';
        case 'Failed':
            return 'Falhou';
        case 'Killed':
            return 'Interrompido';
        case 'DependencyFailed':
            return 'Dependência Falhou';
        default:
            return cleanText;
    }
};

const formatDuration = (startStr: string, endStr: string, isRunning: boolean): string => {
    if (!startStr) return '';
    const start = new Date(Date.parse(startStr));
    const end = endStr ? new Date(Date.parse(endStr)) : new Date();
    
    const diffMs = end.getTime() - start.getTime();
    if (isNaN(diffMs) || diffMs < 0) return '00:00:00';
    
    const diffSecs = Math.floor(diffMs / 1000);
    const hrs = Math.floor(diffSecs / 3600);
    const mins = Math.floor((diffSecs % 3600) / 60);
    const secs = diffSecs % 60;
    
    return [
        hrs.toString().padStart(2, '0'),
        mins.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0')
    ].join(':');
};

const PueueTaskCard = ({ 
    id, 
    group, 
    selectedTaskId, 
    selectedTab, 
    onToggleDetails 
} : { 
    id : string, 
    group : string,
    selectedTaskId : string | null,
    selectedTab : 'logs' | 'envs' | null,
    onToggleDetails : (id : string, tab : 'logs' | 'envs' | null) => void
}) => {
    const [ isEditable, setIsEditable ] = React.useState<boolean>(false);
    const [ showMetadata, setShowMetadata ] = React.useState<boolean>(false);
    const [ canDrag, setCanDrag ] = React.useState<boolean>(false);
    const [ elapsedTime, setElapsedTime ] = React.useState<string>('');

    const context = React.useContext(pueueContext);
    const task = context.tasks[id] || new PueueTask();
    const groupDetail = context.groups[group] || { status: 'Unknown', dir: '' };

    const [ form, setForm ] = React.useState<{
        label: string,
        command: string,
        deps: string,
        delay: string,
        dir: string,
    }>({
        label: task.label || "",
        command: task.command || "",
        deps: task.dependencies.join(",") || "",
        delay: "",
        dir: task.path || "",
    });

    React.useEffect(() => {
        if (isEditable) {
            setForm({
                label: task.label || "",
                command: task.command || "",
                deps: task.dependencies.join(",") || "",
                delay: "",
                dir: task.path || "",
            });
        }
    }, [isEditable, task]);

    const alertDone = (x : string) => context.addAlert(x, 'Done', 'success');

    const unfoldStatus = (s : any) => {
        if (s && typeof s == "object") {
            const key = Object.keys(s)[0];
            return key == 'Done' ? unfoldStatus(s[key]) : [key, ...unfoldStatus(s[key])];
        }
        else return [String(s)];
    };

    const statusArray = unfoldStatus(task.status);
    const statusText = getPortugueseStatusText(task.status);
    
    const statusColorClass = (
        statusArray.indexOf('Success') >= 0 ? 'status-success' :
        statusArray.indexOf('Running') >= 0 ? 'status-running' :
        statusArray.indexOf('Failed') >= 0 ? 'status-failed' :
        statusArray.indexOf('Killed') >= 0 ? 'status-failed' :
        statusArray.indexOf('DependencyFailed') >= 0 ? 'status-failed' :
        'status-queued'
    );

    const isRunning = statusArray.indexOf('Running') >= 0;

    React.useEffect(() => {
        const updateTimer = () => {
            const { start, end } = extractTimesFromStatus(task.status);
            if (start) {
                setElapsedTime(formatDuration(start, end, isRunning));
            } else {
                setElapsedTime('');
            }
        };

        updateTimer();

        const { start, end } = extractTimesFromStatus(task.status);
        if (isRunning && start && !end) {
            const interval = setInterval(updateTimer, 1000);
            return () => clearInterval(interval);
        }
    }, [task.status, isRunning]);

    const isReorderable = (
        statusArray.indexOf('Success') < 0 &&
        statusArray.indexOf('Failed') < 0 &&
        statusArray.indexOf('Killed') < 0 &&
        statusArray.indexOf('DependencyFailed') < 0 &&
        statusArray.indexOf('Running') < 0
    );

    const { start: startStr, end: endStr, enqueued: enqueuedStr } = extractTimesFromStatus(task.status);
    const dateStart = startStr ? new Date(Date.parse(startStr)) : null;
    const dateEnd = endStr ? new Date(Date.parse(endStr)) : null;
    const dateEnqueued = enqueuedStr ? new Date(Date.parse(enqueuedStr)) : null;

    const handleRestart = () => pueueManager.pueue('restart', {in_place: true}, [id]).then(alertDone).then(context.updateStatus);
    const handleKill = () => {
        context.showConfirm({
            title: "Parar Tarefa",
            message: `Tem certeza que deseja interromper a execução da tarefa #${id}?`,
            confirmText: "Parar Execução",
            cancelText: "Cancelar",
            onConfirm: () => {
                pueueManager.pueue('kill', {}, [id]).then(alertDone).then(context.updateStatus);
            }
        });
    };
    const handlePause = () => {
        context.showConfirm({
            title: "Pausar Tarefa",
            message: `Tem certeza que deseja pausar a tarefa #${id}?`,
            confirmText: "Pausar",
            cancelText: "Cancelar",
            onConfirm: () => {
                pueueManager.pueue('pause', {}, [id]).then(alertDone).then(context.updateStatus);
            }
        });
    };
    const handleStart = () => pueueManager.pueue('start', {}, [id]).then(alertDone).then(context.updateStatus);
    const handleRemove = () => {
        context.showConfirm({
            title: "Remover Tarefa",
            message: `Tem certeza que deseja remover a tarefa #${id}?`,
            confirmText: "Remover",
            cancelText: "Cancelar",
            onConfirm: () => {
                pueueManager.pueue('remove', {}, [id]).then(alertDone).then(context.updateStatus);
            }
        });
    };
    
    const handleSaveEdit = async () => {
        await pueueManager.pueue('restart', {in_place: true, stashed: true}, [id]).then(alertDone);
        await pueueManager.pueue_edit(id, {
            'command': form.command,
            'path': form.dir,
            'label': form.label,
        }).then(alertDone);
        await pueueManager.pueue('enqueue', form.delay ? {delay: form.delay} : {}, [id]).then(alertDone);
        setIsEditable(false);
        context.updateStatus();
    };

    const isSelectedEnvs = selectedTaskId === id && selectedTab === 'envs';
    const isSelectedLogs = selectedTaskId === id && selectedTab === 'logs';

    return (
        <Card 
            className={`task-card ${statusColorClass} glass-panel ${isEditable ? 'is-editing' : ''} ${selectedTaskId === id ? 'is-active' : ''}`}
            draggable={canDrag && isReorderable}
            onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', id);
                e.dataTransfer.effectAllowed = 'move';
                e.currentTarget.classList.add('is-dragging');
            }}
            onDragEnd={(e) => {
                e.currentTarget.classList.remove('is-dragging');
                setCanDrag(false);
            }}
            onDragOver={(e) => {
                if (isReorderable) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            }}
            onDragEnter={(e) => {
                if (isReorderable) {
                    e.currentTarget.classList.add('drag-over');
                }
            }}
            onDragLeave={(e) => {
                e.currentTarget.classList.remove('drag-over');
            }}
            onDrop={(e) => {
                e.currentTarget.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== id && isReorderable) {
                    pueueManager.pueue('switch', {}, [draggedId, id])
                        .then(() => {
                            context.addAlert(`Tarefa #${draggedId} trocada com #${id}`, 'Sucesso', 'success');
                            context.updateStatus();
                        })
                        .catch((err) => {
                            context.addAlert(`Erro ao reordenar: ${err.message || err}`, 'Erro', 'danger');
                        });
                }
            }}
        >
            <div className="task-card-header">
                <div className="task-header-row">
                    <div className="task-identity">
                        <span className="task-id">#{id}</span>
                        <span className="task-label-text">{task.label || '(Sem etiqueta)'}</span>
                    </div>
                    <div className="task-header-actions-grip">
                        {isReorderable && (
                            <button 
                                className="task-grip-handle" 
                                title="Segure e arraste para reordenar"
                                onMouseDown={() => setCanDrag(true)}
                                onMouseUp={() => setCanDrag(false)}
                                onTouchStart={() => setCanDrag(true)}
                                onTouchEnd={() => setCanDrag(false)}
                            >
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                    <path d="M8.5 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm7-12a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
                <div className="task-header-meta">
                    <span className={`task-status-tag ${statusColorClass}`}>{statusText}</span>
                    {elapsedTime && (
                        <span className="task-elapsed-time" title="Tempo de uso">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight: '4px', display: 'inline-block', verticalAlign: 'middle'}}>
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            <span style={{verticalAlign: 'middle'}}>{elapsedTime}</span>
                        </span>
                    )}
                </div>
            </div>

            <div className="task-card-body">
                {isEditable ? (
                    <Form isHorizontal={false} className="task-edit-form">
                        <FormGroup label="Etiqueta" fieldId={`edit-label-${id}`}>
                            <TextInput id={`edit-label-${id}`} value={form.label} onChange={(_, v) => setForm(f => ({ ...f, label: v }))} />
                        </FormGroup>
                        <FormGroup label="Dependências" fieldId={`edit-deps-${id}`}>
                            <TextInput id={`edit-deps-${id}`} value={form.deps} onChange={(_, v) => setForm(f => ({ ...f, deps: v }))} />
                        </FormGroup>
                        <FormGroup label="Comando" fieldId={`edit-command-${id}`} isRequired>
                            <TextInput id={`edit-command-${id}`} value={form.command} onChange={(_, v) => setForm(f => ({ ...f, command: v }))} isRequired />
                        </FormGroup>
                        <FormGroup label="Caminho (Diretório)" fieldId={`edit-dir-${id}`}>
                            <TextInput id={`edit-dir-${id}`} value={form.dir} onChange={(_, v) => setForm(f => ({ ...f, dir: v }))} />
                        </FormGroup>
                        <div className="edit-actions" style={{display: 'flex', gap: '8px', marginTop: '12px'}}>
                            <Button size="sm" onClick={handleSaveEdit}>Salvar</Button>
                            <Button size="sm" variant="secondary" onClick={() => setIsEditable(false)}>Cancelar</Button>
                        </div>
                    </Form>
                ) : (
                    <>
                        <div className="task-command-row">
                            <div className="task-command-block">
                                <code>{task.command}</code>
                            </div>
                            <Button 
                                variant="plain" 
                                className="task-meta-toggle-btn"
                                onClick={() => setShowMetadata(!showMetadata)}
                                title={showMetadata ? "Ocultar detalhes" : "Mostrar detalhes"}
                            >
                                <svg 
                                    viewBox="0 0 24 24" 
                                    width="16" 
                                    height="16" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2.5" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                    style={{ transform: showMetadata ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                                >
                                    <polyline points="6 9 12 15 18 9"/>
                                </svg>
                            </Button>
                        </div>

                        <div className={`task-metadata-wrapper ${showMetadata ? 'is-expanded' : ''}`}>
                            <div className="task-metadata-grid">
                                <div className="meta-item">
                                    <span className="meta-label">Diretório:</span>
                                    <span className="meta-value">{task.path}</span>
                                </div>
                                {task.dependencies && task.dependencies.length > 0 && (
                                    <div className="meta-item">
                                        <span className="meta-label">Dependências:</span>
                                        <span className="meta-value">
                                            {task.dependencies.map(depId => (
                                                <span key={depId} className="task-dep-pill">#{depId}</span>
                                            ))}
                                        </span>
                                    </div>
                                )}
                                {dateEnqueued && (
                                    <div className="meta-item">
                                        <span className="meta-label">Enfileirado em:</span>
                                        <span className="meta-value">{formatTime(dateEnqueued)}</span>
                                    </div>
                                )}
                                <div className="meta-item">
                                    <span className="meta-label">Duração:</span>
                                    <span className="meta-value">
                                        {formatTime(dateStart)} &rarr; {formatTime(dateEnd)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div className="task-card-footer">
                <div className="footer-left-buttons">
                    <Button 
                        variant={isSelectedLogs ? "primary" : "secondary"} 
                        size="sm" 
                        onClick={() => onToggleDetails(id, isSelectedLogs ? null : 'logs')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <span>Logs</span>
                        {isSelectedLogs ? (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}><polyline points="18 15 12 9 6 15"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}><polyline points="6 9 12 15 18 9"/></svg>
                        )}
                    </Button>
                    <Button 
                        variant={isSelectedEnvs ? "primary" : "secondary"} 
                        size="sm" 
                        onClick={() => onToggleDetails(id, isSelectedEnvs ? null : 'envs')}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                        <span>Envs</span>
                        {isSelectedEnvs ? (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}><polyline points="18 15 12 9 6 15"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{display: 'block'}}><polyline points="6 9 12 15 18 9"/></svg>
                        )}
                    </Button>
                </div>

                <div className="footer-right-actions">
                    <ActionList isIconList>
                        <ActionListItem>
                            <Button variant="plain" onClick={handleRestart} title="Reiniciar Tarefa"><RedoIcon/></Button>
                        </ActionListItem>
                        {statusArray.indexOf('Running') >= 0 && statusArray.indexOf('Paused') < 0 && (
                            <ActionListItem>
                                <Button variant="plain" onClick={handlePause} title="Pausar Tarefa">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{display: 'block'}}><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                                </Button>
                            </ActionListItem>
                        )}
                        {(statusArray.indexOf('Paused') >= 0 || statusArray.indexOf('Stashed') >= 0) && (
                            <ActionListItem>
                                <Button variant="plain" onClick={handleStart} title="Retomar Tarefa">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{display: 'block'}}><path d="M8 5v14l11-7z"/></svg>
                                </Button>
                            </ActionListItem>
                        )}
                        {statusArray.indexOf('Running') >= 0 && (
                            <ActionListItem>
                                <Button variant="plain" onClick={handleKill} title="Parar (Kill) Tarefa"><TimesIcon/></Button>
                            </ActionListItem>
                        )}
                        <ActionListItem>
                            <Button variant="plain" onClick={() => setIsEditable(true)} title="Editar Tarefa"><EditIcon/></Button>
                        </ActionListItem>
                        <ActionListItem>
                            <Button variant="plain" onClick={handleRemove} title="Excluir Tarefa"><TrashIcon/></Button>
                        </ActionListItem>
                    </ActionList>
                </div>
            </div>
        </Card>
    );
};

const TaskDetailsPanel = ({ id, group, tab, onClose, onTabChange } : { 
    id : string | null, 
    group : string, 
    tab : 'logs' | 'envs' | null, 
    onClose : () => void,
    onTabChange : (t : 'logs' | 'envs') => void
}) => {
    const context = React.useContext(pueueContext);
    const task = (id && context.tasks[id]) || new PueueTask();
    const [envs, setEnvs] = React.useState<{[v:string] : string}>({});
    const [isEnvCollapsed, setIsEnvCollapsed] = React.useState<boolean>(true);

    const taskStatusStr = JSON.stringify(task.status);

    React.useEffect(() => {
        if (id && tab === 'envs') {
            pueueManager.pueue('status', {json: true, group, __controller_remove_envs: false})
                .then((data) => {
                    if (data.tasks[id]) {
                        setEnvs(data.tasks[id].envs || {});
                    }
                });
        }
    }, [id, tab, group, taskStatusStr]);

    const handleCopyEnvs = () => {
        const envsText = Object.entries(envs).length > 0 
            ? Object.entries(envs).map(([k, v]) => `${k} = "${v}"`).join('\n')
            : "";
        navigator.clipboard.writeText(envsText)
            .then(() => {
                context.addAlert('Variáveis de ambiente copiadas!', 'Copiado', 'success');
            })
            .catch((err) => {
                console.error('Failed to copy envs: ', err);
                context.addAlert('Não foi possível copiar as variáveis.', 'Erro', 'danger');
            });
    };

    if (!id || !tab) {
        return (
            <div className="task-expanded-details-panel glass-panel placeholder-state">
                <div className="placeholder-content">
                    <svg className="placeholder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3" />
                        <path d="M8 7h8M8 12h8M8 17h6" />
                    </svg>
                    <div className="placeholder-text-wrapper">
                        <span className="placeholder-badge">Painel de Detalhes</span>
                        <h4>Selecione uma tarefa acima</h4>
                        <p>Clique nos botões de <strong>Logs</strong> ou <strong>Envs</strong> em qualquer tarefa para carregar seus detalhes nesta seção.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="task-expanded-details-panel glass-panel">
            <div className="panel-header">
                <div className="panel-title-section">
                    <span className="panel-label">Detalhes da Tarefa</span>
                    <h4 className="panel-task-title">#{id} - {task.label || '(Sem etiqueta)'}</h4>
                </div>
                <div className="panel-tabs">
                    <button 
                        className={`panel-tab-btn ${tab === 'logs' ? 'active' : ''}`}
                        onClick={() => onTabChange('logs')}
                    >
                        Logs de Execução
                    </button>
                    <button 
                        className={`panel-tab-btn ${tab === 'envs' ? 'active' : ''}`}
                        onClick={() => onTabChange('envs')}
                    >
                        Variáveis de Ambiente
                    </button>
                </div>
                <button className="panel-close-btn" onClick={onClose} title="Fechar Detalhes">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>

            <div className="panel-content">
                {tab === 'logs' && (
                    <LogView id={id} />
                )}
                {tab === 'envs' && (
                    <div className="envs-view-container">
                        <div className="envs-header-actions">
                            <span className="envs-summary-text">{Object.keys(envs).length} variáveis encontradas</span>
                            <div className="envs-action-buttons">
                                <Button variant="plain" size="sm" onClick={handleCopyEnvs} title="Copiar Variáveis">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    Copiar
                                </Button>
                                <Button variant="plain" size="sm" onClick={() => setIsEnvCollapsed(!isEnvCollapsed)}>
                                    {isEnvCollapsed ? (
                                        <>
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><polyline points="6 9 12 15 18 9"/></svg>
                                            Expandir
                                        </>
                                    ) : (
                                        <>
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}}><polyline points="18 15 12 9 6 15"/></svg>
                                            Recolher
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className={`envs-view ${isEnvCollapsed ? 'collapsed' : 'expanded'}`}>
                            <pre>
                                {Object.entries(envs).length > 0 
                                    ? Object.entries(envs).map(([k, v]) => `${k} = "${v}"`).join('\n')
                                    : "(Nenhuma variável de ambiente carregada)"
                                }
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const PueueGroupTable = ({ group, hash } : { group : string, hash : [string, string] }) => {
    const context = React.useContext(pueueContext);
    const groupDetail = context.groups[group] || { status: 'Unknown', dir: '' };

    const alertDone = (x : string) => context.addAlert(x, 'Done', 'success');

    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
    const [selectedTab, setSelectedTab] = React.useState<'logs' | 'envs' | null>(null);
    const detailsRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (selectedTaskId && selectedTab && detailsRef.current) {
            setTimeout(() => {
                detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }, [selectedTaskId, selectedTab]);

    const [modalForm, setModalForm] = React.useState({
        label: '',
        command: '',
        deps: '',
        delay: '',
        dir: ''
    });

    const handleAddTask = async () => {
        if (!modalForm.command.trim()) {
            context.addAlert('Por favor, insira o comando.', 'Erro', 'danger');
            return;
        }
        await pueueManager.pueue('add', {
            label: modalForm.label ? modalForm.label : null,
            after: modalForm.deps ? modalForm.deps.split(',') : [],
            delay: modalForm.delay ? modalForm.delay : null,
            group: group,
            working_directory: modalForm.dir || groupDetail.dir || context.cwd,
        }, [modalForm.command]).then(alertDone);
        setIsModalOpen(false);
        setModalForm({ label: '', command: '', deps: '', delay: '', dir: '' });
        context.updateStatus();
    };

    const groupTaskIds = Object.keys(context.tasks).filter(id => {
        const t = context.tasks[id];
        return t.group === group;
    });

    const totalCount = groupTaskIds.length;
    const runningCount = groupTaskIds.filter(id => getTaskStatusCategory(context.tasks[id]) === 'running').length;
    const successCount = groupTaskIds.filter(id => getTaskStatusCategory(context.tasks[id]) === 'success').length;
    const failedCount = groupTaskIds.filter(id => getTaskStatusCategory(context.tasks[id]) === 'failed').length;
    const queuedCount = groupTaskIds.filter(id => getTaskStatusCategory(context.tasks[id]) === 'queued').length;

    return (
        <div className="group-view-container">
            {/* Header com Hierarquia de Informação */}
            <div className="group-info-header glass-panel">
                <div className="group-header-left">
                    <span className="group-label">Fila de Execução</span>
                    <h3 className="group-name-title">{group}</h3>
                    <div className="group-status-wrapper">
                        <span className={`group-status-badge ${groupDetail.status.toLowerCase()}`}>
                            <span className="pulse-indicator"></span>
                            {groupDetail.status === 'Running' ? 'Ativa' : 'Pausada'}
                        </span>
                    </div>
                </div>

                <div className="group-stats-summary">
                    <div className="group-stat-pill">
                        <span className="stat-num">{totalCount}</span>
                        <span className="stat-label">Total</span>
                    </div>
                    <div className="group-stat-pill running">
                        <span className="stat-num">{runningCount}</span>
                        <span className="stat-label">Executando</span>
                    </div>
                    <div className="group-stat-pill queued">
                        <span className="stat-num">{queuedCount}</span>
                        <span className="stat-label">Fila</span>
                    </div>
                    <div className="group-stat-pill success">
                        <span className="stat-num">{successCount}</span>
                        <span className="stat-label">Sucesso</span>
                    </div>
                    <div className="group-stat-pill failed">
                        <span className="stat-num">{failedCount}</span>
                        <span className="stat-label">Falhas</span>
                    </div>
                </div>
                
                <div className="group-actions-section">
                    <Button 
                        variant="secondary" 
                        onClick={() => {
                            context.showConfirm({
                                title: "Limpar Fila",
                                message: `Tem certeza que deseja limpar todas as tarefas concluídas (com sucesso ou falhadas) do grupo "${group}"?`,
                                confirmText: "Limpar Fila",
                                cancelText: "Cancelar",
                                onConfirm: async () => {
                                    await pueueManager.pueue('clean', {group: group}).then(alertDone);
                                    context.updateStatus();
                                }
                            });
                        }}
                    >
                        Limpar Fila
                    </Button>
                    <Button variant="primary" className="add-task-btn-main" onClick={() => setIsModalOpen(true)}>
                        + Adicionar Tarefa
                    </Button>
                </div>
            </div>

            {/* Grid de Tarefas como Cards */}
            <div className="tasks-cards-grid">
                {groupTaskIds.length > 0 ? (
                    groupTaskIds.map((id) => (
                        <PueueTaskCard 
                            key={id} 
                            id={id} 
                            group={group} 
                            selectedTaskId={selectedTaskId}
                            selectedTab={selectedTab}
                            onToggleDetails={(tid, tabType) => {
                                if (tabType === null) {
                                    setSelectedTaskId(null);
                                    setSelectedTab(null);
                                } else {
                                    setSelectedTaskId(tid);
                                    setSelectedTab(tabType);
                                }
                            }}
                        />
                    ))
                ) : (
                    <div className="empty-tasks-state glass-panel">
                        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
                        <p>Nenhuma tarefa ativa neste grupo.</p>
                        <Button variant="secondary" onClick={() => setIsModalOpen(true)}>Adicionar Tarefa</Button>
                    </div>
                )}
            </div>

            {/* Expanded Task Details (Full Width below Grid) */}
            <div ref={detailsRef} className="task-details-wrapper">
                <TaskDetailsPanel 
                    id={selectedTaskId} 
                    group={group} 
                    tab={selectedTab} 
                    onClose={() => {
                        setSelectedTaskId(null);
                        setSelectedTab(null);
                    }}
                    onTabChange={(t) => setSelectedTab(t)}
                />
            </div>

            {/* Modal para Adicionar Tarefa */}
            <Modal
                title="Adicionar Nova Tarefa"
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                variant={ModalVariant.small}
                actions={[
                    <Button key="confirm" variant="primary" onClick={handleAddTask}>
                        Adicionar
                    </Button>,
                    <Button key="cancel" variant="link" onClick={() => setIsModalOpen(false)}>
                        Cancelar
                    </Button>
                ]}
            >
                <Form isHorizontal>
                    <FormGroup label="Etiqueta (Label)" fieldId="task-label">
                        <TextInput
                            id="task-label"
                            value={modalForm.label}
                            onChange={(_, v) => setModalForm(f => ({ ...f, label: v }))}
                            placeholder="ex: build-prod"
                        />
                    </FormGroup>
                    <FormGroup label="Comando" fieldId="task-command" isRequired>
                        <TextInput
                            id="task-command"
                            value={modalForm.command}
                            onChange={(_, v) => setModalForm(f => ({ ...f, command: v }))}
                            placeholder="ex: npm run build"
                            isRequired
                        />
                    </FormGroup>
                    <FormGroup label="Dependências" fieldId="task-deps" helperText="Separadas por vírgula (IDs)">
                        <TextInput
                            id="task-deps"
                            value={modalForm.deps}
                            onChange={(_, v) => setModalForm(f => ({ ...f, deps: v }))}
                            placeholder="ex: 1,2"
                        />
                    </FormGroup>
                    <FormGroup label="Atraso (Delay)" fieldId="task-delay" helperText="ex: 30s, 2h, 1d">
                        <TextInput
                            id="task-delay"
                            value={modalForm.delay}
                            onChange={(_, v) => setModalForm(f => ({ ...f, delay: v }))}
                            placeholder="ex: 5m"
                        />
                    </FormGroup>
                    <FormGroup label="Diretório de Trabalho" fieldId="task-dir">
                        <TextInput
                            id="task-dir"
                            value={modalForm.dir}
                            onChange={(_, v) => setModalForm(f => ({ ...f, dir: v }))}
                            placeholder={groupDetail.dir || context.cwd || "Caminho absoluto"}
                        />
                    </FormGroup>
                </Form>
            </Modal>
        </div>
    );
};

function isSmall() {
    return ['sm', 'default'].indexOf(getBreakpoint(window.innerWidth)) >= 0;
}

function getHashGroup() {
    const pair = decodeURIComponent(window.location.hash.substring(1)).split('/');
    return pair.length >= 1 ? pair[0] : '';
}

function getHashTask() {
    const pair = decodeURIComponent(window.location.hash.substring(1)).split('/');
    return pair.length >= 2 ? pair[1] : '';
}

function setLocationHash(hashGroup : string, hashTask : string = '') {
    window.location.hash = '#' + encodeURIComponent(hashGroup) + (hashTask.length > 0 ? '/' + encodeURIComponent(hashTask) : '');
}

export const PueueView = ({ 
    followGlobalDark, 
    children, 
    onLogout, 
    authEnabled 
} : { 
    followGlobalDark : boolean, 
    children : React.ReactNode, 
    onLogout?: () => void, 
    authEnabled?: boolean 
}) => {
    const [ currentGroup, setCurrentGroup ] = React.useState<string>('default');
    const [ groups, setGroups ] = React.useState<{[id : string] : PueueGroup}>({});
    const [ tasks, setTasks ] = React.useState<{[id : string] : PueueTask}>({});
    const [ meta, setMeta ] = React.useState<PueueMeta>({cwd: ''});
    const [ alerts, setAlerts ] = React.useState<{[id : string] : { id: number, title: string, body: string, variant: string }}>({counter: { id: 0, title: '', body: '', variant: ''}});
    const [ hash, setHash ] = React.useState<[string, string]>([getHashGroup(), getHashTask()]);

    // UI
    const [ dark, setDark ] = React.useState<boolean>(true);
    const [ sm, setSm ] = React.useState(isSmall());
    const [ currentView, setCurrentView ] = React.useState<'queue' | 'analytics' | 'docs'>('queue');
    const [ mobileSidebarOpen, setMobileSidebarOpen ] = React.useState<boolean>(false);
    const [ sidebarCollapsed, setSidebarCollapsed ] = React.useState<boolean>(false);
    const [ groupsSubmenuOpen, setGroupsSubmenuOpen ] = React.useState<boolean>(true);
    const [ confirmAction, setConfirmAction ] = React.useState<{
        title: string;
        message: string;
        confirmText: string;
        cancelText: string;
        onConfirm: () => void;
    } | null>(null);

    const currentContext = new PueueContext();
    currentContext.tasks = structuredClone(tasks);
    currentContext.groups = structuredClone(groups);
    currentContext.cwd = meta.cwd;
    currentContext.sm = sm;
    currentContext.showConfirm = (state) => setConfirmAction(state);

    currentContext.updateStatus = () => {
        Promise.all([
            pueueManager.pueue_webui_meta(),
            pueueManager.pueue('status', { json: true })
        ]).then(([metaData, statusData]) => {
            Object.keys(statusData.groups).forEach((k) => {
                statusData.groups[k].dir = metaData.groups && metaData.groups[k] && metaData.groups[k].dir ? metaData.groups[k].dir : '';
            });

            setMeta({cwd: metaData.cwd || ''});
            setGroups(statusData.groups);
            setTasks(statusData.tasks);
        });
    };

    currentContext.addAlert = (body, title, variant) => {
        setAlerts((a) => {
            const newAlerts = structuredClone(a);
            newAlerts[a.counter.id.toString()] = {
                id: a.counter.id,
                title: (title || 'Message'),
                body: (body || ''),
                variant: (variant || 'info')
            };
            newAlerts.counter.id += 1;
            console.log(newAlerts);
            return newAlerts;
        });
    };
    currentContext.removeAlert = (key) => {
        setAlerts((a) => {
            const newAlerts = {...a};
            delete newAlerts[key];
            return newAlerts;
        });
    };

    const switchGroup = (groupName : string) => {
        setCurrentGroup(groupName);
        if (getHashGroup() != groupName)
            setLocationHash(groupName);
    };

    const updateStatusDelayed = async () => { await timeout(100); currentContext.updateStatus(); };
    const addAlertOnError = (_e : Event) => {
        const e = _e as PueueMessageEvent;
        console.error(e);
        currentContext.addAlert(typeof e.data.data == 'string' ? e.data.data : JSON.stringify(e.data.data), e.data.message, 'warning');
    }

    React.useEffect(() => {
        currentContext.updateStatus();
        const onResize = ()=>setSm(isSmall());
        const onHashChange = ()=>setHash([getHashGroup(), getHashTask()]);
        window.addEventListener('resize', onResize);
        window.addEventListener('hashchange', onHashChange);
        return () => {
            window.removeEventListener('resize', onResize);
            window.removeEventListener('hashchange', onHashChange);
        }
    }, []);

    React.useEffect(() => {
        pueueManager.observer.addEventListener('onStatusUpdated', updateStatusDelayed);
        pueueManager.observer.addEventListener('onError', addAlertOnError);

        return () => {
            pueueManager.observer.removeEventListener('onStatusUpdated', updateStatusDelayed);
            pueueManager.observer.removeEventListener('onError', addAlertOnError);
        }
    });

    React.useEffect(() => {
        setTasks({});
        currentContext.updateStatus();
    }, [currentGroup]);

    React.useEffect(() => {
        const hashGroup = getHashGroup();
        console.log(hashGroup);
        if (hashGroup != currentGroup && groups[hashGroup] !== undefined)
            switchGroup(hashGroup);
    }, [hash, groups]);

    React.useEffect(() => {
        if (!followGlobalDark) {
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
            document.documentElement.className = dark ? 'pf-v5-theme-dark dark' : 'light';
        }
    }, [dark]);

    // Removida a barra de abas padrão do PatternFly. Utilizaremos o navegador de abas customizado.

    const OptionalCard = sm ? React.Fragment : Card;
    const OptionalCardBody = sm ? React.Fragment : CardBody;

    return (
    <PueueContextProvider value={currentContext}>
        <div className={`app-container ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            {/* Mobile Toggle Hamburger */}
            <button className="mobile-header-toggle" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>

            {/* Left Sidebar */}
            <aside className={`app-sidebar ${mobileSidebarOpen ? 'mobile-open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
                <div className={`sidebar-brand-wrapper ${sidebarCollapsed ? 'sidebar-brand-collapsed' : 'sidebar-brand-expanded'}`}>
                    <div className="brand-logo-container">
                        <img src="/lipai_01_preto 1.svg" alt="LIPAI Logo" className="sidebar-logo" />
                    </div>
                    
                    <div className={`sidebar-controls ${sidebarCollapsed ? 'sidebar-controls-collapsed' : 'sidebar-controls-expanded'}`}>
                        {/* Theme Toggler */}
                        {!followGlobalDark && (
                            <button 
                                className="icon-btn-only" 
                                onClick={() => setDark(!dark)} 
                                title={dark ? "Modo Claro" : "Modo Escuro"}
                            >
                                {dark ? (
                                    /* Sun Icon */
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                                ) : (
                                    /* Moon Icon */
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                                )}
                            </button>
                        )}
                        
                        {/* Collapse trigger */}
                        <button 
                            className="icon-btn-only" 
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            title={sidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
                        >
                            {sidebarCollapsed ? (
                                /* Angle Right */
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                            ) : (
                                /* Angle Left */
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                            )}
                        </button>
                    </div>
                </div>
                
                <nav className="sidebar-menu">
                    {!sidebarCollapsed && <span className="sitemap-label">Menu Principal</span>}
                    
                    {/* Fila de Tarefas */}
                    <button 
                        className={`menu-item ${currentView === 'queue' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('queue'); setMobileSidebarOpen(false); }}
                    >
                        <span className="menu-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        </span>
                        {!sidebarCollapsed && <span>Fila de Tarefas</span>}
                    </button>

                    {/* Métricas do Sistema */}
                    <button 
                        className={`menu-item ${currentView === 'analytics' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('analytics'); setMobileSidebarOpen(false); }}
                    >
                        <span className="menu-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                        </span>
                        {!sidebarCollapsed && <span>Métricas do Sistema</span>}
                    </button>

                    {/* Documentação */}
                    <button 
                        className={`menu-item ${currentView === 'docs' ? 'active' : ''}`}
                        onClick={() => { setCurrentView('docs'); setMobileSidebarOpen(false); }}
                    >
                        <span className="menu-icon">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5v-15z"/></svg>
                        </span>
                        {!sidebarCollapsed && <span>Documentação</span>}
                    </button>
                </nav>

                {authEnabled && onLogout && (
                    <div className="sidebar-footer">
                        <button className="menu-item logout-item" onClick={onLogout}>
                            <span className="menu-icon">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            </span>
                            {!sidebarCollapsed && <span>Sair</span>}
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Content Area */}
            <main className="app-content">
                {currentView === 'queue' && (
                    <>
                        {/* Center Colored Logo in Hero Banner */}
                        <div className="hero-banner glass-panel">
                            <div className="hero-content">
                                <div className="hero-logo-wrapper">
                                    <img src="/lipai_01_cor.png" alt="LIPAI Logo" className="hero-logo" />
                                </div>
                                <div className="hero-text">
                                    <h2>LIPAI</h2>
                                    <p>Laboratório Interdisciplinar de Processamento e Análise de Imagens</p>
                                </div>
                            </div>
                        </div>

                        {children}
                        
                        <div className="groups-container">
                            <div className="groups-nav-tabs-wrapper glass-panel">
                                {Object.keys(groups).map((groupName) => {
                                    const isActive = currentGroup === groupName;
                                    const count = Object.values(tasks).filter((t) => t.group === groupName).length;
                                    return (
                                        <button
                                            key={groupName}
                                            className={`group-nav-tab ${isActive ? 'active' : ''}`}
                                            onClick={() => switchGroup(groupName)}
                                        >
                                            <span className="group-nav-name">{groupName}</span>
                                            {count > 0 && <span className="group-nav-count">{count}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="group-content-area">
                                {groups[currentGroup] && <PueueGroupTable key={currentGroup} group={currentGroup} hash={hash} />}
                            </div>
                        </div>
                    </>
                )}
                {currentView === 'analytics' && <AnalyticsView />}
                {currentView === 'docs' && <DocsView />}
            </main>
        </div>

        <AlertGroup isToast key='alerts'>
        {
            Object.entries(alerts).map(([key, x]) => key == 'counter' ?
                <React.Fragment key={key}></React.Fragment> :
                <Alert key={key} variant={x.variant as any} title={x.title} timeout={5000}
                    style={{whiteSpace: 'pre-wrap'}}
                    onTimeout={currentContext.removeAlert.bind(null, key)}
                    actionClose={<AlertActionCloseButton onClose={currentContext.removeAlert.bind(null, key)}/>}
                >{x.body}</Alert>)
        }
        </AlertGroup>

        {confirmAction && (
            <div className="confirm-modal-overlay">
                <div className="confirm-modal-box glass-panel">
                    <div className="confirm-modal-header">
                        <h3>{confirmAction.title}</h3>
                    </div>
                    <div className="confirm-modal-body">
                        <p>{confirmAction.message}</p>
                    </div>
                    <div className="confirm-modal-footer">
                        <Button variant="secondary" onClick={() => setConfirmAction(null)} className="cancel-btn">
                            {confirmAction.cancelText}
                        </Button>
                        <Button variant="danger" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }} className="confirm-btn">
                            {confirmAction.confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        )}
    </PueueContextProvider>
    );
}

