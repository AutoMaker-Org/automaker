#!/bin/bash
# Automaker TUI Launcher - Interactive menu for launching Automaker in different modes
# Supports: Web Browser, Desktop (Electron), Docker Dev, Electron + Docker API
# Platforms: Linux, macOS, Windows (Git Bash, WSL, MSYS2, Cygwin)
# Features: Terminal responsiveness, history, pre-flight checks, port management

set -e

# ============================================================================
# CONFIGURATION & CONSTANTS
# ============================================================================
export $(grep -v '^#' .env | xargs)
APP_NAME="Automaker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HISTORY_FILE="${HOME}/.automaker_launcher_history"
MIN_TERM_WIDTH=70
MIN_TERM_HEIGHT=20
MENU_BOX_WIDTH=66
MENU_INNER_WIDTH=64
LOGO_WIDTH=52
INPUT_TIMEOUT=30
SELECTED_OPTION=1
MAX_OPTIONS=4

# Platform detection (set early for cross-platform compatibility)
IS_WINDOWS=false
IS_MACOS=false
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "mingw"* ]]; then
    IS_WINDOWS=true
elif [[ "$OSTYPE" == "darwin"* ]]; then
    IS_MACOS=true
fi

# Port configuration
DEFAULT_WEB_PORT=3007
DEFAULT_SERVER_PORT=3008
PORT_SEARCH_MAX_ATTEMPTS=100
WEB_PORT=$DEFAULT_WEB_PORT
SERVER_PORT=$DEFAULT_SERVER_PORT

# Port validation function
# Returns 0 if valid, 1 if invalid (with error message printed)
validate_port() {
    local port="$1"
    local port_name="${2:-port}"

    # Check if port is a number
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
        echo "${C_RED}Error:${RESET} $port_name must be a number, got '$port'"
        return 1
    fi

    # Check if port is in valid range (1-65535)
    if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
        echo "${C_RED}Error:${RESET} $port_name must be between 1-65535, got '$port'"
        return 1
    fi

    # Check if port is in privileged range (warning only)
    if [ "$port" -lt 1024 ]; then
        echo "${C_YELLOW}Warning:${RESET} $port_name $port is in privileged range (requires root/admin)"
    fi

    return 0
}

# Hostname configuration
# Use VITE_HOSTNAME if explicitly set, otherwise default to localhost
# Note: Don't use $HOSTNAME as it's a bash built-in containing the machine's hostname
APP_HOST="${VITE_HOSTNAME:-localhost}"

# Extract VERSION from apps/ui/package.json (the actual app version, not monorepo version)
if command -v node &> /dev/null; then
    VERSION="v$(node -p "require('$SCRIPT_DIR/apps/ui/package.json').version" 2>/dev/null || echo "0.11.0")"
else
    VERSION=$(grep '"version"' "$SCRIPT_DIR/apps/ui/package.json" 2>/dev/null | head -1 | sed 's/.*"version"[^"]*"\([^"]*\)".*/v\1/' || echo "v0.11.0")
fi

# ANSI Color codes (256-color palette)
ESC=$(printf '\033')
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"

C_PRI="${ESC}[38;5;51m"   # Primary cyan
C_SEC="${ESC}[38;5;39m"   # Secondary blue
C_ACC="${ESC}[38;5;33m"   # Accent darker blue
C_GREEN="${ESC}[38;5;118m" # Green
C_RED="${ESC}[38;5;196m"   # Red
C_YELLOW="${ESC}[38;5;226m" # Yellow
C_GRAY="${ESC}[38;5;240m"  # Dark gray
C_WHITE="${ESC}[38;5;255m" # White
C_MUTE="${ESC}[38;5;248m"  # Muted gray

# ============================================================================
# ARGUMENT PARSING
# ============================================================================

MODE=""
USE_COLORS=true
CHECK_DEPS=false
NO_HISTORY=false
PRODUCTION_MODE=false

show_help() {
    cat << 'EOF'
Automaker TUI Launcher - Interactive development environment starter

USAGE:
  start-automaker.sh [MODE] [OPTIONS]

MODES:
  web              Launch in web browser (localhost:3007)
  electron         Launch as desktop app (Electron)
  docker           Launch in Docker container (dev with live reload)
  docker-electron  Launch Electron with Docker API backend

OPTIONS:
  --help           Show this help message
  --version        Show version information
  --no-colors      Disable colored output
  --check-deps     Check dependencies before launching
  --no-history     Don't remember last choice
  --production     Run in production mode (builds first, faster React)

EXAMPLES:
  start-automaker.sh              # Interactive menu (development)
  start-automaker.sh --production # Interactive menu (production)
  start-automaker.sh web          # Launch web mode directly (dev)
  start-automaker.sh web --production  # Launch web mode (production)
  start-automaker.sh electron     # Launch desktop app directly
  start-automaker.sh docker       # Launch Docker dev container
  start-automaker.sh --version    # Show version

KEYBOARD SHORTCUTS (in menu):
  Up/Down arrows   Navigate between options
  Enter            Select highlighted option
  1-4              Jump to and select mode
  Q                Exit

HISTORY:
  Your last selected mode is remembered in: ~/.automaker_launcher_history
  Use --no-history to disable this feature

PLATFORMS:
  Linux, macOS, Windows (Git Bash, WSL, MSYS2, Cygwin)

EOF
}

show_version() {
    echo "Automaker Launcher $VERSION"
    echo "Node.js: $(node -v 2>/dev/null || echo 'not installed')"
    echo "Bash: ${BASH_VERSION%.*}"
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --help)
                show_help
                exit 0
                ;;
            --version)
                show_version
                exit 0
                ;;
            --no-colors)
                USE_COLORS=false
                RESET=""
                C_PRI="" C_SEC="" C_ACC="" C_GREEN="" C_RED="" C_YELLOW="" C_GRAY="" C_WHITE="" C_MUTE=""
                ;;
            --check-deps)
                CHECK_DEPS=true
                ;;
            --no-history)
                NO_HISTORY=true
                ;;
            --production)
                PRODUCTION_MODE=true
                ;;
            web|electron|docker|docker-electron)
                MODE="$1"
                ;;
            *)
                echo "Unknown option: $1" >&2
                echo "Use --help for usage information" >&2
                exit 1
                ;;
        esac
        shift
    done
}

# ============================================================================
# PRE-FLIGHT CHECKS
# ============================================================================

