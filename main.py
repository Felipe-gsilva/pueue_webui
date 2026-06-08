#!/usr/bin/env python3

import json
import time
import os
import sys
import subprocess
import watchdog.events
import threading
import pathlib
import platform
import secrets
import shutil
import psutil

from pueue_controller import PueueController, PueueError
from typing import Dict

jsonrpc_methods = {}

log_subscriber: Dict[str, int] = {}

print_lock = threading.Lock()
log_subscriber_lock = threading.Lock()

if platform.system() == "Windows":
    if 'LOCALAPPDATA' in os.environ:
        pueue_path = pathlib.Path(os.environ['LOCALAPPDATA']) / 'pueue'
    else:
        pueue_path = pathlib.Path.home() / 'AppData/Local' / 'pueue'
elif platform.system() == "Darwin":
    pueue_path = pathlib.Path.home() / 'Library/Application Support' / 'pueue'
elif platform.system() == "Linux":
    if 'XDG_DATA_HOME' in os.environ:
        pueue_path = pathlib.Path(os.environ['XDG_DATA_HOME']) / 'pueue'
    else:
        pueue_path = pathlib.Path.home() / '.local/share' / 'pueue'

logs_path = pueue_path / 'task_logs'

IS_AUTHENTICATED = False

def load_sessions():
    sessions_path = pueue_path / 'pueue_sessions.json'
    if sessions_path.exists():
        try:
            return set(json.loads(sessions_path.read_text()))
        except Exception:
            pass
    return set()

def save_sessions(sessions):
    sessions_path = pueue_path / 'pueue_sessions.json'
    try:
        sessions_path.write_text(json.dumps(list(sessions)))
    except Exception:
        pass

def is_password_configured():
    password = os.environ.get('PUEUE_WEBUI_PASSWORD')
    if password:
        return password
    
    config_path = pueue_path / 'pueue_webui.json'
    if config_path.exists():
        try:
            conf = json.loads(config_path.read_text())
            return conf.get('password')
        except Exception:
            pass
    return None


def jsonrpc_method(method):
    global jsonrpc_methods
    jsonrpc_methods[method.__name__] = method
    return method

def jsonrpc_response(r):
    if r:
        r['jsonrpc'] = '2.0'
        resp = json.dumps(r, separators=(',', ':'))
        with print_lock:
            print(resp, flush=True)

@jsonrpc_method
def pueue(subcommands, options={}, args=[]):
    if isinstance(subcommands, str):
        subcommands = [subcommands]
    controller = PueueController(['pueue'] + subcommands)
    proc = controller(*args, **options)

    if proc.returncode == 0:
        return proc.result
    else:
        raise PueueError(proc.returncode, proc.stdout + proc.stderr)

@jsonrpc_method
def run_local_command_async(_id, commands):
    def f():
        proc = subprocess.run(commands, capture_output=True, encoding='utf-8', stdin=subprocess.DEVNULL)

        jsonrpc_response({
            'id': _id,
            'result': {
                "returncode": proc.returncode,
                "stdout": proc.stdout,
                "stderr": proc.stderr,
            }
        })

    t = threading.Thread(target=f)
    t.start()

@jsonrpc_method
def pueue_webui_meta(data=None):
    config_path = pueue_path / 'pueue_webui.json'
    if not config_path.exists():
        config_path.write_text('{}')
    if data is None:
        conf = json.loads(config_path.read_text())
        conf['cwd'] = os.getcwd()
        if 'groups' not in conf:
            conf['groups'] = {}
        return conf
    else:
        config_path.write_text(json.dumps(data))
        return 'Meta stored'

@jsonrpc_method
def pueue_edit(id, kvs):
    import tempfile
    f = tempfile.NamedTemporaryFile(suffix='pueue_webui', delete=False)
    fpath = pathlib.Path(f.name)
    f.close()

    edit_procs = ''

    for k, v in kvs.items():
        if not v:
            continue

        fpath.write_text('import pathlib\nimport sys\npathlib.Path(sys.argv[1]).write_text(%s)' % repr(v))
        edit = PueueController(['pueue', 'edit'])
        proc = edit(id, __controller_env_override={'EDITOR': f'{sys.executable} {fpath}'}, **{k: True})
        if proc.returncode == 0:
            edit_procs += f'{k}: {proc.result}\n'
        else:
            raise PueueError(proc.returncode, proc.stdout + proc.stderr)

    fpath.unlink()

    return edit_procs


