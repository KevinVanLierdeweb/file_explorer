import eel
import ctypes
import os
import platform
import subprocess
import sys
import shutil
import base64
import threading
from send2trash import send2trash

# OS Detection and Path configuration for C++ core
system_name = platform.system()
lib_ext = '.dll' if system_name == 'Windows' else '.so'
core_dir = os.path.join(os.path.dirname(__file__), 'core')
cpp_path = os.path.join(core_dir, 'scanner.cpp')
lib_path = os.path.join(core_dir, f'scanner{lib_ext}')

# Auto-compile C++ module if missing or outdated before running
def auto_compile_cpp():
    if not os.path.exists(cpp_path): return
    needs_compile = not os.path.exists(lib_path) or os.path.getmtime(cpp_path) > os.path.getmtime(lib_path)
    
    if needs_compile:
        print(f"[*] Auto-compilando core C++ para {system_name}...")
        
        # C++17 is strictly required for <filesystem>
        cmd = ['g++', '-O3', '-std=c++17', '-shared', '-o', lib_path, cpp_path]
        
        if system_name == 'Windows':
            # Force static linkage of C++ standard libraries so the DLL doesn't depend on MinGW binaries in PATH
            cmd.extend(['-static-libgcc', '-static-libstdc++'])
        else:
            cmd.insert(4, '-fPIC') # Unix requires Position Independent Code for shared libs
            
        try:
            subprocess.run(cmd, check=True)
            print("[✓] Compilación C++ exitosa.")
        except FileNotFoundError:
            print("[!] Advertencia: No se encontró el compilador 'g++'. Asegúrate de tener GCC/MinGW instalado.")
        except subprocess.CalledProcessError as e:
            print(f"[!] Archivo C++ falló al compilar. Revisa la sintaxis. Error: {e}")

auto_compile_cpp()

# Load compiled library via CTypes
try:
    scanner_lib = ctypes.CDLL(lib_path)
    scanner_lib.scan_directory.restype = ctypes.c_char_p
    scanner_lib.calculate_folder_size.restype = ctypes.c_longlong
    scanner_lib.calculate_folder_size.argtypes = [ctypes.c_char_p]
except OSError as e:
    print(f"\nError Fatal: No se pudo cargar el motor C++. ({e})")
    print("Por favor, asegúrate de tener g++ instalado en el PATH.\n")
    sys.exit(1)

eel.init('web')

# Global concurrency control for optimal system-wide file scanning
search_token = 0
search_lock = threading.Lock()

@eel.expose
def open_file(filepath):
    """Opens a file using the host OS default application handler."""
    try:
        if sys.platform == "win32":
            try:
                os.startfile(filepath)
            except OSError as e:
                # Force Windows 'Open With' dialog if no default app is associated (WinError 1155)
                if getattr(e, 'winerror', None) == 1155:
                    subprocess.Popen(['rundll32.exe', 'shell32.dll,OpenAs_RunDLL', filepath])
                else:
                    raise
        elif sys.platform == "darwin":
            subprocess.call(["open", filepath])
        else:
            subprocess.call(["xdg-open", filepath])
    except Exception as e:
        return str(e)

def get_folder_size(folder_path):
    """Calls C++ backend to recursively calculate directory size."""
    try:
        return scanner_lib.calculate_folder_size(folder_path.encode('utf-8'))
    except:
        return 0

@eel.expose
def get_folder_size_formatted(filepath):
    """Returns human-readable folder size."""
    total_size = get_folder_size(filepath)
    if total_size > 1073741824: return f"{total_size / 1073741824:.2f} GB"
    elif total_size > 1048576: return f"{total_size / 1048576:.2f} MB"
    elif total_size > 1024: return f"{total_size / 1024:.2f} KB"
    else: return f"{total_size} B"