check_platform() {
    # Platform already detected at script start
    # This function is kept for any additional platform-specific checks
    if [ "$IS_WINDOWS" = true ]; then
        # Check if running in a proper terminal
        if [ -z "$TERM" ]; then
            echo "${C_YELLOW}Warning:${RESET} Running on Windows without proper terminal."
            echo "For best experience, use Git Bash, WSL, or Windows Terminal."
        fi
    fi
}

check_required_commands() {
    local missing=()

    # Check for required commands
    for cmd in node npm tput; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        echo "${C_RED}Error:${RESET} Missing required commands: ${missing[*]}"
        echo ""
        echo "Please install:"
        for cmd in "${missing[@]}"; do
            case "$cmd" in
                node|npm) echo "  - Node.js (includes npm) from https://nodejs.org/" ;;
                tput) echo "  - ncurses package (usually pre-installed on Unix systems)" ;;
            esac
        done
        exit 1
    fi
}

DOCKER_CMD="docker"

check_docker() {
    if ! command -v docker &> /dev/null; then
        echo "${C_RED}Error:${RESET} Docker is not installed or not in PATH"
        echo "Please install Docker from https://docs.docker.com/get-docker/"
        return 1
    fi

    if ! docker info &> /dev/null 2>&1; then
        if sg docker -c "docker info" &> /dev/null 2>&1; then
            DOCKER_CMD="sg docker -c"
        else
            echo "${C_RED}Error:${RESET} Docker daemon is not running or not accessible"
            echo ""
            echo "To fix, run:"
            echo "  sudo usermod -aG docker \$USER"
            echo ""
            echo "Then either log out and back in, or run:"
            echo "  newgrp docker"
            return 1
        fi
    fi

    export DOCKER_CMD
    return 0
}

check_running_electron() {
    local electron_pids=""

    if [ "$IS_WINDOWS" = true ]; then
        # Windows: look for electron.exe or Automaker.exe
        electron_pids=$(tasklist 2>/dev/null | grep -iE "electron|automaker" | awk '{print $2}' | tr '\n' ' ' || true)
    else
        # Unix: look for electron or Automaker processes
        electron_pids=$(pgrep -f "electron.*automaker|Automaker" 2>/dev/null | tr '\n' ' ' || true)
    fi

    if [ -n "$electron_pids" ] && [ "$electron_pids" != " " ]; then
        get_term_size
        echo ""
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        center_print "Running Electron App Detected" "$C_YELLOW"
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        echo ""
        center_print "Electron process(es): $electron_pids" "$C_MUTE"
        echo ""
        center_print "What would you like to do?" "$C_WHITE"
        echo ""
        center_print "[K] Kill Electron and continue" "$C_GREEN"
        center_print "[I] Ignore and continue anyway" "$C_MUTE"
        center_print "[C] Cancel" "$C_RED"
        echo ""

        while true; do
            local choice_pad=$(( (TERM_COLS - 20) / 2 ))
            printf "%${choice_pad}s" ""
            read -r -p "Choice: " choice

            case "$choice" in
                [kK]|[kK][iI][lL][lL])
                    echo ""
                    center_print "Killing Electron processes..." "$C_YELLOW"
                    if [ "$IS_WINDOWS" = true ]; then
                        taskkill //F //IM "electron.exe" 2>/dev/null || true
                        taskkill //F //IM "Automaker.exe" 2>/dev/null || true
                    else
                        pkill -f "electron.*automaker" 2>/dev/null || true
                        pkill -f "Automaker" 2>/dev/null || true
                    fi
                    sleep 1
                    center_print "✓ Electron stopped" "$C_GREEN"
                    echo ""
                    return 0
                    ;;
                [iI]|[iI][gG][nN][oO][rR][eE])
                    echo ""
                    center_print "Continuing without stopping Electron..." "$C_MUTE"
                    echo ""
                    return 0
                    ;;
                [cC]|[cC][aA][nN][cC][eE][lL])
                    echo ""
                    center_print "Cancelled." "$C_MUTE"
                    echo ""
                    exit 0
                    ;;
                *)
                    center_print "Invalid choice. Please enter K, I, or C." "$C_RED"
                    ;;
            esac
        done
    fi

    return 0
}

check_running_containers() {
    local compose_file="$1"
    local running_containers=""

    # Get list of running automaker containers
    if [ "$DOCKER_CMD" = "sg docker -c" ]; then
        running_containers=$(sg docker -c "docker ps --filter 'name=automaker-dev' --format '{{{{Names}}}}'" 2>/dev/null | tr '\n' ' ' || true)
    else
        running_containers=$($DOCKER_CMD ps --filter "name=automaker-dev" --format "{{.Names}}" 2>/dev/null | tr '\n' ' ' || true)
    fi

    if [ -n "$running_containers" ] && [ "$running_containers" != " " ]; then
        get_term_size
        echo ""
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        center_print "Existing Containers Detected" "$C_YELLOW"
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        echo ""
        center_print "Running containers: $running_containers" "$C_MUTE"
        echo ""
        center_print "What would you like to do?" "$C_WHITE"
        echo ""
        center_print "[S] Stop containers and start fresh" "$C_GREEN"
        center_print "[R] Restart containers (rebuild)" "$C_MUTE"
        center_print "[A] Attach to existing containers" "$C_MUTE"
        center_print "[C] Cancel" "$C_RED"
        echo ""

        while true; do
            local choice_pad=$(( (TERM_COLS - 20) / 2 ))
            printf "%${choice_pad}s" ""
            read -r -p "Choice: " choice

            case "$choice" in
                [sS]|[sS][tT][oO][pP])
                    echo ""
                    center_print "Stopping existing containers..." "$C_YELLOW"
                    if [ "$DOCKER_CMD" = "sg docker -c" ]; then
                        sg docker -c "docker compose -f '$compose_file' down" 2>/dev/null || true
                        sg docker -c "docker ps --filter 'name=automaker-dev' -q" 2>/dev/null | xargs -r sg docker -c "docker stop" 2>/dev/null || true
                    else
                        $DOCKER_CMD compose -f "$compose_file" down 2>/dev/null || true
                        $DOCKER_CMD ps --filter "name=automaker-dev" -q 2>/dev/null | xargs -r $DOCKER_CMD stop 2>/dev/null || true
                    fi
                    center_print "✓ Containers stopped" "$C_GREEN"
                    echo ""
                    return 0  # Continue with fresh start
                    ;;
                [rR]|[rR][eE][sS][tT][aA][rR][tT])
                    echo ""
                    center_print "Stopping and rebuilding containers..." "$C_YELLOW"
                    if [ "$DOCKER_CMD" = "sg docker -c" ]; then
                        sg docker -c "docker compose -f '$compose_file' down" 2>/dev/null || true
                    else
                        $DOCKER_CMD compose -f "$compose_file" down 2>/dev/null || true
                    fi
                    center_print "✓ Ready to rebuild" "$C_GREEN"
                    echo ""
                    return 0  # Continue with rebuild
                    ;;
                [aA]|[aA][tT][tT][aA][cC][hH])
                    echo ""
                    center_print "Attaching to existing containers..." "$C_GREEN"
                    echo ""
                    return 2  # Special code for attach
                    ;;
                [cC]|[cC][aA][nN][cC][eE][lL])
                    echo ""
                    center_print "Cancelled." "$C_MUTE"
                    echo ""
                    exit 0
                    ;;
                *)
                    center_print "Invalid choice. Please enter S, R, A, or C." "$C_RED"
                    ;;
            esac
        done
    fi

    return 0  # No containers running, continue normally
}

