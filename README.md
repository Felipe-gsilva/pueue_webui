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

1. **Sleek Sidebar Layout**: Left sidebar navigation to switch between task queue management and system metrics.
2. **Real-time System Monitor (Analytics)**: Modular dashboard displaying:
   - **CPU**: Overall percentage gauge and individual core tracks.
   - **RAM**: Memory utilization progress indicator (used vs total).
   - **GPU & VRAM**: Direct monitoring of NVIDIA cards (VRAM, usage, temperatures) using `nvidia-smi`.
   - **Temperatures**: Dynamic color-shifting gauges for CPU package and thermals.
   - **Top Processes**: Filterable list of the top 10 CPU-consuming processes.
3. **Add/kill/remove/restart tasks easily**: Clean dedicated task creation modal.
4. **Monitor realtime states of tasks**: Follow log changes and trace execution states.

![](docs/pic1.png)

3. Follow the log changes
4. Edit spawn options of existing tasks

![](docs/pic2.png)

## Disclaimer

The project is still in a very early stage and is extremely unstable. Tests are very coarse, so please aware that you are supposed to be mindful of your own data and system when using this project, and that the author of this project is not responsible for any of your data lost.

## FAQs

## Todos

- [ ] Minimize Static Assets
- [ ] Responsive Adaptation
- [ ] Task Filtering and Sorting
- [ ] Redhat Cockpit Supports
- [ ] Maybe rewrite the Python part into NodeJS?

