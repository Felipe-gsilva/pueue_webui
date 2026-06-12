import React from 'react';
import { Card, CardBody, Button } from '@patternfly/react-core';

// Custom lightweight Markdown renderer to keep standard vanilla logic without heavy dependencies
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    const lines = content.split('\n');
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLang = '';
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
        // Code blocks
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                inCodeBlock = false;
                elements.push(
                    <pre key={`code-${index}`} className="doc-code-block">
                        <code>{codeContent.join('\n')}</code>
                    </pre>
                );
                codeContent = [];
            } else {
                inCodeBlock = true;
                codeLang = line.replace('```', '').trim();
            }
            return;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            return;
        }

        // Headings
        if (line.startsWith('# ')) {
            elements.push(<h1 key={index} className="doc-h1">{parseInline(line.substring(2))}</h1>);
            return;
        }
        if (line.startsWith('## ')) {
            elements.push(<h2 key={index} className="doc-h2">{parseInline(line.substring(3))}</h2>);
            return;
        }
        if (line.startsWith('### ')) {
            elements.push(<h3 key={index} className="doc-h3">{parseInline(line.substring(4))}</h3>);
            return;
        }

        // Bullet lists
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            elements.push(
                <li key={index} className="doc-li">
                    {parseInline(line.trim().substring(2))}
                </li>
            );
            return;
        }

        // Blockquotes
        if (line.trim().startsWith('> ')) {
            elements.push(
                <blockquote key={index} className="doc-blockquote">
                    {parseInline(line.trim().substring(2))}
                </blockquote>
            );
            return;
        }

        // Empty line
        if (!line.trim()) {
            elements.push(<div key={index} style={{ height: '12px' }} />);
            return;
        }

        // Normal paragraph
        elements.push(<p key={index} className="doc-paragraph">{parseInline(line)}</p>);
    });

    return <div className="doc-markdown-body">{elements}</div>;
};

// Helper for bold, italic, code tags, and links
function parseInline(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let current = text;
    let keyIdx = 0;

    while (current.length > 0) {
        // Bold and Italic (***text***)
        const boldItalicMatch = current.match(/^\*\*\*([^*]+)\*\*\*/);
        if (boldItalicMatch) {
            parts.push(<strong key={keyIdx++}><em>{boldItalicMatch[1]}</em></strong>);
            current = current.substring(boldItalicMatch[0].length);
            continue;
        }

        // Bold (**text**)
        const boldMatch = current.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
            parts.push(<strong key={keyIdx++}>{boldMatch[1]}</strong>);
            current = current.substring(boldMatch[0].length);
            continue;
        }

        // Italic (*text*)
        const italicMatch = current.match(/^\*([^*]+)\*/);
        if (italicMatch) {
            parts.push(<em key={keyIdx++}>{italicMatch[1]}</em>);
            current = current.substring(italicMatch[0].length);
            continue;
        }

        // Code block (`text`)
        const codeMatch = current.match(/^`([^`]+)`/);
        if (codeMatch) {
            parts.push(<code key={keyIdx++} className="doc-inline-code">{codeMatch[1]}</code>);
            current = current.substring(codeMatch[0].length);
            continue;
        }

        // Links ([label](url))
        const linkMatch = current.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
            parts.push(<a key={keyIdx++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="doc-link">{linkMatch[1]}</a>);
            current = current.substring(linkMatch[0].length);
            continue;
        }

        // Plain text up to next marker
        const nextMarker = current.search(/\*\*\*|\*\*|\*|`|\[/);
        if (nextMarker === -1) {
            parts.push(current);
            break;
        } else if (nextMarker === 0) {
            // Unhandled marker (treat as plain text for 1 char to avoid infinite loop)
            parts.push(current[0]);
            current = current.substring(1);
        } else {
            parts.push(current.substring(0, nextMarker));
            current = current.substring(nextMarker);
        }
    }
    return parts;
}

