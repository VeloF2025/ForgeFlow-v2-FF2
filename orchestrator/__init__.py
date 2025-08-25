"""
ForgeFlow v2 Orchestrator
True parallel AI orchestration through GitHub issues and Git worktrees
"""

from .queue import IssueQueueManager
from .worktree import WorktreeManager
from .agents import AgentPoolCoordinator
from .quality import QualityGateEnforcer

__version__ = "2.0.0"
__all__ = [
    "IssueQueueManager",
    "WorktreeManager", 
    "AgentPoolCoordinator",
    "QualityGateEnforcer"
]