check_dependencies() {
    if [ "$CHECK_DEPS" = false ]; then
        return 0
    fi

    echo "${C_MUTE}Checking project dependencies...${RESET}"

    if [ ! -d "node_modules" ]; then
        echo "${C_YELLOW}⚠${RESET}  node_modules not found. Run 'npm install' before launching."
        return 1
    fi

    if [ ! -f "package-lock.json" ]; then
        echo "${C_YELLOW}⚠${RESET}  package-lock.json not found."
    fi

    return 0
}

# ============================================================================
# PORT MANAGEMENT (Cross-platform)
# ============================================================================

get_pids_on_port() {
    local port=$1

    if [ "$IS_WINDOWS" = true ]; then
        # Windows: use netstat
        netstat -ano 2>/dev/null | grep ":$port " | grep "LISTENING" | awk '{print $5}' | sort -u | tr '\n' ' ' || true
    else
        # Unix: use lsof
        lsof -ti:"$port" 2>/dev/null || true
    fi
}

is_port_in_use() {
    local port=$1
    local pids
    pids=$(get_pids_on_port "$port")
    [ -n "$pids" ] && [ "$pids" != " " ]
}

# Find the next available port starting from a given port
# Returns the port on stdout if found, nothing if all ports in range are busy
# Exit code: 0 if found, 1 if no available port in range
find_next_available_port() {
    local start_port=$1
    local port=$start_port

    for ((i=0; i<PORT_SEARCH_MAX_ATTEMPTS; i++)); do
        if ! is_port_in_use "$port"; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
    done

    # No free port found in the scan range
    return 1
}

kill_port() {
    local port=$1
    local pids
    pids=$(get_pids_on_port "$port")

    if [ -z "$pids" ] || [ "$pids" = " " ]; then
        echo "${C_GREEN}✓${RESET} Port $port is available"
        return 0
    fi

    echo "${C_YELLOW}Killing process(es) on port $port: $pids${RESET}"

    if [ "$IS_WINDOWS" = true ]; then
        # Windows: use taskkill
        for pid in $pids; do
            taskkill //F //PID "$pid" 2>/dev/null || true
        done
    else
        # Unix: use kill
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi

    # Wait for port to be freed
    local i=0
    while [ $i -lt 10 ]; do
        sleep 0.5 2>/dev/null || sleep 1
        if ! is_port_in_use "$port"; then
            echo "${C_GREEN}✓${RESET} Port $port is now free"
            return 0
        fi
        i=$((i + 1))
    done

    echo "${C_RED}Warning:${RESET} Port $port may still be in use"
    return 1
}

check_ports() {
    # Auto-discover available ports (no user interaction required)
    local web_in_use=false
    local server_in_use=false

    if is_port_in_use "$DEFAULT_WEB_PORT"; then
        web_in_use=true
    fi
    if is_port_in_use "$DEFAULT_SERVER_PORT"; then
        server_in_use=true
    fi

    if [ "$web_in_use" = true ] || [ "$server_in_use" = true ]; then
        echo ""
        local max_port
        if [ "$web_in_use" = true ]; then
            local pids
            # Get PIDs and convert newlines to spaces for display
            pids=$(get_pids_on_port "$DEFAULT_WEB_PORT" | xargs)
            echo "${C_YELLOW}Port $DEFAULT_WEB_PORT in use (PID: $pids), finding alternative...${RESET}"
            max_port=$((DEFAULT_WEB_PORT + PORT_SEARCH_MAX_ATTEMPTS - 1))
            if ! WEB_PORT=$(find_next_available_port "$DEFAULT_WEB_PORT"); then
                echo "${C_RED}Error: No free web port in range ${DEFAULT_WEB_PORT}-${max_port}${RESET}"
                exit 1
            fi
        fi
        if [ "$server_in_use" = true ]; then
            local pids
            # Get PIDs and convert newlines to spaces for display
            pids=$(get_pids_on_port "$DEFAULT_SERVER_PORT" | xargs)
            echo "${C_YELLOW}Port $DEFAULT_SERVER_PORT in use (PID: $pids), finding alternative...${RESET}"
            max_port=$((DEFAULT_SERVER_PORT + PORT_SEARCH_MAX_ATTEMPTS - 1))
            if ! SERVER_PORT=$(find_next_available_port "$DEFAULT_SERVER_PORT"); then
                echo "${C_RED}Error: No free server port in range ${DEFAULT_SERVER_PORT}-${max_port}${RESET}"
                exit 1
            fi
        fi

        # Ensure web and server ports don't conflict with each other
        if [ "$WEB_PORT" -eq "$SERVER_PORT" ]; then
            local conflict_start=$((SERVER_PORT + 1))
            max_port=$((conflict_start + PORT_SEARCH_MAX_ATTEMPTS - 1))
            if ! SERVER_PORT=$(find_next_available_port "$conflict_start"); then
                echo "${C_RED}Error: No free server port in range ${conflict_start}-${max_port}${RESET}"
                exit 1
            fi
        fi

        echo ""
        echo "${C_GREEN}✓ Auto-selected available ports: Web=$WEB_PORT, Server=$SERVER_PORT${RESET}"
    else
        echo "${C_GREEN}✓${RESET} Port $DEFAULT_WEB_PORT is available"
        echo "${C_GREEN}✓${RESET} Port $DEFAULT_SERVER_PORT is available"
    fi
}