class LogUpdatedHandler(watchdog.events.FileSystemEventHandler):
    def __init__(self):
        self.last_call = 0

    def on_any_event(self, event):
        print('log', event, file=sys.stderr)

        path = pathlib.Path(event.src_path)
        if not path.exists():
            return

        subscribed = True
        prev_size = 0
        curr_size = path.stat().st_size

        with log_subscriber_lock:
            subscribed = path.stem in log_subscriber
            if subscribed:
                prev_size = log_subscriber[path.stem]
                log_subscriber[path.stem] = curr_size

        if prev_size > curr_size:
            prev_size = 0

        if subscribed and prev_size != curr_size:
            content = ''
            with path.open('rb') as f:
                f.seek(prev_size)
                bytes = f.read(curr_size - prev_size)
                content = bytes.decode('utf-8', errors='ignore')

            jsonrpc_response({
                'method': 'onLogUpdated',
                'params': [path.stem, prev_size, curr_size, content],
            })

        self.last_call = time.time()

@jsonrpc_method
def pueue_log_subscription(taskId, addOrDel, options={}):
    path = (logs_path / f'{taskId}.log')

    if addOrDel:
        # Default: 1MB max bytes, 20000 max lines, capped at 50MB and 1M lines
        max_lines = min(1000000, int(options.get('lines', 20000)))
        max_bytes = min(50000000, int(options.get('bytes', 1000000)))

        start_size = 0
        end_size = 0
        content = ''

        if path.exists():
            end_size = path.stat().st_size
            start_size = max(0, end_size - max_bytes)

            with path.open('rb') as f:
                f.seek(start_size)
                bytes = f.read(end_size - start_size)
                content = bytes.decode('utf-8', errors='ignore')
                content = '\n'.join(content.split('\n')[-max_lines:])

        with log_subscriber_lock:
            log_subscriber[taskId] = end_size

        return [path.stem, start_size, end_size, content]
    else:
        with log_subscriber_lock:
            if taskId in log_subscriber:
                del log_subscriber[taskId]
        return True


@jsonrpc_method
def is_password_required():
    return is_password_configured() is not None

@jsonrpc_method
def verify_password(password):
    global IS_AUTHENTICATED
    expected = is_password_configured()
    if expected and password == expected:
        token = secrets.token_hex(32)
        sessions = load_sessions()
        sessions.add(token)
        save_sessions(sessions)
        IS_AUTHENTICATED = True
        return {'status': 'success', 'token': token}
    else:
        return {'status': 'fail', 'message': 'Invalid password'}

@jsonrpc_method
def verify_session_token(token):
    global IS_AUTHENTICATED
    sessions = load_sessions()
    if token in sessions:
        IS_AUTHENTICATED = True
        return True
    return False

@jsonrpc_method
def logout(token):
    global IS_AUTHENTICATED
    sessions = load_sessions()
    if token in sessions:
        sessions.discard(token)
        save_sessions(sessions)
    IS_AUTHENTICATED = False
    return True

def get_gpu_processes():
    gpu_procs = {}
    try:
        import xml.etree.ElementTree as ET
        proc = subprocess.run(['nvidia-smi', '-q', '-x'], capture_output=True, text=True, timeout=1.5)
        if proc.returncode == 0:
            root = ET.fromstring(proc.stdout)
            for gpu in root.findall('gpu'):
                processes = gpu.find('processes')
                if processes is not None:
                    for proc_info in processes.findall('process_info'):
                        pid_val = proc_info.find('pid')
                        used_mem = proc_info.find('used_memory')
                        if pid_val is not None and used_mem is not None:
                            try:
                                pid = int(pid_val.text)
                                mem_str = used_mem.text.replace('MiB', '').replace('MB', '').strip()
                                vram = float(mem_str)
                                gpu_procs[pid] = {'vram': vram, 'gpu': 0.0}
                            except Exception:
                                pass
    except Exception:
        pass

    try:
        proc = subprocess.run(['nvidia-smi', 'pmon', '-c', '1'], capture_output=True, text=True, timeout=1.5)
        if proc.returncode == 0:
            lines = proc.stdout.strip().split('\n')
            for line in lines:
                if line.strip() and not line.startswith('#'):
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        try:
                            pid = int(parts[1])
                            sm_str = parts[3]
                            if sm_str != '-':
                                sm_val = float(sm_str)
                                if pid in gpu_procs:
                                    gpu_procs[pid]['gpu'] = sm_val
                                else:
                                    gpu_procs[pid] = {'vram': 0.0, 'gpu': sm_val}
                        except Exception:
                            pass
    except Exception:
        pass
    return gpu_procs

