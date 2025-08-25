"""
Auto-generated ForgeFlow activation script
"""
import json
from pathlib import Path
from datetime import datetime

project_path = Path(r"C:\Jarvis\AI Workspace\ForgeFlow v2")

# Create config
config = {
    "project_name": "ForgeFlow v2",
    "project_path": str(project_path),
    "activation_time": datetime.now().isoformat(),
    "forgeflow_version": "1.0.0",
    "agents": {
        "planner": {"enabled": True, "priority": 1},
        "architect": {"enabled": True, "priority": 2},
        "coder": {"enabled": True, "priority": 3},
        "tester": {"enabled": True, "priority": 4},
        "reviewer": {"enabled": True, "priority": 5},
        "antihallucination": {"enabled": True, "priority": 0}
    }
}

# Save config
config_file = project_path / "forgeflow.config.json"
with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

# Create marker
marker = {
    "activated": True,
    "timestamp": datetime.now().isoformat(),
    "project": "ForgeFlow v2",
    "status": "active"
}

marker_file = project_path / ".forgeflow_active"
with open(marker_file, 'w') as f:
    json.dump(marker, f, indent=2)

print("[SUCCESS] ForgeFlow activated")