validate_terminal_size() {
    if [ "$USE_COLORS" = false ]; then
        return 0
    fi

    local term_width term_height
    term_width=$(tput cols 2>/dev/null || echo 80)
    term_height=$(tput lines 2>/dev/null || echo 24)

    if [ "$term_width" -lt "$MIN_TERM_WIDTH" ] || [ "$term_height" -lt "$MIN_TERM_HEIGHT" ]; then
        echo "${C_YELLOW}⚠${RESET}  Terminal size ${term_width}x${term_height} is smaller than recommended ${MIN_TERM_WIDTH}x${MIN_TERM_HEIGHT}"
        echo "    Some elements may not display correctly."
        echo ""
        return 0
    fi
}

# ============================================================================
# CURSOR & CLEANUP
# ============================================================================

hide_cursor() {
    [ "$USE_COLORS" = true ] && printf "${ESC}[?25l"
}

show_cursor() {
    [ "$USE_COLORS" = true ] && printf "${ESC}[?25h"
}

cleanup() {
    show_cursor
    # Restore terminal settings (echo and canonical mode)
    stty echo icanon 2>/dev/null || true
    # Kill server process if running in production mode
    if [ -n "${SERVER_PID:-}" ]; then
        kill $SERVER_PID 2>/dev/null || true
    fi
    printf "${RESET}\n"
}

trap cleanup EXIT INT TERM

# ============================================================================
# TERMINAL SIZE & UI UTILITIES
# ============================================================================

get_term_size() {
    TERM_COLS=$(tput cols 2>/dev/null || echo 80)
    TERM_LINES=$(tput lines 2>/dev/null || echo 24)
}