@jsonrpc_method
def get_system_stats():
    # CPU
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_percent_per_cpu = psutil.cpu_percent(interval=None, percpu=True)
    
    # Memory
    mem = psutil.virtual_memory()
    memory_info = {
        'total': mem.total,
        'available': mem.available,
        'used': mem.used,
        'free': mem.free,
        'percent': mem.percent
    }
    
    # Temperatures
    temps = {}
    try:
        ps_temps = psutil.sensors_temperatures()
        if ps_temps:
            for name, entries in ps_temps.items():
                temps[name] = [
                    {'label': e.label or name, 'current': e.current, 'high': e.high, 'critical': e.critical}
                    for e in entries
                ]
    except Exception:
        pass
        
    if not temps:
        try:
            for zone_path in pathlib.Path('/sys/class/thermal').glob('thermal_zone*'):
                type_path = zone_path / 'type'
                temp_path = zone_path / 'temp'
                if type_path.exists() and temp_path.exists():
                    t_type = type_path.read_text().strip()
                    t_temp = float(temp_path.read_text().strip()) / 1000.0
                    if 'temp' not in temps:
                        temps['temp'] = []
                    temps['temp'].append({'label': t_type, 'current': t_temp})
        except Exception:
            pass

    # GPU / VRAM via nvidia-smi
    gpu_stats = []
    nvidia_smi = shutil.which('nvidia-smi')
    if nvidia_smi:
        try:
            proc = subprocess.run([
                'nvidia-smi', 
                '--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu', 
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, check=True)
            for line in proc.stdout.strip().split('\n'):
                if line:
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 5:
                        gpu_stats.append({
                            'name': parts[0],
                            'memory_total': float(parts[1]),
                            'memory_used': float(parts[2]),
                            'utilization': float(parts[3]),
                            'temperature': float(parts[4])
                        })
        except Exception:
            pass

    # Process list: top active processes by CPU, Memory and GPU
    process_list = []
    gpu_procs = get_gpu_processes() if shutil.which('nvidia-smi') else {}
    
    try:
        pids_seen = set()
        
        # Get top 35 processes by CPU
        proc_cpu = subprocess.run([
            'ps', '-eo', 'pid,comm,%cpu,%mem', '--sort=-%cpu'
        ], capture_output=True, text=True, check=True)
        lines_cpu = proc_cpu.stdout.strip().split('\n')
        for line in lines_cpu[1:36]:
            parts = line.strip().split()
            if len(parts) >= 4:
                try:
                    pid = int(parts[0])
                    name = parts[1]
                    cpu = float(parts[2])
                    memory = float(parts[3])
                    pids_seen.add(pid)
                    gpu_data = gpu_procs.get(pid, {'vram': 0.0, 'gpu': 0.0})
                    process_list.append({
                        'pid': pid,
                        'name': name,
                        'cpu': cpu,
                        'memory': memory,
                        'gpu_vram': gpu_data['vram'],
                        'gpu_util': gpu_data['gpu']
                    })
                except ValueError:
                    pass
                    
        # Get top 35 processes by RAM (memory)
        proc_mem = subprocess.run([
            'ps', '-eo', 'pid,comm,%cpu,%mem', '--sort=-%mem'
        ], capture_output=True, text=True, check=True)
        lines_mem = proc_mem.stdout.strip().split('\n')
        for line in lines_mem[1:36]:
            parts = line.strip().split()
            if len(parts) >= 4:
                try:
                    pid = int(parts[0])
                    if pid not in pids_seen:
                        name = parts[1]
                        cpu = float(parts[2])
                        memory = float(parts[3])
                        pids_seen.add(pid)
                        gpu_data = gpu_procs.get(pid, {'vram': 0.0, 'gpu': 0.0})
                        process_list.append({
                            'pid': pid,
                            'name': name,
                            'cpu': cpu,
                            'memory': memory,
                            'gpu_vram': gpu_data['vram'],
                            'gpu_util': gpu_data['gpu']
                        })
                except ValueError:
                    pass
                    
        # Add any active GPU processes not captured above
        for pid, gpu_data in gpu_procs.items():
            if pid not in pids_seen:
                name = "Unknown"
                cpu = 0.0
                memory = 0.0
                try:
                    p = psutil.Process(pid)
                    name = p.name()
                    cpu = p.cpu_percent(interval=None)
                    memory = p.memory_percent()
                except Exception:
                    pass
                pids_seen.add(pid)
                process_list.append({
                    'pid': pid,
                    'name': name,
                    'cpu': cpu,
                    'memory': memory,
                    'gpu_vram': gpu_data['vram'],
                    'gpu_util': gpu_data['gpu']
                })
                
    except Exception:
        # Fallback to psutil
        try:
            pids_seen = set()
            all_procs = []
            for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                try:
                    cpu = p.info['cpu_percent'] or 0.0
                    mem = p.info['memory_percent'] or 0.0
                    all_procs.append((p.info['pid'], p.info['name'], cpu, mem))
                except Exception:
                    pass
                    
            top_cpu = sorted(all_procs, key=lambda x: x[2], reverse=True)[:35]
            top_mem = sorted(all_procs, key=lambda x: x[3], reverse=True)[:35]
            
            for pid, name, cpu, mem in top_cpu:
                pids_seen.add(pid)
                gpu_data = gpu_procs.get(pid, {'vram': 0.0, 'gpu': 0.0})
                process_list.append({
                    'pid': pid,
                    'name': name or "Unknown",
                    'cpu': cpu,
                    'memory': mem,
                    'gpu_vram': gpu_data['vram'],
                    'gpu_util': gpu_data['gpu']
                })
                
            for pid, name, cpu, mem in top_mem:
                if pid not in pids_seen:
                    pids_seen.add(pid)
                    gpu_data = gpu_procs.get(pid, {'vram': 0.0, 'gpu': 0.0})
                    process_list.append({
                        'pid': pid,
                        'name': name or "Unknown",
                        'cpu': cpu,
                        'memory': mem,
                        'gpu_vram': gpu_data['vram'],
                        'gpu_util': gpu_data['gpu']
                    })
                    
            for pid, gpu_data in gpu_procs.items():
                if pid not in pids_seen:
                    name = "Unknown"
                    cpu = 0.0
                    mem = 0.0
                    try:
                        p = psutil.Process(pid)
                        name = p.name()
                        cpu = p.cpu_percent(interval=None)
                        mem = p.memory_percent()
                    except Exception:
                        pass
                    pids_seen.add(pid)
                    process_list.append({
                        'pid': pid,
                        'name': name,
                        'cpu': cpu,
                        'memory': mem,
                        'gpu_vram': gpu_data['vram'],
                        'gpu_util': gpu_data['gpu']
                    })
        except Exception:
            pass

    return {
        'cpu': {
            'percent': cpu_percent,
            'per_cpu': cpu_percent_per_cpu
        },
        'memory': memory_info,
        'temperatures': temps,
        'gpus': gpu_stats,
        'processes': process_list
    }






class StatusUpdatedHandler(watchdog.events.FileSystemEventHandler):
    def __init__(self):
        self.last_call = 0

    def on_any_event(self, event):
        print('status', event, file=sys.stderr)

        if time.time() - self.last_call < 0.1:
            return

        jsonrpc_response({
            'jsonrpc': '2.0',
            'method': 'onStatusUpdated',
            #'params': [repr(event)],
            'params': [],
        })

        self.last_call = time.time()

def stdio_main():
    observer = None
    import watchdog.observers.polling
    observer = watchdog.observers.polling.PollingObserver()
    #import watchdog.observers
    #observer = watchdog.observers.Observer()

    observer.start()
    observer.schedule(StatusUpdatedHandler(), str(pueue_path), recursive=False)
    observer.schedule(LogUpdatedHandler(), str(logs_path), recursive=False)

    while True:
        request = {}
        try:
            request_str = input()
            #print('<- ' + request_str, file=sys.stderr)
            request = json.loads(request_str)
            method_name = request['method']
            
            # Check auth
            password_required = is_password_configured() is not None
            allowed_methods = ['is_password_required', 'verify_password', 'verify_session_token']
            
            if password_required and not IS_AUTHENTICATED and method_name not in allowed_methods:
                jsonrpc_response({
                    'error': { 'code': 32002, 'message': 'Unauthorized', 'data': 'Password authentication required' },
                    'id': request['id'] if 'id' in request else None
                })
                continue

            is_async = method_name.endswith('_async')

            result = jsonrpc_methods[method_name](*([request['id']] if is_async else []) + request['params'])

            if is_async:
                continue

            jsonrpc_response({
                'result': result,
                'id': request['id']
            })
        except PueueError as e:
            jsonrpc_response({
                'error': { 'code': 32001, 'message': f'PueueError({e.args[0]})', 'data': str(e.args[1]) },
                'id': request['id'] if 'id' in request else None
            })
        except EOFError:
            break
        except KeyboardInterrupt:
            break
        except Exception as e:
            import traceback
            jsonrpc_response({
                'error': { 'code': 32600, 'message': type(e).__name__, 'data': traceback.format_exc() },
                'id': request['id'] if 'id' in request else None
            })

    observer.stop()

def ws_main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', action='store', default='localhost', type=str)
    parser.add_argument('--port', action='store', default='9092', type=str)
    args = parser.parse_args(sys.argv[1:])

    import shutil

    for exe in ['websocketd', 'pueue']:
        websocketd = shutil.which(exe)
        if not websocketd:
            print(f'pueue_webui requires {exe} that is not found in PATH, you might have to install it with your package manager first.', file=sys.stderr)
            exit(1)

    cwd = os.path.abspath(os.path.dirname(__file__))
    subprocess.run(['websocketd',
                    '--staticdir=' + cwd + '/static',
                    '--port=' + args.port, '--address=' + args.host,
                    '--passenv', ','.join(list(os.environ.keys())),
                    sys.executable, os.path.abspath(__file__), '--stdio'
                    ])

if __name__ == "__main__":
    if '--stdio' in sys.argv:
        stdio_main()
    else:
        ws_main()


