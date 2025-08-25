#!/bin/bash

# ForgeFlow v2 Demo Full Reset Script
# Completely resets the demo environment to pristine state

set -e

echo "🧹 ForgeFlow v2 - Demo Environment Full Reset"
echo "============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DEMO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SAMPLE_PROJECT_PATH="$DEMO_ROOT/sample-project"
FF2_ROOT="$(cd "$DEMO_ROOT/../.." && pwd)"

echo -e "${YELLOW}⚠️  WARNING: This will completely reset the demo environment${NC}"
echo -e "${YELLOW}This will remove all demo artifacts, logs, and temporary files${NC}"
echo ""

echo -e "${BLUE}Reset scope:${NC}"
echo "  • All worktrees and branches"
echo "  • Demo configuration files"
echo "  • Generated artifacts and logs"
echo "  • Node modules cache"
echo "  • Build outputs"
echo "  • Background processes"
echo "  • Temporary files and directories"
echo ""

# Confirmation prompt
read -p "Are you sure you want to proceed? (y/N): " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo "Reset cancelled."
    exit 0
fi

echo ""
echo -e "${RED}🚨 FULL RESET IN PROGRESS...${NC}"
echo ""

# Step 1: Stop all background processes
echo -e "${BLUE}🛑 Step 1: Stopping Background Processes${NC}"
echo ""

# Find and stop FF2 processes
echo "Searching for ForgeFlow processes..."
if pgrep -f "forgeflow\|FF2\|node.*dist/index.js" > /dev/null; then
    echo "Stopping ForgeFlow processes..."
    pkill -f "forgeflow\|FF2\|node.*dist/index.js" || true
    echo -e "${GREEN}✅ ForgeFlow processes stopped${NC}"
else
    echo -e "${GREEN}✅ No ForgeFlow processes found${NC}"
fi

# Stop any demo-related Node.js processes
echo "Checking for demo-related processes..."
if pgrep -f "node.*demo\|npm run dev\|vite" > /dev/null; then
    echo "Stopping demo processes..."
    pkill -f "node.*demo\|npm run dev\|vite" || true
    echo -e "${GREEN}✅ Demo processes stopped${NC}"
else
    echo -e "${GREEN}✅ No demo processes found${NC}"
fi

# Check for specific ports and kill processes using them
for port in 3000 3010 9090 3002; do
    if lsof -i :$port > /dev/null 2>&1; then
        echo "Stopping process using port $port..."
        kill $(lsof -t -i :$port) 2>/dev/null || true
        echo -e "${GREEN}✅ Port $port freed${NC}"
    fi
done

echo ""

# Step 2: Clean Git worktrees and branches
echo -e "${BLUE}🌿 Step 2: Cleaning Git Worktrees and Branches${NC}"
echo ""

cd "$FF2_ROOT"

# Clean up worktrees
if [ -d ".worktrees" ]; then
    echo "Removing worktrees directory..."
    rm -rf ".worktrees"
    echo -e "${GREEN}✅ Worktrees directory removed${NC}"
fi

# Clean up worktree-related git config
echo "Cleaning git worktree configuration..."
git worktree prune 2>/dev/null || true
echo -e "${GREEN}✅ Git worktree configuration cleaned${NC}"

