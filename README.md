# Pueue WebUI

A simple WebUI for my favourite CLI tool [pueue](https://github.com/Nukesor/pueue), an easy-to-use workflow management tool dedicated on local machine dispatching.

Given so many process management/workflow dispatching tools out there, pueue is still having several advantages over some big and mature projects:

1. Compared to many others pueue is very LIGHTWEIGHT, without need of a huge bunch of environment setup or containerize
2. Compared to PM2, pueue supports task dependencies so that you can design a resuable task topology
3. Compared to Azkaban and etc., pueue supports Windows (uh-huh!)

The only thing regretful is its lack of a GUI, something useful when one's getting tired to type anything. And that's what this project is trying to solve: it glues some UNIX-ish little tools like websocketd and pueue.

## Getting Started

### Option A: Automated Installation (Recommended for Linux)

This project contains an automated installer script `install.sh` which works out-of-the-box on both **Debian/Ubuntu** (using `apt`) and **Arch Linux** (using `pacman`).

It will automatically:
1. Detect your package manager (`apt-get` or `pacman`) and install missing system dependencies (`curl`, `python3`/`python`, `nodejs`, `npm`, `unzip`).
2. Update your `~/.bashrc` to append `~/.cargo/bin` and `~/.local/bin` to your `PATH` if not already present.
3. Download the pre-built `websocketd` executable from GitHub into `~/.local/bin` if not found.
4. Install `pueue` and `pueued` (via the official `pacman` repo on Arch to avoid compilation, or compiled via `cargo` on Debian/Ubuntu).
5. Set up and register a Systemd user-level service (`pueued.service`) for the daemon, enabling linger via `loginctl` so it persists after logout.
6. Create a `gpu` queue and inject VRAM-shielding/isolation environment rules dynamically into the `pueue.yml` config.
7. Install Python dependencies (using `uv` if installed, or falling back to a virtual environment `.venv` with `pip`) and compile React frontend assets with `npm`.
8. Start the WebUI server on port `9092`.

To install and run:
```bash
chmod +x install.sh
./install.sh
```

### Option B: Manual Installation

1. **Prerequisites**. Install these utilities using your favourite package manager:
    - Supports Windows, Linux, and macOS as `pueue` itself does
    - [websocketd](https://github.com/joewalnes/websocketd): the Web UI relies on it to serve static files and call python glue scripts over JSONRPC
    - [pueue and pueued](https://github.com/Nukesor/pueue)
    - Python 3.7+
    - NodeJS 20.0+ and NPM (Required to build from source)
2. **Build and Run**:
    - Clone the repository and cd into it
    ```bash
    cd static
    npm install
    npm run build

    cd ..
    # Use uv (recommended) or pip to sync dependencies
    uv sync
    # Start the server (binds to localhost:9092 by default)
    uv run main.py --port 9092
    ```
3. Access the WebUI at [http://localhost:9092](http://localhost:9092)

## Exposing on a VPN (Self-Hosted Security)

If you plan to self-host this dashboard and access it securely through a VPN:

1. **Password Authentication**: Set the `PUEUE_WEBUI_PASSWORD` environment variable before launching the server:
   ```bash
   PUEUE_WEBUI_PASSWORD="your-strong-password" uv run main.py --port 9092
   ```
   Alternatively, you can write the password key to the config file `~/.local/share/pueue/pueue_webui.json`:
   ```json
   {
     "password": "your-strong-password"
   }
   ```
2. **Restrict Host Binding**: By default, `main.py` starts `websocketd` binding to `localhost`. To expose it to your VPN interface only (e.g., WireGuard interface IP `10.0.0.5`), specify the `--host` argument:
   ```bash
   uv run main.py --host 10.0.0.5 --port 9092
   ```
3. **Reverse Proxy (Optional but Recommended)**: Run it behind a proxy like Nginx or Caddy to handle SSL encryption over your VPN.

## Features

1. **Sleek Sidebar Navigation**: Left sidebar navigation to switch seamlessly between Task Queue Management, System Metrics, and Documentation.
2. **Real-time System Monitor (Analytics)**:
   - **Dynamic `nvtop`-like Time-Series Chart**: Custom responsive SVG chart plotting CPU, RAM, GPU, and VRAM utilization over time. Features interactive metric toggles (to show/hide lines) and glassmorphic hover tooltips.
   - **GPU & VRAM Tracking**: Direct monitoring of NVIDIA cards (VRAM, usage, temperatures) using `nvidia-smi`.
   - **Resizable & Sortable Process Table**: A clean table displaying PIDs, Names, CPU, Memory, GPU Core Util, and VRAM. Supports interactive header sorting (asc/desc indicators) and draggable column resizing.
3. **Glassmorphic Task Queue**:
   - **Custom Groups Navigation**: Glassmorphic group tab bar displaying active groups with dynamic badges showing total task count.
   - **Group Info Header**: Symmetrical header showing group status (Running/Paused) and summaries of task states (Total, Executando, Fila, Sucesso, Falhas).
   - **Horizontal Scrollable Card List**: A flexrow-based task card list featuring scroll snap alignments and a custom scrollbar.
   - **Card Controls**: Inline start, pause, kill, remove, and edit buttons directly on individual cards.
   - **Visual feedback**: Active glowing borders to indicate focus on the selected logs/envs panel and smooth size change animations.
4. **Console Logs & Envs Viewer**:
   - **Large Log Support**: Support for reading logs up to 50MB and 1,000,000 lines on-demand. Reads the last 1MB by default to keep the UI fast, with a warning bar to load the full log.
   - **Interactive Log Search (Ctrl+F)**: Toggled log search panel with autofocus, real-time matching highlights, Next/Prev navigation buttons, match counters, auto scroll-into-view, and keyboard shortcuts (`Enter` / `Shift+Enter` / `Esc`).
   - **State Sync**: Real-time log streaming updates and automated log resets on task restarts.
   - **Copy to Clipboard**: Quick actions to copy logs or formatted environment variables.
5. **Action Confirmations**:
   - Mandatory glassmorphic confirmation modal overlays for destructive actions (Parar, Remover, Limpar Fila) to prevent accidental clicks.

<img width="450" height="250" alt="image" src="https://github.com/user-attachments/assets/a028e3fd-beea-4aaa-90ae-8fd347ac8c27" />
<img width="450" height="250" alt="image" src="https://github.com/user-attachments/assets/7dff9d48-d6f7-44f9-8112-6c7bd9b897ec" />


<img width="450" height="250" alt="image" src="https://github.com/user-attachments/assets/1e445baf-5f48-4b30-af4f-ec945f2a4269" />
<img width="450" height="250" alt="image" src="https://github.com/user-attachments/assets/17b0641c-2d13-4350-b389-69c99b52857b" />


### Metrics Viewer 
<img width="450" height="250" alt="image" src="https://github.com/user-attachments/assets/fadc9b0b-44ba-4cb1-9400-7dd86abd7dff" />
<img width="450" height="250" alt="image" src="https://github.com/user-attachments/assets/a83ad3b9-d603-42ac-a977-e0f6c6c55ab3" />

