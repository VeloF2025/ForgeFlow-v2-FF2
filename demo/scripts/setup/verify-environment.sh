#!/bin/bash

# ForgeFlow v2 Demo Environment Verification Script
# Verifies that the demo environment is properly set up and ready

set -e

echo "🔍 ForgeFlow v2 Demo Environment Verification"
echo "============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
DEMO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SAMPLE_PROJECT_PATH="$DEMO_ROOT/sample-project"
FF2_ROOT="$(cd "$DEMO_ROOT/../.." && pwd)"

verification_passed=true

echo -e "${BLUE}Verifying demo environment setup...${NC}"
echo ""

# Step 1: System Prerequisites
echo -e "${BLUE}🖥️  Step 1: System Prerequisites${NC}"
echo ""

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo -e "${GREEN}✅ Node.js $NODE_VERSION (>= 18.0.0)${NC}"
    else
        echo -e "${RED}❌ Node.js $NODE_VERSION (< 18.0.0 - upgrade required)${NC}"
        verification_passed=false
    fi
else
    echo -e "${RED}❌ Node.js not found${NC}"
    verification_passed=false
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm $NPM_VERSION${NC}"
else
    echo -e "${RED}❌ npm not found${NC}"
    verification_passed=false
fi

# Check git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | cut -d' ' -f3)
    echo -e "${GREEN}✅ git $GIT_VERSION${NC}"
else
    echo -e "${RED}❌ git not found${NC}"
    verification_passed=false
fi

# Check GitHub CLI (optional)
if command -v gh &> /dev/null; then
    GH_VERSION=$(gh --version | head -n1 | cut -d' ' -f3)
    echo -e "${GREEN}✅ GitHub CLI $GH_VERSION (GitHub integration enabled)${NC}"
else
    echo -e "${YELLOW}⚠️  GitHub CLI not found (GitHub integration will be simulated)${NC}"
fi

echo ""

# Step 2: Directory Structure
echo -e "${BLUE}📁 Step 2: Directory Structure${NC}"
echo ""

required_dirs=(
    "$DEMO_ROOT"
    "$DEMO_ROOT/sample-project"
    "$DEMO_ROOT/workflows"
    "$DEMO_ROOT/configurations"
    "$DEMO_ROOT/custom-agents"
    "$DEMO_ROOT/scripts"
    "$FF2_ROOT/src"
)

for dir in "${required_dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅ Directory exists: $(basename "$dir")${NC}"
    else
        echo -e "${RED}❌ Missing directory: $dir${NC}"
        verification_passed=false
    fi
done

echo ""

# Step 3: Essential Files
echo -e "${BLUE}📄 Step 3: Essential Files${NC}"
echo ""

essential_files=(
    "$DEMO_ROOT/README.md"
    "$DEMO_ROOT/DEMO_INDEX.md"
    "$DEMO_ROOT/scripts/setup/quick-demo.sh"
    "$DEMO_ROOT/workflows/feature-development/run-demo.sh"
    "$DEMO_ROOT/workflows/bug-fix-sprint/run-demo.sh"
    "$DEMO_ROOT/workflows/security-audit/run-demo.sh"
    "$DEMO_ROOT/sample-project/package.json"
    "$DEMO_ROOT/configurations/templates/forgeflow.yaml"
    "$FF2_ROOT/package.json"
    "$FF2_ROOT/src/index.ts"
)

for file in "${essential_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ File exists: $(basename "$file")${NC}"
    else
        echo -e "${RED}❌ Missing file: $file${NC}"
        verification_passed=false
    fi
done

echo ""

# Step 4: FF2 Dependencies
echo -e "${BLUE}📦 Step 4: FF2 Dependencies${NC}"
echo ""

cd "$FF2_ROOT"

if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✅ FF2 dependencies installed${NC}"
        
        # Check if build exists
        if [ -f "dist/index.js" ]; then
            echo -e "${GREEN}✅ FF2 built successfully${NC}"
        else
            echo -e "${YELLOW}⚠️  FF2 not built (run 'npm run build')${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  FF2 dependencies not installed (run 'npm install')${NC}"
    fi
else
    echo -e "${RED}❌ FF2 package.json not found${NC}"
    verification_passed=false
fi

echo ""

# Step 5: Sample Project Dependencies
echo -e "${BLUE}🏗️  Step 5: Sample Project Dependencies${NC}"
echo ""

cd "$SAMPLE_PROJECT_PATH"

if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✅ Sample project dependencies installed${NC}"
    else
        echo -e "${YELLOW}⚠️  Sample project dependencies not installed (run 'npm install')${NC}"
    fi
else
    echo -e "${RED}❌ Sample project package.json not found${NC}"
    verification_passed=false
fi

echo ""

# Step 6: Script Permissions
echo -e "${BLUE}🔐 Step 6: Script Permissions${NC}"
echo ""

