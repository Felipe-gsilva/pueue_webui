#!/bin/bash
set -e

echo "🚀 Iniciando a instalação e configuração do Pueue + Systemd..."

# Função para instalar dependências do sistema caso estejam faltando
install_system_dep() {
    local pkg_debian=$1
    local pkg_arch=$2
    local cmd=$3

    if ! command -v "$cmd" &> /dev/null; then
        echo "🔍 '$cmd' não encontrado. Tentando instalar dependência do sistema..."
        if command -v apt-get &> /dev/null; then
            echo "📦 Usando apt-get para instalar $pkg_debian (solicitando sudo)..."
            sudo apt-get update && sudo apt-get install -y $pkg_debian
        elif command -v pacman &> /dev/null; then
            echo "📦 Usando pacman para instalar $pkg_arch (solicitando sudo)..."
            sudo pacman -S --needed --noconfirm $pkg_arch
        else
            echo "❌ Gerenciador de pacotes compatível (apt ou pacman) não encontrado."
            echo "Por favor, instale '$cmd' manualmente e execute o script novamente."
            exit 1
        fi
    fi
}

# 1. Instalar dependências básicas de sistema
install_system_dep "curl" "curl" "curl"
install_system_dep "python3 python3-venv" "python" "python3"
install_system_dep "nodejs npm" "nodejs npm" "node"
# também vou instalar thermald e já rodar no final
install_system_dep "thermald"

# 2. Configurar o PATH no .bashrc se necessário
if [[ ":$PATH:" != *":$HOME/.cargo/bin:"* ]]; then
    echo "📝 Adicionando ~/.cargo/bin ao seu PATH no ~/.bashrc..."
    echo 'export PATH="$PATH:$HOME/.cargo/bin"' >> ~/.bashrc
    export PATH="$PATH:$HOME/.cargo/bin"
fi

if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    echo "📝 Adicionando ~/.local/bin ao seu PATH no ~/.bashrc..."
    echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.bashrc
    export PATH="$PATH:$HOME/.local/bin"
fi

# 3. Instalar o websocketd caso não esteja no sistema
if ! command -v websocketd &> /dev/null; then
    echo "🔍 'websocketd' não encontrado. Instalando versão pré-compilada do GitHub..."
    mkdir -p "$HOME/.local/bin"
    
    ARCH=$(uname -m)
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    
    if [ "$ARCH" = "x86_64" ]; then
        WS_ARCH="amd64"
    elif [[ "$ARCH" == *"arm"* || "$ARCH" == "aarch64" ]]; then
        WS_ARCH="arm"
    else
        echo "❌ Arquitetura $ARCH não suportada automaticamente para o websocketd."
        echo "Por favor, instale o websocketd manualmente."
        exit 1
    fi
    
    WS_VERSION="0.4.1"
    WS_URL="https://github.com/joewalnes/websocketd/releases/download/v${WS_VERSION}/websocketd-${WS_VERSION}-${OS}_${WS_ARCH}.zip"
    
    echo "📥 Baixando de: $WS_URL"
    TMP_DIR=$(mktemp -d)
    curl -LsSf "$WS_URL" -o "$TMP_DIR/websocketd.zip"
    
    # Garantir que temos unzip instalado para descompactar o binário
    install_system_dep "unzip" "unzip" "unzip"
    
    unzip -q "$TMP_DIR/websocketd.zip" -d "$TMP_DIR"
    mv "$TMP_DIR/websocketd" "$HOME/.local/bin/"
    chmod +x "$HOME/.local/bin/websocketd"
    rm -rf "$TMP_DIR"
    
    echo "✨ 'websocketd' instalado em ~/.local/bin/websocketd"
fi

# 4. Instalar o Pueue se não estiver instalado
if ! command -v pueue &> /dev/null || ! command -v pueued &> /dev/null; then
    echo "🔍 'pueue' ou 'pueued' não encontrado. Iniciando instalação..."
    if command -v pacman &> /dev/null; then
        echo "📦 Instalando pueue via pacman (Arch Linux)..."
        sudo pacman -S --needed --noconfirm pueue
    else
        install_system_dep "cargo" "rust" "cargo"
        echo "📦 Instalando pueue via Cargo (Debian/Outros)..."
        cargo install --locked pueue
    fi
else
    echo "✨ Pueue já está instalado."
fi