const docTopics = {
    intro: {
        title: "Sobre o LIPAI & G-Pueue",
        markdown: `# Laboratório LIPAI & G-Pueue

Bem-vindo ao portal **G-Pueue**, o dashboard de gerenciamento de processos e filas do **LIPAI** (Laboratório Interdisciplinar de Processamento e Análise de Imagens).

Este projeto visa facilitar o monitoramento e escalonamento de experimentos computacionais de processamento de imagens, visão computacional e aprendizado profundo (Deep Learning) executados em nossos servidores acadêmicos.

## Visão Geral
* **Gerenciador de Fila**: Baseado no robusto motor CLI [Pueue](https://github.com/nuki12/pueue), permitindo empilhar processos sequenciais ou paralelos sem sobrecarregar a memória e GPU do host.
* **Monitor do Sistema**: Mapeia em tempo real o uso de **CPU, Memória RAM, GPUs NVIDIA (VRAM e Temperatura)** e processos que mais consomem processamento.
 
`
    },
    pueue: {
        title: "Comandos do Pueue",
        markdown: `# Comandos e Funcionamento do Pueue

O Pueue gerencia comandos em segundo plano a partir de grupos de filas definidos. Aqui estão os comandos principais caso você queira interagir via terminal:

## Principais Comandos CLI
* \`pueue add "comando"\`: Adiciona uma tarefa à fila padrão.
* \`pueue status\`: Mostra o status atual das tarefas e grupos.
* \`pueue start\`: Retoma o processamento das tarefas na fila.
* \`pueue pause\`: Pausa a execução de novas tarefas na fila.
* \`pueue clean\`: Limpa todas as tarefas finalizadas com sucesso.
* \`pueue restart <id>\`: Reinicia uma tarefa finalizada ou falhada.
* \`pueue kill <id>\`: Interrompe a execução de uma tarefa ativa.
* \`pueue follow <id>\`: Segue o log do processo.
`
    },
    vpn: {
        title: "Segurança & Acesso VPN",
        markdown: `# Configuração de Segurança e Acesso VPN

Este portal foi desenvolvido para rodar de forma **self-hosted**, fechado de forma segura dentro de uma **VPN** acadêmica (ou túnel SSH/Wireguard). Não há necessidade de logins complexos, apenas uma autenticação por senha unificada.

## Hospedagem e Bind de Interfaces
Para garantir que o portal não seja exposto diretamente na internet pública, configure o servidor para responder apenas à rede interna da VPN:

\`\`\`bash
# Executando preso à interface de rede local (ex: Wireguard wg0)
uv run main.py --address 10.0.0.1 --port 9092
\`\`\`

## Proteção por Senha
Defina uma senha de acesso configurando a variável de ambiente:

\`\`\`bash
export PUEUE_WEBUI_PASSWORD="sua-senha-super-segura"
uv run main.py
\`\`\`

Qualquer conexão WebSocket sem token de sessão válido será rejeitada automaticamente com o código de erro JSON-RPC \`32002\` (Unauthorized).
`
    },
    dashboard: {
        title: "Manual do Dashboard",
        markdown: `# Guia de Uso do Dashboard

Aqui você encontra o manual de operações disponíveis na interface visual e as regras de segurança aplicadas à interface compartilhada:

## Painel de Filas (Queue)
* **Start / Pause**: Controla o estado de processamento de tarefas do grupo selecionado.
* **Adicionar Tarefa**: Permite adicionar novas tarefas à fila de execução informando etiqueta, comando, diretório de trabalho, atraso e dependências.
* **Editar Tarefa**: Permite modificar apenas a etiqueta (label) e as dependências (dependencies) da tarefa. Por segurança na interface compartilhada, não é permitido alterar o comando ou o diretório de trabalho após a criação.
* **Reiniciar Tarefa**: Permite reiniciar tarefas concluídas ou falhadas diretamente pela UI. Caso a tarefa ainda esteja em execução (Executando), clicar neste botão exibirá o comando de terminal correspondente (\`pueue restart --in-place <id>\`) para você copiar e executar manualmente.
* **Excluir Tarefa**: A exclusão direta de tarefas pela interface está desativada por segurança. Ao tentar excluir, a interface exibirá o comando de terminal correspondente (\`pueue remove <id>\`) para você copiar e rodar em seu terminal.
* **Visualizar Variáveis**: Exibe as variáveis de ambiente com as quais o processo foi iniciado. Você pode colapsar ou recolher este bloco a qualquer momento.
* **Logs em Tempo Real**: Visualize a saída padrão do processo. A janela de logs por padrão inicia colapsada para despoluir a visualização, suporta scroll automático (botão *Seguindo*) e pode ser expandida ou colapsada.

## Métricas do Sistema
* O painel exibe gráficos em tempo real de hardware, incluindo as temperaturas de GPU e a tabela de processos ordenados pelo consumo atual de CPU.
`
    }
};

export const DocsView: React.FC = () => {
    const [selectedTopic, setSelectedTopic] = React.useState<keyof typeof docTopics>('intro');

    return (
        <div className="docs-layout">
            <div className="docs-header">
                <h2>Documentação & Ajuda</h2>
            </div>
            
            <div className="docs-container">
                <aside className="docs-nav-sidebar glass-panel">
                    <span className="docs-section-title">Tópicos</span>
                    <div className="docs-nav-menu">
                        {Object.entries(docTopics).map(([key, value]) => (
                            <button
                                key={key}
                                className={`docs-nav-item ${selectedTopic === key ? 'active' : ''}`}
                                onClick={() => setSelectedTopic(key as any)}
                            >
                                {value.title}
                            </button>
                        ))}
                    </div>
                </aside>
                
                <main className="docs-content-pane glass-panel">
                    <Card style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}>
                        <CardBody style={{ padding: 0 }}>
                            <MarkdownRenderer content={docTopics[selectedTopic].markdown} />
                        </CardBody>
                    </Card>
                </main>
            </div>
        </div>
    );
};