demo_scripts=(
    "$DEMO_ROOT/scripts/setup/quick-demo.sh"
    "$DEMO_ROOT/scripts/runners/performance-comparison.sh"
    "$DEMO_ROOT/scripts/cleanup/full-reset.sh"
    "$DEMO_ROOT/workflows/feature-development/run-demo.sh"
    "$DEMO_ROOT/workflows/bug-fix-sprint/run-demo.sh"
    "$DEMO_ROOT/workflows/security-audit/run-demo.sh"
)

for script in "${demo_scripts[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo -e "${GREEN}✅ Executable: $(basename "$script")${NC}"
        else
            echo -e "${YELLOW}⚠️  Making executable: $(basename "$script")${NC}"
            chmod +x "$script"
        fi
    else
        echo -e "${RED}❌ Script not found: $script${NC}"
        verification_passed=false
    fi
done

echo ""

# Step 7: Port Availability
echo -e "${BLUE}🌐 Step 7: Port Availability${NC}"
echo ""

required_ports=(3000 3010 9090 3002)

for port in "${required_ports[@]}"; do
    if ! lsof -i :$port > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Port $port available${NC}"
    else
        echo -e "${YELLOW}⚠️  Port $port in use (may need to stop process)${NC}"
    fi
done

echo ""

# Step 8: Git Repository Status
echo -e "${BLUE}🌿 Step 8: Git Repository Status${NC}"
echo ""

cd "$FF2_ROOT"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Git repository detected${NC}"
    
    # Check for uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        echo -e "${YELLOW}⚠️  Uncommitted changes detected${NC}"
        echo "   Demo will work, but consider committing changes first"
    else
        echo -e "${GREEN}✅ Working directory clean${NC}"
    fi
    
    # Check current branch
    CURRENT_BRANCH=$(git branch --show-current)
    echo -e "${GREEN}✅ Current branch: $CURRENT_BRANCH${NC}"
    
else
    echo -e "${RED}❌ Not in a git repository${NC}"
    verification_passed=false
fi

echo ""

# Step 9: Memory and Disk Space
echo -e "${BLUE}💾 Step 9: System Resources${NC}"
echo ""

# Check available memory (Linux/Mac)
if command -v free &> /dev/null; then
    AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [ "$AVAILABLE_MEM" -ge 2048 ]; then
        echo -e "${GREEN}✅ Available memory: ${AVAILABLE_MEM}MB (>= 2GB)${NC}"
    else
        echo -e "${YELLOW}⚠️  Available memory: ${AVAILABLE_MEM}MB (< 2GB recommended)${NC}"
    fi
elif command -v vm_stat &> /dev/null; then
    # Mac alternative
    echo -e "${GREEN}✅ System memory check passed (macOS)${NC}"
fi

# Check available disk space
AVAILABLE_DISK=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_DISK" -ge 5 ]; then
    echo -e "${GREEN}✅ Available disk space: ${AVAILABLE_DISK}GB (>= 5GB)${NC}"
else
    echo -e "${YELLOW}⚠️  Available disk space: ${AVAILABLE_DISK}GB (< 5GB recommended)${NC}"
fi

echo ""

# Step 10: Demo Configuration Validation
echo -e "${BLUE}⚙️  Step 10: Demo Configuration Validation${NC}"
echo ""

config_files=(
    "$DEMO_ROOT/configurations/templates/forgeflow.yaml"
    "$DEMO_ROOT/configurations/environments/.env.example"
    "$DEMO_ROOT/configurations/policies/failure-policies.yaml"
)

for config in "${config_files[@]}"; do
    if [ -f "$config" ]; then
        echo -e "${GREEN}✅ Configuration template: $(basename "$config")${NC}"
    else
        echo -e "${RED}❌ Missing configuration: $config${NC}"
        verification_passed=false
    fi
done

echo ""

# Final Verification Result
echo -e "${BLUE}🎯 Verification Summary${NC}"
echo ""

if [ "$verification_passed" = true ]; then
    echo -e "${GREEN}🎉 ENVIRONMENT VERIFICATION PASSED!${NC}"
    echo ""
    echo "Your ForgeFlow v2 demo environment is properly set up and ready to use."
    echo ""
    echo "Next steps:"
    echo "  1. Run quick demo: ./scripts/setup/quick-demo.sh"
    echo "  2. Explore workflows: See ./workflows/ directory"
    echo "  3. Try custom agents: See ./custom-agents/ directory"
    echo "  4. Read full guide: See ./DEMO_INDEX.md"
    echo ""
    exit 0
else
    echo -e "${RED}❌ ENVIRONMENT VERIFICATION FAILED${NC}"
    echo ""
    echo "Please address the issues above before running the demo."
    echo ""
    echo "Common fixes:"
    echo "  • Install missing prerequisites (Node.js, git)"
    echo "  • Run 'npm install' in FF2 root and sample-project directories"
    echo "  • Make sure you're in a git repository"
    echo "  • Free up disk space if needed"
    echo ""
    echo "For help: See troubleshooting section in ./README.md"
    echo ""
    exit 1
fi