# Remove demo-related branches
echo "Removing demo branches..."
demo_branches=$(git branch | grep -E "ff2-agent-|demo-|feature-development|bug-fix-sprint|security-audit" | sed 's/^\*\?[[:space:]]*//' || true)
if [ -n "$demo_branches" ]; then
    echo "$demo_branches" | while read branch; do
        if [ -n "$branch" ] && [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
            git branch -D "$branch" 2>/dev/null || true
            echo "  Removed branch: $branch"
        fi
    done
    echo -e "${GREEN}✅ Demo branches removed${NC}"
else
    echo -e "${GREEN}✅ No demo branches found${NC}"
fi

echo ""

# Step 3: Clean sample project
echo -e "${BLUE}🏗️  Step 3: Cleaning Sample Project${NC}"
echo ""

if [ -d "$SAMPLE_PROJECT_PATH" ]; then
    cd "$SAMPLE_PROJECT_PATH"
    
    # Remove worktrees
    if [ -d ".worktrees" ]; then
        echo "Removing sample project worktrees..."
        rm -rf ".worktrees"
        echo -e "${GREEN}✅ Sample project worktrees removed${NC}"
    fi
    
    # Remove demo configuration files
    demo_configs=(".env.demo" "forgeflow.yaml" ".ff2-config.json" ".demo-epic-id")
    for config in "${demo_configs[@]}"; do
        if [ -f "$config" ]; then
            rm "$config"
            echo "  Removed: $config"
        fi
    done
    echo -e "${GREEN}✅ Demo configuration files removed${NC}"
    
    # Clean Node.js artifacts
    if [ -d "node_modules" ]; then
        echo "Removing node_modules..."
        rm -rf "node_modules"
        echo -e "${GREEN}✅ node_modules removed${NC}"
    fi
    
    # Clean build outputs
    build_dirs=("dist" "build" ".next" ".vite")
    for dir in "${build_dirs[@]}"; do
        if [ -d "$dir" ]; then
            rm -rf "$dir"
            echo "  Removed: $dir"
        fi
    done
    echo -e "${GREEN}✅ Build outputs cleaned${NC}"
    
    # Clean cache directories
    cache_dirs=(".cache" "node_modules/.cache" ".vite-cache")
    for dir in "${cache_dirs[@]}"; do
        if [ -d "$dir" ]; then
            rm -rf "$dir"
            echo "  Removed cache: $dir"
        fi
    done
    echo -e "${GREEN}✅ Cache directories cleaned${NC}"
    
else
    echo -e "${YELLOW}⚠️  Sample project directory not found${NC}"
fi

echo ""

# Step 4: Clean FF2 root directory
echo -e "${BLUE}⚙️  Step 4: Cleaning FF2 Root Directory${NC}"
echo ""

cd "$FF2_ROOT"

# Clean demo-specific files in FF2 root
demo_files=(".env" ".env.demo" ".env.local" ".ff2-demo-config")
for file in "${demo_files[@]}"; do
    if [ -f "$file" ]; then
        rm "$file"
        echo "  Removed: $file"
    fi
done
echo -e "${GREEN}✅ Demo environment files removed${NC}"

# Clean logs
if [ -d "logs" ]; then
    echo "Cleaning log files..."
    find logs -name "*.log" -delete 2>/dev/null || true
    find logs -name "*.error" -delete 2>/dev/null || true
    find logs -name "demo-*" -delete 2>/dev/null || true
    echo -e "${GREEN}✅ Log files cleaned${NC}"
fi

# Clean Node.js artifacts in FF2
if [ -d "node_modules/.cache" ]; then
    rm -rf "node_modules/.cache"
    echo -e "${GREEN}✅ FF2 Node.js cache cleaned${NC}"
fi

# Clean build artifacts
if [ -d "dist" ]; then
    echo "Removing FF2 build artifacts..."
    rm -rf "dist"
    echo -e "${GREEN}✅ FF2 build artifacts removed${NC}"
fi

echo ""

# Step 5: Clean demo artifacts and reports
echo -e "${BLUE}📊 Step 5: Cleaning Demo Artifacts${NC}"
echo ""

# Clean demo results and reports
if [ -d "$DEMO_ROOT/results" ]; then
    echo "Removing demo results..."
    rm -rf "$DEMO_ROOT/results"
    echo -e "${GREEN}✅ Demo results removed${NC}"
fi

# Clean generated reports
report_dirs=("$DEMO_ROOT/reports" "$FF2_ROOT/reports")
for dir in "${report_dirs[@]}"; do
    if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo "  Removed reports: $dir"
    fi
done
echo -e "${GREEN}✅ Generated reports removed${NC}"

# Clean temporary demo files
temp_patterns=("*demo-*.tmp" "*demo-*.json" "*.demo.bak")
for pattern in "${temp_patterns[@]}"; do
    find "$DEMO_ROOT" -name "$pattern" -delete 2>/dev/null || true
done
echo -e "${GREEN}✅ Temporary demo files cleaned${NC}"

echo ""

# Step 6: Clean system-level artifacts
echo -e "${BLUE}🖥️  Step 6: Cleaning System-Level Artifacts${NC}"
echo ""

# Clean system temp directories
system_temp_dirs=("/tmp/ff2-*" "/tmp/forgeflow-*" "/tmp/demo-*")
for pattern in "${system_temp_dirs[@]}"; do
    rm -rf $pattern 2>/dev/null || true
done
echo -e "${GREEN}✅ System temp directories cleaned${NC}"

# Clean user cache directories (if they exist)
if [ -d "$HOME/.cache/forgeflow" ]; then
    rm -rf "$HOME/.cache/forgeflow"
    echo -e "${GREEN}✅ User cache directory cleaned${NC}"
fi

# Clean any demo databases
demo_dbs=("forgeflow_demo.db" "demo.sqlite" "ff2-demo.db")
for db in "${demo_dbs[@]}"; do
    if [ -f "$db" ]; then
        rm "$db"
        echo "  Removed demo database: $db"
    fi
done
echo -e "${GREEN}✅ Demo databases cleaned${NC}"

echo ""

# Step 7: Verify cleanup
echo -e "${BLUE}🔍 Step 7: Verifying Cleanup${NC}"
echo ""

cleanup_verified=true

# Check for remaining worktrees
if find . -name ".worktrees" -type d 2>/dev/null | grep -q "."; then
    echo -e "${YELLOW}⚠️  Some worktree directories still exist${NC}"
    cleanup_verified=false
fi

# Check for demo configuration files
demo_config_patterns=("forgeflow.yaml" ".env.demo" ".ff2-config.json")
for pattern in "${demo_config_patterns[@]}"; do
    if find "$DEMO_ROOT" -name "$pattern" 2>/dev/null | grep -q "."; then
        echo -e "${YELLOW}⚠️  Some demo configuration files still exist${NC}"
        cleanup_verified=false
    fi
done

# Check for running processes
if pgrep -f "forgeflow\|FF2" > /dev/null; then
    echo -e "${YELLOW}⚠️  Some ForgeFlow processes are still running${NC}"
    cleanup_verified=false
fi

if [ "$cleanup_verified" = true ]; then
    echo -e "${GREEN}✅ Cleanup verification passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some cleanup items may need manual attention${NC}"
fi

echo ""

# Step 8: Optional reinstallation
echo -e "${BLUE}🔄 Step 8: Reinstallation Options${NC}"
echo ""

echo "Reset complete! Choose next steps:"
echo ""
echo "1) Reinstall dependencies and prepare for new demo"
echo "2) Complete reset (no reinstallation)"
echo "3) Cancel and exit"
echo ""

read -p "Enter your choice (1-3): " reinstall_choice

case $reinstall_choice in
    1)
        echo ""
        echo -e "${BLUE}Reinstalling dependencies...${NC}"
        
        # Reinstall FF2 dependencies
        cd "$FF2_ROOT"
        echo "Installing FF2 dependencies..."
        npm install
        echo -e "${GREEN}✅ FF2 dependencies installed${NC}"
        
        # Reinstall sample project dependencies
        if [ -d "$SAMPLE_PROJECT_PATH" ]; then
            cd "$SAMPLE_PROJECT_PATH"
            echo "Installing sample project dependencies..."
            npm install
            echo -e "${GREEN}✅ Sample project dependencies installed${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}✅ Environment reset and ready for new demo!${NC}"
        echo ""
        echo "To start a new demo:"
        echo "  cd $DEMO_ROOT"
        echo "  ./scripts/setup/quick-demo.sh"
        ;;
    2)
        echo ""
        echo -e "${GREEN}✅ Complete reset finished${NC}"
        echo ""
        echo "Environment is now in pristine state."
        echo "Run ./scripts/setup/quick-demo.sh when ready for new demo."
        ;;
    3)
        echo ""
        echo "Exiting without further action."
        ;;
esac

echo ""

# Step 9: Final summary
echo -e "${PURPLE}📋 Reset Summary${NC}"
echo ""

cat << EOF
🧹 CLEANUP COMPLETED:

✅ Stopped Processes:
  • All ForgeFlow background services
  • Demo-related Node.js processes
  • Port-specific processes (3000, 3010, 9090, 3002)

✅ Removed Git Artifacts:
  • All worktree directories
  • Demo-related branches
  • Git worktree configuration

✅ Cleaned Project Files:
  • Sample project artifacts
  • Demo configuration files
  • Node modules and cache
  • Build outputs and temporary files

✅ System Cleanup:
  • Log files and error reports
  • System temporary directories
  • User cache directories
  • Demo databases

🎯 Environment Status: PRISTINE
Ready for fresh demo execution or production use.

📚 Next Steps:
  • Run quick-demo.sh for new demonstration
  • Follow setup guides for production deployment
  • Customize configurations for your project
EOF

echo ""
echo -e "${GREEN}🎉 ForgeFlow v2 Demo Environment Reset Complete!${NC}"
echo ""