center_text() {
    local text="$1"
    local len=${#text}
    local pad=$(( (TERM_COLS - len) / 2 ))
    printf "%${pad}s%s\n" "" "$text"
}

draw_line() {
    local char="${1:-─}"
    local color="${2:-$C_GRAY}"
    local width="${3:-58}"
    printf "${color}"
    for ((i=0; i<width; i++)); do printf "%s" "$char"; done
    printf "${RESET}"
}

# ============================================================================
# UI DISPLAY FUNCTIONS
# ============================================================================

show_header() {
    clear
    get_term_size

    # Top padding
    local top_pad=$(( TERM_LINES / 6 ))
    for ((i=0; i<top_pad; i++)); do echo ""; done

    # Automaker ASCII art logo
    local l1="  █▀▀█ █  █ ▀▀█▀▀ █▀▀█ █▀▄▀█ █▀▀█ █ █ █▀▀ █▀▀█  "
    local l2="  █▄▄█ █  █   █   █  █ █ ▀ █ █▄▄█ █▀▄ █▀▀ █▄▄▀  "
    local l3="  ▀  ▀  ▀▀▀   ▀   ▀▀▀▀ ▀   ▀ ▀  ▀ ▀ ▀ ▀▀▀ ▀ ▀▀  "

    local pad_left=$(( (TERM_COLS - LOGO_WIDTH) / 2 ))
    local pad=$(printf "%${pad_left}s" "")

    echo -e "${pad}${C_PRI}${l1}${RESET}"
    echo -e "${pad}${C_SEC}${l2}${RESET}"
    echo -e "${pad}${C_ACC}${l3}${RESET}"

    echo ""
    local mode_indicator=""
    if [ "$PRODUCTION_MODE" = true ]; then
        mode_indicator="${C_GREEN}[PRODUCTION]${RESET}"
    else
        mode_indicator="${C_YELLOW}[DEVELOPMENT]${RESET}"
    fi
    local sub_display_len=60
    local sub_pad=$(( (TERM_COLS - sub_display_len) / 2 ))
    printf "%${sub_pad}s" ""
    echo -e "${C_MUTE}Autonomous AI Development Studio${RESET}  ${C_GRAY}│${RESET}  ${C_GREEN}${VERSION}${RESET}  ${mode_indicator}"

    echo ""
    echo ""
}

show_menu() {
    local pad_left=$(( (TERM_COLS - MENU_BOX_WIDTH) / 2 ))
    local pad=$(printf "%${pad_left}s" "")
    local border="${C_GRAY}│${RESET}"

    printf "%s${C_GRAY}╭" "$pad"
    draw_line "─" "$C_GRAY" "$MENU_INNER_WIDTH"
    printf "╮${RESET}\n"

    # Menu items with selection indicator
    local sel1="" sel2="" sel3="" sel4=""
    local txt1="${C_MUTE}" txt2="${C_MUTE}" txt3="${C_MUTE}" txt4="${C_MUTE}"

    case $SELECTED_OPTION in
        1) sel1="${C_ACC}▸${RESET} ${C_PRI}"; txt1="${C_WHITE}" ;;
        2) sel2="${C_ACC}▸${RESET} ${C_PRI}"; txt2="${C_WHITE}" ;;
        3) sel3="${C_ACC}▸${RESET} ${C_PRI}"; txt3="${C_WHITE}" ;;
        4) sel4="${C_ACC}▸${RESET} ${C_PRI}"; txt4="${C_WHITE}" ;;
    esac

    # Default non-selected prefix
    [[ -z "$sel1" ]] && sel1="  ${C_MUTE}"
    [[ -z "$sel2" ]] && sel2="  ${C_MUTE}"
    [[ -z "$sel3" ]] && sel3="  ${C_MUTE}"
    [[ -z "$sel4" ]] && sel4="  ${C_MUTE}"

    printf "%s${border}${sel1}[1]${RESET} 🌐  ${txt1}Web App${RESET}           ${C_MUTE}Server + Browser (localhost:$WEB_PORT)${RESET}   ${border}\n" "$pad"
    printf "%s${border}${sel2}[2]${RESET} 🖥   ${txt2}Electron${RESET}          ${DIM}Desktop App (embedded server)${RESET}       ${border}\n" "$pad"
    printf "%s${border}${sel3}[3]${RESET} 🐳  ${txt3}Docker${RESET}            ${DIM}Full Stack (live reload)${RESET}            ${border}\n" "$pad"
    printf "%s${border}${sel4}[4]${RESET} 🔗  ${txt4}Electron & Docker${RESET} ${DIM}Desktop + Docker Server${RESET}             ${border}\n" "$pad"

    printf "%s${C_GRAY}├" "$pad"
    draw_line "─" "$C_GRAY" "$MENU_INNER_WIDTH"
    printf "┤${RESET}\n"

    printf "%s${border}    ${C_RED}[Q]${RESET} ⏻   ${C_MUTE}Exit${RESET}                                                ${border}\n" "$pad"

    printf "%s${C_GRAY}╰" "$pad"
    draw_line "─" "$C_GRAY" "$MENU_INNER_WIDTH"
    printf "╯${RESET}\n"

    echo ""
    local footer_text="[↑↓] Navigate  [Enter] Select  [1-4] Quick Select  [Q] Exit"
    local f_pad=$(( (TERM_COLS - ${#footer_text}) / 2 ))
    printf "%${f_pad}s" ""
    echo -e "${DIM}${footer_text}${RESET}"

    if [ -f "$HISTORY_FILE" ]; then
        local last_mode
        last_mode=$(cat "$HISTORY_FILE" 2>/dev/null || echo "")
        if [ -n "$last_mode" ]; then
            local hint_text="(Last: $last_mode)"
            local h_pad=$(( (TERM_COLS - ${#hint_text}) / 2 ))
            printf "%${h_pad}s" ""
            echo -e "${DIM}${hint_text}${RESET}"
        fi
    fi
}

# ============================================================================
# SPINNER & INITIALIZATION
# ============================================================================

spinner() {
    local text="$1"
    local -a frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    local count=0
    local max_frames=20  # Max 2 seconds

    # Ensure TERM_COLS is set
    [ -z "$TERM_COLS" ] && TERM_COLS=80

    while [ $count -lt $max_frames ]; do
        local len=${#text}
        local pad_left=$(( (TERM_COLS - len - 4) / 2 ))
        [ $pad_left -lt 0 ] && pad_left=0
        printf "\r%${pad_left}s${C_PRI}${frames[$i]}${RESET} ${C_WHITE}%s${RESET}" "" "$text"
        i=$(( (i + 1) % ${#frames[@]} ))
        count=$((count + 1))
        sleep 0.1 2>/dev/null || sleep 1
    done

    local len=${#text}
    local pad_left=$(( (TERM_COLS - len - 4) / 2 ))
    [ $pad_left -lt 0 ] && pad_left=0
    printf "\r%${pad_left}s${C_GREEN}✓${RESET} ${C_WHITE}%s${RESET}   \n" "" "$text"
}

center_print() {
    local text="$1"
    local color="${2:-}"
    local len=${#text}
    local pad=$(( (TERM_COLS - len) / 2 ))
    [ $pad -lt 0 ] && pad=0
    printf "%${pad}s${color}%s${RESET}\n" "" "$text"
}

resolve_port_conflicts() {
    # Ensure terminal is in proper state for input
    show_cursor
    stty echo icanon 2>/dev/null || true

    local web_in_use=false
    local server_in_use=false
    local web_pids=""
    local server_pids=""

    if is_port_in_use "$DEFAULT_WEB_PORT"; then
        web_in_use=true
        # Get PIDs and convert newlines to spaces for display
        web_pids=$(get_pids_on_port "$DEFAULT_WEB_PORT" | xargs)
    fi
    if is_port_in_use "$DEFAULT_SERVER_PORT"; then
        server_in_use=true
        # Get PIDs and convert newlines to spaces for display
        server_pids=$(get_pids_on_port "$DEFAULT_SERVER_PORT" | xargs)
    fi

    if [ "$web_in_use" = true ] || [ "$server_in_use" = true ]; then
        echo ""
        if [ "$web_in_use" = true ]; then
            center_print "Port $DEFAULT_WEB_PORT in use (PID: $web_pids)" "$C_YELLOW"
        fi
        if [ "$server_in_use" = true ]; then
            center_print "Port $DEFAULT_SERVER_PORT in use (PID: $server_pids)" "$C_YELLOW"
        fi
        echo ""

        # Show options
        center_print "What would you like to do?" "$C_WHITE"
        echo ""
        center_print "[Enter] Auto-select available ports (Recommended)" "$C_GREEN"
        center_print "[K] Kill processes and use default ports" "$C_MUTE"
        center_print "[C] Choose custom ports" "$C_MUTE"
        center_print "[X] Cancel" "$C_RED"
        echo ""

        while true; do
            local choice_pad=$(( (TERM_COLS - 20) / 2 ))
            printf "%${choice_pad}s" ""
            read -r -p "Choice [Enter]: " choice

            case "$choice" in
                ""|[aA]|[aA][uU][tT][oO])
                    # Auto-select: find next available ports
                    echo ""
                    local max_port=$((DEFAULT_WEB_PORT + PORT_SEARCH_MAX_ATTEMPTS - 1))
                    if [ "$web_in_use" = true ]; then
                        if ! WEB_PORT=$(find_next_available_port "$DEFAULT_WEB_PORT"); then
                            center_print "No free web port in range ${DEFAULT_WEB_PORT}-${max_port}" "$C_RED"
                            exit 1
                        fi
                    fi
                    max_port=$((DEFAULT_SERVER_PORT + PORT_SEARCH_MAX_ATTEMPTS - 1))
                    if [ "$server_in_use" = true ]; then
                        if ! SERVER_PORT=$(find_next_available_port "$DEFAULT_SERVER_PORT"); then
                            center_print "No free server port in range ${DEFAULT_SERVER_PORT}-${max_port}" "$C_RED"
                            exit 1
                        fi
                    fi
                    # Ensure web and server ports don't conflict with each other
                    if [ "$WEB_PORT" -eq "$SERVER_PORT" ]; then
                        local conflict_start=$((SERVER_PORT + 1))
                        max_port=$((conflict_start + PORT_SEARCH_MAX_ATTEMPTS - 1))
                        if ! SERVER_PORT=$(find_next_available_port "$conflict_start"); then
                            center_print "No free server port in range ${conflict_start}-${max_port}" "$C_RED"
                            exit 1
                        fi
                    fi
                    center_print "✓ Auto-selected available ports:" "$C_GREEN"
                    center_print "  Web: $WEB_PORT  |  Server: $SERVER_PORT" "$C_PRI"
                    break
                    ;;
                [kK]|[kK][iI][lL][lL])
                    echo ""
                    if [ "$web_in_use" = true ]; then
                        center_print "Killing process(es) on port $DEFAULT_WEB_PORT..." "$C_YELLOW"
                        kill_port "$DEFAULT_WEB_PORT" > /dev/null 2>&1 || true
                        center_print "✓ Port $DEFAULT_WEB_PORT is now free" "$C_GREEN"
                    fi
                    if [ "$server_in_use" = true ]; then
                        center_print "Killing process(es) on port $DEFAULT_SERVER_PORT..." "$C_YELLOW"
                        kill_port "$DEFAULT_SERVER_PORT" > /dev/null 2>&1 || true
                        center_print "✓ Port $DEFAULT_SERVER_PORT is now free" "$C_GREEN"
                    fi
                    break
                    ;;
                [cC]|[cC][hH][oO][oO][sS][eE])
                    echo ""
                    local input_pad=$(( (TERM_COLS - 40) / 2 ))
                    # Collect both ports first
                    printf "%${input_pad}s" ""
                    read -r -p "Enter web port (default $DEFAULT_WEB_PORT): " input_web
                    input_web=${input_web:-$DEFAULT_WEB_PORT}
                    printf "%${input_pad}s" ""
                    read -r -p "Enter server port (default $DEFAULT_SERVER_PORT): " input_server
                    input_server=${input_server:-$DEFAULT_SERVER_PORT}

                    # Validate both before assigning either
                    if ! validate_port "$input_web" "Web port"; then
                        continue
                    fi
                    if ! validate_port "$input_server" "Server port"; then
                        continue
                    fi

                    # Assign atomically after both validated
                    WEB_PORT=$input_web
                    SERVER_PORT=$input_server
                    center_print "Using ports: Web=$WEB_PORT, Server=$SERVER_PORT" "$C_GREEN"
                    break
                    ;;
                [xX]|[xX][cC][aA][nN][cC][eE][lL])
                    echo ""
                    center_print "Cancelled." "$C_MUTE"
                    echo ""
                    exit 0
                    ;;
                *)
                    center_print "Invalid choice. Press Enter for auto-select, or K/C/X." "$C_RED"
                    ;;
            esac
        done
    else
        center_print "✓ Port $DEFAULT_WEB_PORT is available" "$C_GREEN"
        center_print "✓ Port $DEFAULT_SERVER_PORT is available" "$C_GREEN"
    fi

    # Restore terminal state
    hide_cursor
    stty -echo -icanon 2>/dev/null || true
}

launch_sequence() {
    local mode_name="$1"

    # Ensure terminal size is available
    get_term_size

    echo ""

    # Show port checking for modes that use local ports
    if [[ "$MODE" == "web" || "$MODE" == "electron" ]]; then
        center_print "Checking ports ${DEFAULT_WEB_PORT} and ${DEFAULT_SERVER_PORT}..." "$C_MUTE"
        resolve_port_conflicts
        echo ""
    fi

    spinner "Initializing environment..."
    spinner "Starting $mode_name..."

    echo ""
    local msg="Automaker is ready!"
    local pad=$(( (TERM_COLS - ${#msg}) / 2 ))
    printf "%${pad}s${C_GREEN}${BOLD}%s${RESET}\n" "" "$msg"

    case "$MODE" in
        web)
            local url="http://${APP_HOST}:$WEB_PORT"
            local upad=$(( (TERM_COLS - ${#url} - 10) / 2 ))
            echo ""
            printf "%${upad}s${DIM}Opening ${C_SEC}%s${RESET}\n" "" "$url"
            ;;
        docker|docker-electron)
            echo ""
            local ui_msg="UI: http://localhost:$DEFAULT_WEB_PORT"
            local api_msg="API: http://localhost:$DEFAULT_SERVER_PORT"
            center_text "${DIM}${ui_msg}${RESET}"
            center_text "${DIM}${api_msg}${RESET}"
            ;;
    esac
    echo ""
}

# ============================================================================
# HISTORY MANAGEMENT
# ============================================================================

save_mode_to_history() {
    if [ "$NO_HISTORY" = false ]; then
        echo "$1" > "$HISTORY_FILE"
    fi
}

get_last_mode_from_history() {
    if [ -f "$HISTORY_FILE" ] && [ "$NO_HISTORY" = false ]; then
        cat "$HISTORY_FILE"
    fi
}

# ============================================================================
# PRODUCTION BUILD
# ============================================================================

build_for_production() {
    echo ""
    center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
    center_print "Building for Production" "$C_PRI"
    center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
    echo ""

    center_print "Building shared packages..." "$C_YELLOW"
    if ! npm run build:packages; then
        center_print "✗ Failed to build packages" "$C_RED"
        exit 1
    fi
    center_print "✓ Packages built" "$C_GREEN"
    echo ""

    center_print "Building server..." "$C_YELLOW"
    if ! npm run build --workspace=apps/server; then
        center_print "✗ Failed to build server" "$C_RED"
        exit 1
    fi
    center_print "✓ Server built" "$C_GREEN"
    echo ""

    center_print "Building UI..." "$C_YELLOW"
    if ! npm run build --workspace=apps/ui; then
        center_print "✗ Failed to build UI" "$C_RED"
        exit 1
    fi
    center_print "✓ UI built" "$C_GREEN"
    echo ""

    center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
    center_print "Build Complete" "$C_GREEN"
    center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
    echo ""
}

# Ensure production env is applied consistently for builds and runtime
apply_production_env() {
    if [ "$PRODUCTION_MODE" = true ]; then
        export NODE_ENV="production"
    fi
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

parse_args "$@"

apply_production_env

# Pre-flight checks
check_platform
check_required_commands
validate_terminal_size

if [ "$CHECK_DEPS" = true ]; then
    check_dependencies || true
fi

hide_cursor
# Disable echo and line buffering for single-key input
stty -echo -icanon 2>/dev/null || true

# Function to read a single key, handling escape sequences for arrows
# Note: bash 3.2 (macOS) doesn't support fractional timeouts, so we use a different approach
read_key() {
    local key
    local escape_seq=""

    if [ -n "$ZSH_VERSION" ]; then
        read -k 1 -s -t "$INPUT_TIMEOUT" key 2>/dev/null || key=""
    else
        # Use IFS= to preserve special characters
        IFS= read -n 1 -s -t "$INPUT_TIMEOUT" -r key 2>/dev/null || key=""
    fi

    # Check for escape sequence (arrow keys send ESC [ A/B/C/D)
    if [[ "$key" == $'\x1b' ]]; then
        # Read the rest of the escape sequence without timeout
        # Arrow keys send 3 bytes: ESC [ A/B/C/D
        IFS= read -n 1 -s -r escape_seq 2>/dev/null || escape_seq=""
        if [[ "$escape_seq" == "[" ]] || [[ "$escape_seq" == "O" ]]; then
            IFS= read -n 1 -s -r escape_seq 2>/dev/null || escape_seq=""
            case "$escape_seq" in
                A) echo "UP"; return ;;
                B) echo "DOWN"; return ;;
                C) echo "RIGHT"; return ;;
                D) echo "LEFT"; return ;;
            esac
        fi
        # Just ESC key pressed
        echo "ESC"
        return
    fi

    echo "$key"
}

# Interactive menu if no mode specified
if [ -z "$MODE" ]; then
    while true; do
        show_header
        show_menu

        key=$(read_key)

        case $key in
            UP)
                SELECTED_OPTION=$((SELECTED_OPTION - 1))
                [ $SELECTED_OPTION -lt 1 ] && SELECTED_OPTION=$MAX_OPTIONS
                ;;
            DOWN)
                SELECTED_OPTION=$((SELECTED_OPTION + 1))
                [ $SELECTED_OPTION -gt $MAX_OPTIONS ] && SELECTED_OPTION=1
                ;;
            1) SELECTED_OPTION=1; MODE="web"; break ;;
            2) SELECTED_OPTION=2; MODE="electron"; break ;;
            3) SELECTED_OPTION=3; MODE="docker"; break ;;
            4) SELECTED_OPTION=4; MODE="docker-electron"; break ;;
            ""|$'\n'|$'\r')
                # Enter key - select current option
                case $SELECTED_OPTION in
                    1) MODE="web" ;;
                    2) MODE="electron" ;;
                    3) MODE="docker" ;;
                    4) MODE="docker-electron" ;;
                esac
                break
                ;;
            q|Q)
                echo ""
                echo ""
                center_text "${C_MUTE}Goodbye! See you soon.${RESET}"
                echo ""
                exit 0
                ;;
            *)
                ;;
        esac
    done
