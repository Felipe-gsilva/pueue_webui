import React from 'react';
import { Card, CardBody, CardTitle, TextInput, Button } from '@patternfly/react-core';
import { SearchIcon, SyncIcon } from '@patternfly/react-icons';
import { pueueManager } from '../pueue-manager';

export const AnalyticsView: React.FC = () => {
    const [stats, setStats] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [procSearch, setProcSearch] = React.useState('');
    const [refreshInterval, setRefreshInterval] = React.useState(1500); // 1.5 seconds default

    const [sortBy, setSortBy] = React.useState<'pid' | 'name' | 'cpu' | 'memory' | 'gpu_util' | 'gpu_vram'>('cpu');
    const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc');
    const [colWidths, setColWidths] = React.useState<{[key: string]: number}>({
        pid: 80,
        name: 220,
        cpu: 100,
        memory: 100,
        gpu_util: 100,
        gpu_vram: 120
    });

    const startResize = (e: React.MouseEvent, colKey: string) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = colWidths[colKey];

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const newWidth = Math.max(50, startWidth + deltaX);
            setColWidths(prev => ({
                ...prev,
                [colKey]: newWidth
            }));
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleSort = (field: 'pid' | 'name' | 'cpu' | 'memory' | 'gpu_util' | 'gpu_vram') => {
        if (sortBy === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('desc');
        }
    };

    const fetchStats = async () => {
        try {
            const data = await pueueManager.get_system_stats();
            if (data) {
                setStats(data);
                setError('');
            }
        } catch (err) {
            console.error('Error fetching system stats:', err);
            setError('Falha ao conectar com o monitor do sistema.');
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, refreshInterval);
        return () => clearInterval(interval);
    }, [refreshInterval]);

    const { cpu, memory, temperatures, gpus, processes } = stats || {
        cpu: { percent: 0, per_cpu: [] },
        memory: { total: 0, available: 0, used: 0, percent: 0, free: 0 },
        temperatures: {},
        gpus: [],
        processes: []
    };

    const formatBytes = (bytes: number, decimals = 1) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const getTempClass = (temp: number) => {
        if (temp < 60) return 'temp-good';
        if (temp < 80) return 'temp-warn';
        return 'temp-danger';
    };

    const filteredProcesses = processes.filter((p: any) =>
        p.name.toLowerCase().includes(procSearch.toLowerCase()) ||
        p.pid.toString().includes(procSearch)
    );

    const sortedProcesses = React.useMemo(() => {
        return [...filteredProcesses].sort((a: any, b: any) => {
            let valA = a[sortBy] !== undefined ? a[sortBy] : 0;
            let valB = b[sortBy] !== undefined ? b[sortBy] : 0;

            if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredProcesses, sortBy, sortDir]);

    if (loading && !stats) {
        return (
            <div className="analytics-loading">
                <div className="spinner"></div>
                <p>Carregando métricas do sistema...</p>
            </div>
        );
    }

    if (error && !stats) {
        return (
            <div className="analytics-error">
                <p className="error-text">{error}</p>
                <Button variant="primary" onClick={fetchStats} icon={<SyncIcon />}>
                    Tentar Novamente
                </Button>
            </div>
        );
    };

    return (
        <div className="analytics-dashboard">
            <div className="dashboard-header">
                <h2>Métricas do Sistema</h2>
                <div className="refresh-control">
                    <span>Atualização: </span>
                    <select
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="styled-select"
                    >
                        <option value={1000}>1s</option>
                        <option value={1500}>1.5s</option>
                        <option value={3000}>3s</option>
                        <option value={5000}>5s</option>
                    </select>
                </div>
            </div>

            <div className="analytics-grid">
                {/* CPU Usage Card */}
                <Card className="dashboard-card glass-panel">
                    <CardTitle className="card-header-styled">CPU</CardTitle>
                    <CardBody className="card-body-layout">
                        <div className="cpu-radial-container">
                            <div className="radial-progress" style={{ '--percentage': cpu.percent } as any}>
                                <div className="radial-inner">
                                    <span className="radial-value">{cpu.percent.toFixed(0)}%</span>
                                    <span className="radial-label">Total</span>
                                </div>
                            </div>
                        </div>

                        {cpu.per_cpu && cpu.per_cpu.length > 0 && (
                            <div className="cores-grid">
                                {cpu.per_cpu.map((cPercent: number, idx: number) => (
                                    <div key={idx} className="core-bar-wrapper">
                                        <div className="core-label">Core {idx}</div>
                                        <div className="core-track">
                                            <div 
                                                className="core-fill" 
                                                style={{ width: `${cPercent}%`, backgroundColor: cPercent > 80 ? 'var(--accent-red)' : 'var(--accent-purple)' }}
                                            ></div>
                                        </div>
                                        <div className="core-value">{cPercent.toFixed(0)}%</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardBody>
                </Card>

                {/* RAM Usage Card */}
                <Card className="dashboard-card glass-panel">
                    <CardTitle className="card-header-styled">Memória RAM</CardTitle>
                    <CardBody className="card-body-layout">
                        <div className="memory-info-header">
                            <div className="mem-value-large">
                                {formatBytes(memory.used)}
                                <span className="mem-total"> / {formatBytes(memory.total)}</span>
                            </div>
                            <div className="mem-percent-badge">{memory.percent.toFixed(0)}%</div>
                        </div>

                        <div className="mem-progress-track">
                            <div 
                                className="mem-progress-fill" 
                                style={{ width: `${memory.percent}%` }}
                            ></div>
                        </div>

                        <div className="memory-stats-grid">
                            <div className="mem-stat-item">
                                <span className="stat-label">Disponível</span>
                                <span className="stat-value">{formatBytes(memory.available)}</span>
                            </div>
                            <div className="mem-stat-item">
                                <span className="stat-label">Livre</span>
                                <span className="stat-value">{formatBytes(memory.free)}</span>
                            </div>
                        </div>
                    </CardBody>
                </Card>

                {/* Temperature Card */}
                <Card className="dashboard-card glass-panel">
                    <CardTitle className="card-header-styled">Temperaturas</CardTitle>
                    <CardBody className="card-body-layout">
                        <div className="temp-list">
                            {Object.entries(temperatures).map(([category, entries]: [string, any]) => (
                                <div key={category} className="temp-category-group">
                                    <div className="category-title">{category.toUpperCase()}</div>
                                    {entries.map((item: any, idx: number) => (
                                        <div key={idx} className="temp-item">
                                            <span className="temp-label">{item.label}</span>
                                            <span className={`temp-value ${getTempClass(item.current)}`}>
                                                {item.current.toFixed(1)}°C
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                            {Object.keys(temperatures).length === 0 && (
                                <div className="no-data-msg">Nenhum sensor de temperatura detectado.</div>
                            )}
                        </div>
                    </CardBody>
                </Card>

                {/* NVIDIA GPUs Card */}
                {gpus && gpus.length > 0 && gpus.map((gpu: any, idx: number) => (
                    <Card key={idx} className="dashboard-card glass-panel gpu-card">
                        <CardTitle className="card-header-styled">GPU: {gpu.name}</CardTitle>
                        <CardBody className="card-body-layout">
                            <div className="gpu-grid-metrics">
                                <div className="gpu-metric-dial">
                                    <div className="metric-circle" style={{ '--percentage': gpu.utilization } as any}>
                                        <span className="val">{gpu.utilization.toFixed(0)}%</span>
                                        <span className="lbl">Uso GPU</span>
                                    </div>
                                </div>

                                <div className="gpu-details-col">
                                    <div className="gpu-detail-row">
                                        <span className="label">VRAM Utilizada</span>
                                        <span className="value">
                                            {gpu.memory_used.toFixed(0)}MB / {gpu.memory_total.toFixed(0)}MB
                                        </span>
                                    </div>
                                    <div className="gpu-vram-track">
                                        <div 
                                            className="gpu-vram-fill" 
                                            style={{ width: `${(gpu.memory_used / gpu.memory_total) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="gpu-detail-row mt-3">
                                        <span className="label">Temperatura</span>
                                        <span className={`value font-bold ${getTempClass(gpu.temperature)}`}>
                                            {gpu.temperature}°C
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>

            <Card className="dashboard-card glass-panel processes-card">
                <CardTitle className="card-header-styled processes-header">
                    <h3>Processos Ativos</h3>
                    <div className="proc-search-wrapper">
                        <span className="search-icon"><SearchIcon /></span>
                        <TextInput
                            value={procSearch}
                            onChange={(_, v) => setProcSearch(v)}
                            placeholder="Filtrar por nome ou PID..."
                            className="proc-search-input"
                        />
                    </div>
                </CardTitle>
                <CardBody className="processes-body">
                    <div className="table-responsive">
                        <table className="styled-table table-fixed-layout">
                            <thead>
                                <tr>
                                    <th style={{ width: colWidths.pid }}>
                                        <div className="th-content" onClick={() => handleSort('pid')}>
                                            <span>PID</span>
                                            {sortBy === 'pid' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                        </div>
                                        <div className="column-resizer" onMouseDown={(e) => startResize(e, 'pid')} />
                                    </th>
                                    <th style={{ width: colWidths.name }}>
                                        <div className="th-content" onClick={() => handleSort('name')}>
                                            <span>Nome</span>
                                            {sortBy === 'name' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                        </div>
                                        <div className="column-resizer" onMouseDown={(e) => startResize(e, 'name')} />
                                    </th>
                                    <th style={{ width: colWidths.cpu }} className="text-right">
                                        <div className="th-content justify-end" onClick={() => handleSort('cpu')}>
                                            <span>CPU</span>
                                            {sortBy === 'cpu' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                        </div>
                                        <div className="column-resizer" onMouseDown={(e) => startResize(e, 'cpu')} />
                                    </th>
                                    <th style={{ width: colWidths.memory }} className="text-right">
                                        <div className="th-content justify-end" onClick={() => handleSort('memory')}>
                                            <span>RAM</span>
                                            {sortBy === 'memory' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                        </div>
                                        <div className="column-resizer" onMouseDown={(e) => startResize(e, 'memory')} />
                                    </th>
                                    <th style={{ width: colWidths.gpu_util }} className="text-right">
                                        <div className="th-content justify-end" onClick={() => handleSort('gpu_util')}>
                                            <span>GPU</span>
                                            {sortBy === 'gpu_util' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                        </div>
                                        <div className="column-resizer" onMouseDown={(e) => startResize(e, 'gpu_util')} />
                                    </th>
                                    <th style={{ width: colWidths.gpu_vram }} className="text-right">
                                        <div className="th-content justify-end" onClick={() => handleSort('gpu_vram')}>
                                            <span>VRAM</span>
                                            {sortBy === 'gpu_vram' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                                        </div>
                                        <div className="column-resizer" onMouseDown={(e) => startResize(e, 'gpu_vram')} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedProcesses.map((p: any) => (
                                    <tr key={p.pid}>
                                        <td className="pid-cell">{p.pid}</td>
                                        <td className="name-cell" title={p.name}>{p.name}</td>
                                        <td className="text-right cpu-cell">{p.cpu.toFixed(1)}%</td>
                                        <td className="text-right mem-cell">{p.memory.toFixed(1)}%</td>
                                        <td className="text-right gpu-util-cell">{(p.gpu_util !== undefined ? p.gpu_util : 0).toFixed(0)}%</td>
                                        <td className="text-right gpu-vram-cell">{(p.gpu_vram !== undefined ? p.gpu_vram : 0).toFixed(0)} MB</td>
                                    </tr>
                                ))}
                                {sortedProcesses.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center no-records">
                                            Nenhum processo correspondente.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};