# 5. Criar a estrutura e o arquivo do serviço Systemd
mkdir -p ~/.config/systemd/user/

# Verifica se o binário foi instalado via pacman (/usr/bin/pueued) ou via cargo (~/.cargo/bin/pueued)
PUEUED_BIN=$(command -v pueued)
if [ -z "$PUEUED_BIN" ]; then
    PUEUED_BIN="$HOME/.cargo/bin/pueued"
fi

cat << EOF > ~/.config/systemd/user/pueued.service
[Unit]
Description=Pueue Daemon - CLI process scheduler and manager
After=network.target

[Service]
Type=simple
ExecStart=$PUEUED_BIN
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

# 6. Parar qualquer processo antigo e recarregar o systemd
systemctl --user stop pueued.service 2>/dev/null || true
killall -9 pueued 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now pueued.service
loginctl enable-linger $USER

# 7. Aguardar o daemon inicializar e gerar o socket
echo "⏳ Aguardando o daemon gerar o pueue.yml e abrir o socket..."
sleep 4

# 8. Configurar os grupos de recursos via CLI
pueue parallel 4 -g default
pueue group add gpu 2>/dev/null || true
pueue parallel 1 -g gpu

# 9. Injetar a blindagem da GPU no arquivo YAML usando Python via Here-Doc (Seguro contra aspas)
echo "🛡️ Configurando o isolamento de hardware..."
python3 << 'PYTHON_EOF'
import sys, os

config_path = os.path.expanduser("~/.config/pueue/pueue.yml")
if not os.path.exists(config_path):
    print(f"⚠️ Erro: Arquivo {config_path} não encontrado. Injeção manual necessária.")
    sys.exit(1)

with open(config_path, "r") as f:
    lines = f.readlines()

with open(config_path, "w") as f:
    in_daemon = False
    skip_shell = False
    for line in lines:
        if line.startswith("daemon:"):
            in_daemon = True
            f.write(line)
            # Injeta nossa regra de hardware perfeitamente indentada
            f.write("  shell_command:\n")
            f.write("    - \"bash\"\n")
            f.write("    - \"-c\"\n")
            f.write("    - |\n")
            f.write("      if [ \"$PUEUE_GROUP\" = \"gpu\" ]; then\n")
            f.write("          export CUDA_VISIBLE_DEVICES=\"0\"\n")
            f.write("      else\n")
            f.write("          export CUDA_VISIBLE_DEVICES=\"\"\n")
            f.write("      fi\n")
            f.write("      {{ pueue_command_string }}\n")
            continue
            
        # Pula a chave shell_command original e seus filhos, se existirem
        if in_daemon and line.strip().startswith("shell_command:"):
            skip_shell = True
            continue
            
        if skip_shell:
            if line.strip() == "" or line.startswith("    ") or line.strip().startswith("-"):
                continue
            else:
                skip_shell = False
                
        f.write(line)
PYTHON_EOF

# 10. Reiniciar o daemon para aplicar a proteção de VRAM
systemctl --user restart pueued.service
sleep 2

echo "✅ Tudo pronto! O Pueue está rodando, monitorado pelo systemd e com a RTX blindada."
pueue status

echo "📦 Configurando o repositório atual..."

# Obter o diretório do script para referenciar o repositório corretamente
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

# 11. Instalar dependências e compilar o frontend
echo "🔨 Instalando dependências do frontend..."
cd static
npm install
npm run build
cd ..

# 12. Instalar dependências do Python
echo "🐍 Instalando dependências do Python..."
if command -v uv &> /dev/null; then
    echo "⚡ Usando uv para sincronizar dependências..."
    uv sync
    RUN_COMMAND="uv run"
else
    echo "📦 Criando ambiente virtual Python com venv e pip..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    RUN_COMMAND="python3"
fi

# Rodando o thermald
echo "🚀 Iniciando o Thermald..."
sudo systemctl enable --now thermald.service
sudo systemctl start thermald.service

# 13. Rodando o código
echo "🚀 Iniciando o Pueue WebUI..."
if [ -n "$PUEUE_WEBUI_PASSWORD" ]; then
    echo "🔒 Rodando com proteção de senha configurada via PUEUE_WEBUI_PASSWORD."
else
    echo "⚠️ PUEUE_WEBUI_PASSWORD não definido. O acesso ao painel será irrestrito (sem senha)."
fi

$RUN_COMMAND main.py --port 9092
