# file_explorer

> Explorador de archivos de escritorio moderno con interfaz **Glassmorphism**, motor de escaneo en **C++** y comunicación en tiempo real vía **Python + Eel**.

---

## Requisitos

Asegúrate de tener instalado lo siguiente antes de ejecutar el proyecto:

### 1. Python 3.8+
Descarga desde [python.org](https://www.python.org/downloads/)
>  Durante la instalación en Windows, marca la casilla **"Add Python to PATH"**

### 2. GCC / G++ — Compilador C++

| Sistema | Comando / Instalador |
|---------|----------------------|
| **Windows** | [MinGW-w64](https://www.mingw-w64.org/) o [MSYS2](https://www.msys2.org/) → añade la carpeta `bin` al PATH |
| **Linux (Debian/Ubuntu)** | `sudo apt install g++` |
| **Linux (Arch)** | `sudo pacman -S gcc` |
| **macOS** | `xcode-select --install` |

### 3. Dependencias Python

```bash
pip install eel send2trash
```

>  La librería C++ (`scanner.dll` / `scanner.so`) **se compila automáticamente** al ejecutar el programa por primera vez, siempre que `g++` esté en el PATH.

---

## Cómo ejecutar el programa

```bash
# 1. Clona el repositorio
git clone https://github.com/tu-usuario/pro-pastel-explorer.git
cd pro-pastel-explorer

# 2. Instala las dependencias (solo la primera vez)
pip install eel send2trash

# 3. Ejecuta
python main.py
```

Al iniciarse, el programa compilará automáticamente el motor C++ y abrirá la interfaz gráfica.

---

## Descripción

Aplicación de escritorio que combina tecnologías web con un backend en Python y un motor de alto rendimiento en C++, ofreciendo navegación eficiente, búsqueda global en tiempo real y manipulación de archivos con diseño moderno.

---

## Tecnologías Utilizadas

| Capa | Tecnología |
|------|------------|
| Frontend | HTML5, Vanilla CSS, JavaScript |
| Comunicación | [Eel](https://github.com/python-eel/Eel) (WebSockets) |
| Backend | Python 3, threading, ctypes |
| Motor Core | C++17 (`<filesystem>`) → DLL/SO |
| Utilidades | `os`, `shutil`, `send2trash`, `base64` |

---

## Arquitectura

```
Frontend (JavaScript)
        ↓  Eel WebSocket
Backend (Python)
        ↓  ctypes
    Motor C++  ←→  Sistema de archivos del OS
```

### Flujo de funcionamiento

1. Python detecta el SO y auto-compila/carga la librería C++
2. El frontend solicita datos mediante Eel
3. Python delega el escaneo pesado al motor C++
4. C++ devuelve resultados en formato crudo delimitado
5. Python estructura la información y la envía al frontend
6. JavaScript renderiza los resultados en la interfaz

---

## Funcionalidades

### Navegación
- Exploración de carpetas con historial de navegación
- Vista en **Grilla (Mosaico)** y **Lista (Cascada)** intercambiables
- Ordenamiento por nombre, fecha, tamaño y tipo

### Búsqueda
- **Local**: filtrado instantáneo en JavaScript sin llamadas al servidor
- **Global**: búsqueda recursiva del sistema con multithreading en Python
- Resultados en tiempo real enviados al frontend (efecto "waterfall")

### Operaciones sobre archivos
- Apertura con la aplicación predeterminada del sistema
- Soporte para el diálogo "**Abrir con…**" (WinError 1155)
- Cortar / Pegar archivos entre carpetas
- Eliminación segura a la **Papelera de Reciclaje**

### Vista previa
- Previsualización de imágenes en panel lateral via Base64
- Límite de 5 MB para evitar saturación de memoria
- Cálculo de tamaño de carpetas **bajo demanda** (motor C++)

---

## Estructura del Proyecto

```
explorador_proyecto/
│
├── main.py               ← Servidor principal Python + Eel
├── requirements.txt
├── README.md
│
├── core/
│   ├── scanner.cpp       ← Motor C++17 de escaneo
│   └── scanner.dll/.so   ← Compilado automáticamente
│
└── web/
    ├── index.html
    ├── script.js
    └── style.css
```

---

## Aspectos Destacados

- Integración nativa entre **Python y C++** mediante `ctypes`
- Comunicación bidireccional en tiempo real entre **frontend y backend**
- Búsqueda asíncrona con **control de cancelación por token** para evitar hilos zombie
- **Concurrencia segura** con `threading.Lock` para prevenir condiciones de carrera
- Diseño **Glassmorphism** moderno con animaciones CSS `cubic-bezier` fluidas

---

## Posibles Mejoras

- [ ] Indexación persistente para búsquedas instantáneas
- [ ] Integración con base de datos local
- [ ] Soporte para drag & drop
- [ ] Sistema de favoritos / accesos rápidos
- [ ] Migración a framework moderno de frontend (React / Vue)