@eel.expose
def get_file_details(filepath, is_dir):
    """Retrieves metadata such as item count for folders or file size for files."""
    try:
        details = {"path": filepath}
        if is_dir:
            try: items = len(os.listdir(filepath))
            except: items = 0
            details['info'] = f"Contiene {items} elementos"
            details['size'] = "---" # Defer heavy calculation dynamically
        else:
            size_bytes = os.path.getsize(filepath)
            if size_bytes > 1073741824: details['size'] = f"{size_bytes / 1073741824:.2f} GB"
            elif size_bytes > 1048576: details['size'] = f"{size_bytes / 1048576:.2f} MB"
            elif size_bytes > 1024: details['size'] = f"{size_bytes / 1024:.2f} KB"
            else: details['size'] = f"{size_bytes} B"
            details['info'] = "Archivo"
        return details
    except Exception as e:
        return {"error": str(e)}

@eel.expose
def get_image_preview(filepath):
    """Returns Base64 encoded image string for UI previews, bounded by a 5MB memory limit."""
    try:
        if os.path.getsize(filepath) > 5 * 1024 * 1024:
            return "TOO_LARGE"
        with open(filepath, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            ext = filepath.split('.')[-1].lower()
            mime = "image/png" if ext == "png" else "image/jpeg" if ext in ["jpg", "jpeg"] else "image/gif"
            return f"data:{mime};base64,{encoded_string}"
    except:
        return None

@eel.expose
def delete_items(paths):
    """Safely disposes listed items to OS Recycle Bin."""
    try:
        for path in paths: send2trash(path)
        return "OK"
    except Exception as e: return str(e)

@eel.expose
def move_items(sources, destination_folder):
    """Moves listed items to a target directory utilizing OS native shutil operations."""
    try:
        for src in sources: shutil.move(src, destination_folder)
        return "OK"
    except Exception as e: return str(e)

@eel.expose
def get_files(path=""):
    """Fetches directory payload using the high-performance C++ scanner implementation."""
    if not path:
        path = os.path.expanduser("~")
        
    raw_result = scanner_lib.scan_directory(path.encode('utf-8'))
    result_str = raw_result.decode('utf-8', errors='ignore')
    
    if result_str == "ERROR":
        return {"error": "Sin permisos de acceso o ruta inválida", "path": path}
        
    files_list = []
    items = result_str.split('*')
    for item in items:
        if item:
            parts = item.split('|')
            if len(parts) == 4:
                name, f_type, c_timestamp, size = parts
                full_path = os.path.join(path, name)
                
                try: real_time = os.path.getmtime(full_path)
                except: real_time = 0
                
                files_list.append({
                    "name": name, 
                    "type": f_type, 
                    "timestamp": real_time,
                    "size": int(size)
                })
    return {"path": path, "files": files_list}

def run_global_search(query, current_token):
    """Yields OS filesystem iteration targeting partial strings, dispatching websockets real-time."""
    global search_token
    home_dir = os.path.expanduser("~")
    
    for root, dirs, files in os.walk(home_dir):
        with search_lock:
            # Terminate trailing background threads natively.
            if search_token != current_token: break
            
        for name in files + dirs:
            if query.lower() in name.lower():
                full_path = os.path.join(root, name)
                f_type = "DIR" if os.path.isdir(full_path) else "FILE"
                
                try: real_time = os.path.getmtime(full_path)
                except: real_time = 0
                
                try: f_size = os.path.getsize(full_path) if f_type == "FILE" else 0
                except: f_size = 0
                
                # Waterfall realtime rendering payload via WebSocket
                eel.add_search_result({
                    "name": name, "type": f_type, "timestamp": real_time, "size": f_size, "path": full_path
                })
                eel.sleep(0.005) # Prevent DOM exhaustion on fast SSDs.

@eel.expose
def start_global_search(query):
    """Boots asynchronous system-wide search daemon thread."""
    global search_token
    with search_lock:
        search_token += 1
        current_token = search_token
    threading.Thread(target=run_global_search, args=(query, current_token), daemon=True).start()

@eel.expose
def stop_global_search():
    """Triggers thread abortion for the active global search query via global token."""
    global search_token
    with search_lock:
        search_token += 1

if __name__ == '__main__':
    eel.start('index.html', size=(1200, 800), port=0)