/* ============================================================================== */
/* GLOBAL APPLICATION STATE */
/* ============================================================================== */
let currentPath = "";
let allFilesInCurrentPath = [];
let globalFiles = [];
let selectedFiles = new Set();
let clipboard = { action: null, files: [] };
let searchMode = "LOCAL"; // Toggle between Local Folder vs OS Global Search

/* ============================================================================== */
/* HELPER FUNCTIONS */
/* ============================================================================== */

/**
 * Derives and returns correct emoji based on object type and extension.
 */
function getIcon(filename, type) {
    if (type === "DIR") return "📁";
    const ext = filename.split('.').pop().toLowerCase();
    
    // MimeType emoji correlation mapping
    const icons = {
        'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️',
        'mp4': '🎬', 'mp3': '🎵', 'zip': '📦', 'exe': '⚙️',
        'txt': '📝', 'pdf': '📕', 'doc': '📘', 'docx': '📘'
    };
    return icons[ext] || "📄";
}

/**
 * Parses UNIX timestamps into localized readable Date Strings (Hoy, Ayer, DD/MM/YYYY).
 */
function getGroupDate(timestamp) {
    if (timestamp === 0 || !timestamp) return "Desconocido";

    // Standardize C++ Epoch to JS Milliseconds format
    let jsTime = timestamp * 1000;
    if (timestamp > 9999999999) jsTime = timestamp / 10000; 

    const date = new Date(jsTime);
    if (isNaN(date.getTime())) return "Desconocido";

    const today = new Date();
    const yesterday = new Date(today); 
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Hoy";
    if (date.toDateString() === yesterday.toDateString()) return "Ayer";

    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ============================================================================== */
/* DIRECTORY PARSING AND DOM RENDERING PIPELINE */
/* ============================================================================== */

// App initialization Trigger
window.onload = () => loadDirectory("");

/**
 * Core async dispatcher to mount OS folders locally via Eel Websockets.
 */
async function loadDirectory(path) {
    // Abort pending asynchronous global tasks from Python instances
    eel.stop_global_search()();
    
    const response = await eel.get_files(path)();
    if (response.error) { 
        alert(response.error); 
        return; 
    }

    currentPath = response.path; 
    document.getElementById("path-input").value = currentPath;
    allFilesInCurrentPath = response.files;

    selectedFiles.clear();
    updateDetailsPanel();
    processAndRenderFiles(allFilesInCurrentPath);
}

/**
 * Filter and sort engine based on dropdown states
 */
function processAndRenderFiles(filesToProcess) {
    const sortMode = document.getElementById("sort-select").value;

    let sortedFiles = [...filesToProcess].sort((a, b) => {
        if (sortMode === 'date-desc') return b.timestamp - a.timestamp;
        if (sortMode === 'date-asc') return a.timestamp - b.timestamp;
        if (sortMode === 'name-asc') return a.name.localeCompare(b.name);
        if (sortMode === 'size-desc') return b.size - a.size;
        if (sortMode === 'type') return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
    });

    // Sub-sort: Automatically push Folders to index [0] unless time-sorted.
    if (sortMode !== 'type' && !sortMode.includes('date')) {
        sortedFiles.sort((a, b) => (a.type === "DIR" ? -1 : 1) - (b.type === "DIR" ? -1 : 1));
    }

    renderFiles(sortedFiles, sortMode.includes('date'));
}

/**
 * Master DOM Injector
 */
function renderFiles(filesToRender, showGroups = false) {
    const grid = document.getElementById("file-grid");
    grid.innerHTML = "";
    
    let lastGroup = "";

    filesToRender.forEach(file => {
        // Construct canonical OS fullpaths
        let fullPath = file.path ? file.path : (currentPath.endsWith("\\") || currentPath.endsWith("/") ? currentPath + file.name : currentPath + "\\" + file.name);

        if (showGroups) {
            let currentGroup = getGroupDate(file.timestamp);
            if (currentGroup !== lastGroup) {
                const header = document.createElement("div");
                header.className = "group-header";
                header.innerText = currentGroup;
                grid.appendChild(header);
                lastGroup = currentGroup;
            }
        }

        const div = document.createElement("div");
        div.className = "item";
        
        // Restore multi-select highlighting during grid reflows
        if (selectedFiles.has(fullPath)) div.classList.add("selected");

        const isImage = ['png', 'jpg', 'jpeg', 'gif'].includes(file.name.split('.').pop().toLowerCase()) && file.type !== "DIR";
        const icon = getIcon(file.name, file.type);

        div.innerHTML = `<div class="icon">${icon}</div><div class="item-name" title="${file.name}">${file.name}</div>`;
        div.dataset.path = fullPath;

        // Interaction event bindings (Click && Multi-Select)
        div.onclick = (e) => {
            if (e.ctrlKey) {
                if (selectedFiles.has(fullPath)) selectedFiles.delete(fullPath);
                else selectedFiles.add(fullPath);
            } else {
                selectedFiles.clear(); 
                selectedFiles.add(fullPath);
            }
            
            // Re-render selection borders DOM-wide
            Array.from(grid.children).forEach(child => {
                if (child.classList.contains("item")) child.classList.remove("selected");
            });
            selectedFiles.forEach(path => {
                let elem = Array.from(grid.children).find(c => c.dataset?.path === path);
                if (elem) elem.classList.add("selected");
            });
            
            updateDetailsPanel(file, fullPath, isImage);
        };

        div.ondblclick = () => file.type === "DIR" ? loadDirectory(fullPath) : eel.open_file(fullPath)();
        grid.appendChild(div);
    });
}

/* ============================================================================== */
/* ASIDE METADATA PANEL & PREVIEWS CONTROLLER */
/* ============================================================================== */
async function updateDetailsPanel(fileInfo = null, fullPath = "", isImage = false) {
    const contextActions = document.getElementById("context-actions");
    const previewContainer = document.getElementById("preview-container");

    if (selectedFiles.size === 0) {
        contextActions.style.display = "none";
        previewContainer.innerHTML = `<div class="details-icon">✨</div>`;
        document.getElementById("details-name").innerText = "Selecciona un archivo";
        document.getElementById("details-info").innerText = "Para ver sus detalles";
        document.getElementById("details-size").innerText = "--";
        
    } else if (selectedFiles.size === 1 && fileInfo) {
        contextActions.style.display = "flex";
        document.getElementById("details-name").innerText = fileInfo.name;
        document.getElementById("details-info").innerText = "Calculando...";

        if (isImage) {
            previewContainer.innerHTML = `<div class="details-icon">⏳</div>`;
            const base64Data = await eel.get_image_preview(fullPath)();
            if (base64Data && base64Data !== "TOO_LARGE") {
                previewContainer.innerHTML = `<img src="${base64Data}" class="preview-img">`;
            } else {
                previewContainer.innerHTML = `<div class="details-icon">🖼️</div>`;
            }
        } else {
            previewContainer.innerHTML = `<div class="details-icon">${getIcon(fileInfo.name, fileInfo.type)}</div>`;
        }

        const details = await eel.get_file_details(fullPath, fileInfo.type === "DIR")();
        document.getElementById("details-info").innerText = details.info;
        
        if (fileInfo.type === "DIR") {
            const btn = document.createElement("button");
            btn.className = "action-btn";
            btn.innerText = "Calcular";
            
            btn.onclick = async () => {
                const sizeSpan = document.getElementById("details-size");
                sizeSpan.innerText = "Calculando...";
                
                // Invoke synchronous C++ backend execution folder size computation
                const sizeStr = await eel.get_folder_size_formatted(fullPath)();
                
                // Prevent race-conditions upon cursor leaving original folder mid-calculation
                if (selectedFiles.size === 1 && selectedFiles.has(fullPath)) {
                    sizeSpan.innerText = sizeStr;
                }
            };
            
            const sizeSpan = document.getElementById("details-size");
            sizeSpan.innerHTML = "";
            sizeSpan.appendChild(btn);
            
        } else {
            document.getElementById("details-size").innerText = details.size;
        }
        
    } else {
        contextActions.style.display = "flex";
        previewContainer.innerHTML = `<div class="details-icon">📦</div>`;
        document.getElementById("details-name").innerText = `${selectedFiles.size} elementos seleccionados`;
        document.getElementById("details-info").innerText = "Selección múltiple";
        document.getElementById("details-size").innerText = "Varios";
    }
}

/* ============================================================================== */
/* UI CONTROLLERS (KEYPRESSES, TOGGLES & MODALS) */
/* ============================================================================== */

document.getElementById("sort-select").addEventListener("change", () => {
    processAndRenderFiles(searchMode === "LOCAL" ? allFilesInCurrentPath : globalFiles);
});

// Earth/Folder mode switch delegator
document.getElementById("btn-search-mode").onclick = (e) => {
    if (searchMode === "LOCAL") {
        searchMode = "GLOBAL";
        e.target.innerText = "🌍";
        e.target.classList.add("search-mode-global");
        document.getElementById("search-input").placeholder = "Buscar en el PC...";
    } else {
        searchMode = "LOCAL";
        e.target.innerText = "📁";
        e.target.classList.remove("search-mode-global");
        document.getElementById("search-input").placeholder = "Buscar local...";
        eel.stop_global_search()();
        loadDirectory(currentPath);
    }
};

// Keypress Listener implementation for active queries 
document.getElementById("search-input").addEventListener("input", function (e) {
    const term = e.target.value.toLowerCase();

    if (searchMode === "LOCAL") {
        processAndRenderFiles(allFilesInCurrentPath.filter(f => f.name.toLowerCase().includes(term)));
    } else {
        if (term.length >= 3) {
            globalFiles = []; 
            document.getElementById("file-grid").innerHTML = "<h3 style='grid-column:1/-1; text-align:center;'>Buscando en todo el sistema...</h3>";
            eel.stop_global_search()();
            eel.start_global_search(term)();
        } else if (term.length === 0) {
            globalFiles = [];
            eel.stop_global_search()();
            document.getElementById("file-grid").innerHTML = "<h3 style='grid-column:1/-1; text-align:center;'>Escribe al menos 3 letras para buscar globalmente</h3>";
        }
    }
});

// OS Async Python Callback Exposer handler
eel.expose(add_search_result);
function add_search_result(file) {
    globalFiles.push(file); 
    const grid = document.getElementById("file-grid");
    
    if (grid.innerHTML.includes("Buscando en todo el sistema") || grid.innerHTML.includes("Escribe al menos")) {
        grid.innerHTML = "<div class='group-header'>Resultados Globales</div>";
    }

    const div = document.createElement("div");
    div.className = "item";
    div.dataset.path = file.path;
    const isImage = ['png', 'jpg', 'jpeg', 'gif'].includes(file.name.split('.').pop().toLowerCase()) && file.type !== "DIR";
    div.innerHTML = `<div class="icon">${getIcon(file.name, file.type)}</div><div class="item-name" title="${file.name}">${file.name}</div>`;

    div.onclick = (e) => {
        if (!e.ctrlKey) { selectedFiles.clear(); Array.from(grid.children).forEach(c => c.classList?.remove("selected")); }
        selectedFiles.add(file.path);
        div.classList.add("selected");
        updateDetailsPanel(file, file.path, isImage);
    };
    
    div.ondblclick = () => file.type === "DIR" ? loadDirectory(file.path) : eel.open_file(file.path)();
    grid.appendChild(div);
}

/* ============================================================================== */
/* NATIVE OS FILESYSTEM ABSTRACTION (MOVE, DELETE, GO BACK) */
/* ============================================================================== */
document.getElementById("btn-delete").onclick = async () => {
    if (confirm(`¿Mandar ${selectedFiles.size} elemento(s) a la papelera?`)) {
        await eel.delete_items(Array.from(selectedFiles))(); 
        loadDirectory(currentPath);
    }
};

document.getElementById("btn-cut").onclick = () => {
    clipboard = { action: 'cut', files: Array.from(selectedFiles) };
    document.getElementById("btn-paste").style.display = "block";
};

document.getElementById("btn-paste").onclick = async () => {
    if (clipboard.action === 'cut' && clipboard.files.length > 0) {
        await eel.move_items(clipboard.files, currentPath)();
        clipboard = { action: null, files: [] }; 
        document.getElementById("btn-paste").style.display = "none";
        loadDirectory(currentPath); 
    }
};

// Tree directory traversing mapping
document.getElementById("btn-back").onclick = () => {
    let sep = currentPath.includes("\\") ? "\\" : "/";
    let parts = currentPath.split(sep).filter(p => p !== "");
    
    if (parts.length > 1) { 
        parts.pop(); 
        loadDirectory(parts.join(sep) + (currentPath.includes("\\") ? sep : "")); 
    }
};

document.getElementById("btn-go").onclick = () => loadDirectory(document.getElementById("path-input").value);
document.getElementById("path-input").addEventListener("keypress", (e) => { if (e.key === "Enter") { e.preventDefault(); loadDirectory(e.target.value); } });

/* ============================================================================== */
/* DYNAMIC DOM MANIPULATION (GRID/LIST VIEWS & ZOOMS) */
/* ============================================================================== */
let currentView = "grid"; 

document.getElementById("btn-view-toggle").onclick = (e) => {
    const grid = document.getElementById("file-grid");
    if (currentView === "grid") {
        currentView = "list";
        e.target.innerText = "🔲 Mosaico";
        grid.className = "file-list"; 
    } else {
        currentView = "grid";
        e.target.innerText = "📄 Lista";
        grid.className = "file-grid";
    }
};

// Range Slider Multiplier CSS bindings
document.getElementById("size-slider").addEventListener("input", (e) => {
    const factor = e.target.value / 100;
    
    document.documentElement.style.setProperty("--item-size", `${110 * factor}px`);
    document.documentElement.style.setProperty("--icon-size", `${40 * factor}px`);
    document.documentElement.style.setProperty("--font-size", `${Math.max(10, 12 * factor)}px`);
});