fi

# Validate mode
case $MODE in
    web) MODE_NAME="Web Browser" ;;
    electron) MODE_NAME="Desktop App" ;;
    docker) MODE_NAME="Docker Dev" ;;
    docker-electron) MODE_NAME="Electron + Docker" ;;
    *)
        echo "${C_RED}Error:${RESET} Invalid mode '$MODE'"
        echo "Valid modes: web, electron, docker, docker-electron"
        exit 1
        ;;
esac

# Check Docker for Docker modes
if [[ "$MODE" == "docker" || "$MODE" == "docker-electron" ]]; then
    show_cursor
    stty echo icanon 2>/dev/null || true
    if ! check_docker; then
        exit 1
    fi
    hide_cursor
    stty -echo -icanon 2>/dev/null || true
fi

# Save to history
save_mode_to_history "$MODE"

# Launch sequence
launch_sequence "$MODE_NAME"

# Restore terminal state before running npm
show_cursor
stty echo icanon 2>/dev/null || true

# Build for production if needed
if [ "$PRODUCTION_MODE" = true ]; then
    build_for_production
fi

# Execute the appropriate command
case $MODE in
    web)
        export $(grep -v '^#' .env | xargs) 
        export TEST_PORT="$WEB_PORT"
        export VITE_SERVER_URL="http://${APP_HOST}:$SERVER_PORT"
        export PORT="$SERVER_PORT"
        export DATA_DIR="$SCRIPT_DIR/data"
        # Always include localhost and 127.0.0.1 for local dev, plus custom hostname if different
        CORS_ORIGINS="http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT"
        if [[ "$APP_HOST" != "localhost" && "$APP_HOST" != "127.0.0.1" ]]; then
            CORS_ORIGINS="${CORS_ORIGINS},http://${APP_HOST}:$WEB_PORT"
        fi
        export CORS_ORIGIN="$CORS_ORIGINS"
        export VITE_APP_MODE="1"

        if [ "$PRODUCTION_MODE" = true ]; then
            # Production: run built server and UI preview concurrently
            echo ""
            center_print "Starting server on port $SERVER_PORT..." "$C_YELLOW"
            npm run start --workspace=apps/server &
            SERVER_PID=$!

            # Wait for server to be healthy
            echo ""
            center_print "Waiting for server to be ready..." "$C_YELLOW"
            max_retries=30
            server_ready=false
            for ((i=0; i<max_retries; i++)); do
                if curl -s "http://localhost:$SERVER_PORT/api/health" > /dev/null 2>&1; then
                    server_ready=true
                    break
                fi
                sleep 1
            done

            if [ "$server_ready" = false ]; then
                center_print "✗ Server failed to start" "$C_RED"
                kill $SERVER_PID 2>/dev/null || true
                exit 1
            fi
            center_print "✓ Server is ready!" "$C_GREEN"
            echo ""

            # Start UI preview
            center_print "Starting UI preview on port $WEB_PORT..." "$C_YELLOW"
            npm run preview --workspace=apps/ui -- --port "$WEB_PORT"

            # Cleanup server on exit
            kill $SERVER_PID 2>/dev/null || true
        else
            # Development: build packages, start server, then start UI with Vite dev server
            echo ""
            center_print "Building shared packages..." "$C_YELLOW"
            npm run build:packages
            center_print "✓ Packages built" "$C_GREEN"
            echo ""

            # Start backend server in dev mode (background)
            center_print "Starting backend server on port $SERVER_PORT..." "$C_YELLOW"
            npm run _dev:server &
            SERVER_PID=$!

            # Wait for server to be healthy
            center_print "Waiting for server to be ready..." "$C_YELLOW"
            max_retries=30
            server_ready=false
            for ((i=0; i<max_retries; i++)); do
                if curl -s "http://localhost:$SERVER_PORT/api/health" > /dev/null 2>&1; then
                    server_ready=true
                    break
                fi
                sleep 1
                printf "."
            done
            echo ""

            if [ "$server_ready" = false ]; then
                center_print "✗ Server failed to start" "$C_RED"
                kill $SERVER_PID 2>/dev/null || true
                exit 1
            fi
            center_print "✓ Server is ready!" "$C_GREEN"
            echo ""

            center_print "The application will be available at: http://${APP_HOST}:$WEB_PORT" "$C_GREEN"
            echo ""

            # Start web app with Vite dev server (HMR enabled)
            export VITE_APP_MODE="1"
            npm run _dev:web
        fi
        ;;
    electron)
        # Set environment variables for Electron (it starts its own server)
        export TEST_PORT="$WEB_PORT"
        export PORT="$SERVER_PORT"
        export VITE_SERVER_URL="http://localhost:$SERVER_PORT"
        export CORS_ORIGIN="http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT"
        export VITE_APP_MODE="2"

        if [ "$PRODUCTION_MODE" = true ]; then
            # For production electron, we'd normally use the packaged app
            # For now, run in dev mode but with production-built packages
            center_print "Note: For production Electron, use the packaged app" "$C_YELLOW"
            center_print "Running with production-built packages..." "$C_MUTE"
            echo ""
        fi

        center_print "Launching Desktop Application..." "$C_YELLOW"
        center_print "(Electron will start its own backend server)" "$C_MUTE"
        echo ""
        npm run dev:electron
        ;;
    docker)
        # Check for running Electron (user might be switching from option 4)
        check_running_electron

        # Check for running containers
        check_running_containers "docker-compose.dev.yml"
        container_check=$?

        if [ $container_check -eq 2 ]; then
            # Attach to existing containers
            center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
            center_print "Attaching to Docker Dev Containers" "$C_PRI"
            center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
            echo ""
            center_print "UI:  http://localhost:$DEFAULT_WEB_PORT" "$C_GREEN"
            center_print "API: http://localhost:$DEFAULT_SERVER_PORT" "$C_GREEN"
            center_print "Press Ctrl+C to detach" "$C_MUTE"
            echo ""
            if [ "$DOCKER_CMD" = "sg docker -c" ]; then
                if [ -f "docker-compose.override.yml" ]; then
                    sg docker -c "docker compose -f 'docker-compose.dev.yml' -f 'docker-compose.override.yml' logs -f"
                else
                    sg docker -c "docker compose -f 'docker-compose.dev.yml' logs -f"
                fi
            else
                if [ -f "docker-compose.override.yml" ]; then
                    $DOCKER_CMD compose -f docker-compose.dev.yml -f docker-compose.override.yml logs -f
                else
                    $DOCKER_CMD compose -f docker-compose.dev.yml logs -f
                fi
            fi
        else
            echo ""
            center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
            center_print "Docker Development Mode" "$C_PRI"
            center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
            echo ""
            center_print "Starting UI + Server containers..." "$C_MUTE"
            center_print "Source code is volume mounted for live reload" "$C_MUTE"
            echo ""
            center_print "UI:  http://localhost:$DEFAULT_WEB_PORT" "$C_GREEN"
            center_print "API: http://localhost:$DEFAULT_SERVER_PORT" "$C_GREEN"
            echo ""
            center_print "First run may take several minutes (building image + npm install)" "$C_YELLOW"
            center_print "Press Ctrl+C to stop" "$C_MUTE"
            echo ""
            center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
            echo ""
            if [ "$DOCKER_CMD" = "sg docker -c" ]; then
                if [ -f "docker-compose.override.yml" ]; then
                    sg docker -c "docker compose -f 'docker-compose.dev.yml' -f 'docker-compose.override.yml' up --build"
                else
                    sg docker -c "docker compose -f 'docker-compose.dev.yml' up --build"
                fi
            else
                if [ -f "docker-compose.override.yml" ]; then
                    $DOCKER_CMD compose -f docker-compose.dev.yml -f docker-compose.override.yml up --build
                else
                    $DOCKER_CMD compose -f docker-compose.dev.yml up --build
                fi
            fi
        fi
        ;;
    docker-electron)
        # Check for running Electron (user might be switching from option 2)
        check_running_electron

        # Check for running containers
        check_running_containers "docker-compose.dev-server.yml"
        container_check=$?

        echo ""
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        center_print "Electron + Docker API Mode" "$C_PRI"
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        echo ""
        center_print "Server runs in Docker container" "$C_MUTE"
        center_print "Electron runs locally on your machine" "$C_MUTE"
        echo ""
        center_print "API: http://localhost:$DEFAULT_SERVER_PORT (Docker)" "$C_GREEN"
        echo ""

        # If attaching to existing, skip the build
        if [ $container_check -eq 2 ]; then
            center_print "Using existing server container..." "$C_MUTE"
        else
            center_print "First run may take several minutes (building image + npm install)" "$C_YELLOW"
        fi
        echo ""
        center_print "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" "$C_GRAY"
        echo ""

        # Start docker in background (or skip if attaching)
        if [ $container_check -eq 2 ]; then
            center_print "Checking if server is healthy..." "$C_MUTE"
            DOCKER_PID=""
        else
            center_print "Starting Docker server container..." "$C_MUTE"
            echo ""
            if [ "$DOCKER_CMD" = "sg docker -c" ]; then
                if [ -f "docker-compose.override.yml" ]; then
                    sg docker -c "docker compose -f 'docker-compose.dev-server.yml' -f 'docker-compose.override.yml' up --build" &
                else
                    sg docker -c "docker compose -f 'docker-compose.dev-server.yml' up --build" &
                fi
            else
                if [ -f "docker-compose.override.yml" ]; then
                    $DOCKER_CMD compose -f docker-compose.dev-server.yml -f docker-compose.override.yml up --build &
                else
                    $DOCKER_CMD compose -f docker-compose.dev-server.yml up --build &
                fi
            fi
            DOCKER_PID=$!
        fi

        # Wait for server to be healthy
        echo ""
        center_print "Waiting for server to become healthy..." "$C_YELLOW"
        center_print "(This may take a while on first run)" "$C_MUTE"
        echo ""
        max_retries=180
        server_ready=false
        dots=""
        for ((i=0; i<max_retries; i++)); do
            if curl -s "http://localhost:$DEFAULT_SERVER_PORT/api/health" > /dev/null 2>&1; then
                server_ready=true
                break
            fi
            sleep 1
            if (( i > 0 && i % 10 == 0 )); then
                dots="${dots}."
                center_print "Still waiting${dots}" "$C_MUTE"
            fi
        done
        echo ""

        if [ "$server_ready" = false ]; then
            center_print "✗ Server container failed to become healthy" "$C_RED"
            center_print "Check Docker logs above for errors" "$C_MUTE"
            [ -n "$DOCKER_PID" ] && kill $DOCKER_PID 2>/dev/null || true
            exit 1
        fi

        center_print "✓ Server is healthy!" "$C_GREEN"
        echo ""
        center_print "Building packages and launching Electron..." "$C_MUTE"
        echo ""

        # Build packages and launch Electron
        npm run build:packages
        SKIP_EMBEDDED_SERVER=true PORT=$DEFAULT_SERVER_PORT VITE_SERVER_URL="http://localhost:$DEFAULT_SERVER_PORT" VITE_APP_MODE="4" npm run _dev:electron

        # Cleanup docker when electron exits
        echo ""
        center_print "Shutting down Docker container..." "$C_MUTE"
        [ -n "$DOCKER_PID" ] && kill $DOCKER_PID 2>/dev/null || true
        if [ "$DOCKER_CMD" = "sg docker -c" ]; then
            sg docker -c "docker compose -f 'docker-compose.dev-server.yml' down" 2>/dev/null || true
        else
            $DOCKER_CMD compose -f docker-compose.dev-server.yml down 2>/dev/null || true
        fi
        center_print "Done!" "$C_GREEN"
        ;;
esac
