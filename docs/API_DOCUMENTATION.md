# ForgeFlow v2 Backend API Documentation

## Overview

The ForgeFlow v2 backend provides a comprehensive REST API for managing AI-driven development workflows, GitHub integration, agent coordination, and system monitoring. The API supports both HTTP REST endpoints and real-time WebSocket connections.

**Base URL**: `http://localhost:3000/api`  
**WebSocket**: `ws://localhost:3000`

## Authentication

Currently, the API uses GitHub token-based authentication for GitHub integration. Configure your GitHub token in the environment:

```bash
GITHUB_TOKEN=your_github_token_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

## API Endpoints

### 1. GitHub Integration API

#### 1.1 User Information
```http
GET /api/github/user
```
**Description**: Get authenticated GitHub user information.

**Response**:
```json
{
  "user": {
    "id": 12345,
    "login": "username",
    "name": "User Name",
    "email": "user@example.com",
    "avatarUrl": "https://avatars.githubusercontent.com/...",
    "company": "Company Name",
    "location": "Location",
    "publicRepos": 50,
    "privateRepos": 10,
    "followers": 100,
    "following": 50,
    "createdAt": "2020-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z",
    "url": "https://github.com/username"
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 1.2 List Repositories
```http
GET /api/github/repositories
```
**Description**: Get all repositories accessible to the authenticated user.

**Response**:
```json
{
  "repositories": [
    {
      "id": 123456,
      "name": "repository-name",
      "fullName": "owner/repository-name",
      "description": "Repository description",
      "private": false,
      "language": "TypeScript",
      "stars": 150,
      "forks": 25,
      "issues": 10,
      "updatedAt": "2024-01-01T12:00:00Z",
      "url": "https://github.com/owner/repository-name",
      "cloneUrl": "https://github.com/owner/repository-name.git",
      "defaultBranch": "main",
      "size": 1024
    }
  ],
  "total": 1,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 1.3 Repository Statistics
```http
GET /api/github/repositories/:owner/:repo
```
**Description**: Get detailed statistics for a specific repository.

**Parameters**:
- `owner`: Repository owner username
- `repo`: Repository name

**Response**:
```json
{
  "repository": {
    "name": "repository-name",
    "fullName": "owner/repository-name",
    "description": "Repository description",
    "language": "TypeScript",
    "size": 1024,
    "stars": 150,
    "watchers": 10,
    "forks": 25,
    "issues": 5,
    "defaultBranch": "main",
    "createdAt": "2020-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T12:00:00Z",
    "pushedAt": "2024-01-01T11:00:00Z"
  },
  "languages": {
    "TypeScript": 15000,
    "JavaScript": 5000,
    "CSS": 1000
  },
  "contributors": [
    {
      "login": "contributor1",
      "contributions": 50,
      "avatarUrl": "https://avatars.githubusercontent.com/...",
      "url": "https://github.com/contributor1"
    }
  ],
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 1.4 Repository Issues
```http
GET /api/github/repositories/:owner/:repo/issues
```
**Description**: Get issues for a specific repository.

**Query Parameters**:
- `state`: `open`, `closed`, or `all` (default: `open`)
- `labels`: Filter by labels (comma-separated)
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 30)

**Response**:
```json
{
  "issues": [
    {
      "id": 123456,
      "number": 1,
      "title": "Issue title",
      "body": "Issue description",
      "state": "open",
      "labels": ["bug", "priority-high"],
      "assignee": "username",
      "assignees": ["username1", "username2"],
      "milestone": "v1.0",
      "createdAt": "2024-01-01T10:00:00Z",
      "updatedAt": "2024-01-01T11:00:00Z",
      "closedAt": null,
      "url": "https://github.com/owner/repo/issues/1",
      "isPullRequest": false
    }
  ],
  "repository": {
    "owner": "owner",
    "repo": "repository-name"
  },
  "pagination": {
    "page": 1,
    "per_page": 30,
    "total": 1
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 1.5 Repository Pull Requests
```http
GET /api/github/repositories/:owner/:repo/pulls
```
**Description**: Get pull requests for a specific repository.

**Query Parameters**:
- `state`: `open`, `closed`, or `all` (default: `open`)
- `page`: Page number (default: 1)
- `per_page`: Items per page (default: 30)

#### 1.6 Repository Activity
```http
GET /api/github/repositories/:owner/:repo/activity
```
**Description**: Get recent commit activity and statistics.

**Query Parameters**:
- `since`: ISO 8601 timestamp
- `until`: ISO 8601 timestamp
- `per_page`: Items per page (default: 30)

#### 1.7 Create Issue
```http
POST /api/github/repositories/:owner/:repo/issues
```
**Description**: Create a new issue in the repository.

**Request Body**:
```json
{
  "title": "Issue title",
  "body": "Issue description",
  "labels": ["bug", "priority-high"],
  "assignees": ["username"],
  "milestone": 1
}
```

### 2. ForgeFlow Executions API

#### 2.1 List All Executions
```http
GET /api/executions
```
**Description**: Get all ForgeFlow executions with filtering and pagination.

**Query Parameters**:
- `status`: Filter by status (`running`, `completed`, `failed`, `stopped`)
- `pattern`: Filter by execution pattern
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset (default: 0)
- `sort_by`: Sort field (default: `startTime`)
- `sort_order`: Sort direction (`asc`, `desc`)

**Response**:
```json
{
  "executions": [
    {
      "id": "exec-1704110400000-abc123",
      "epicId": "12345",
      "pattern": "feature-development",
      "startTime": "2024-01-01T10:00:00Z",
      "endTime": "2024-01-01T10:30:00Z",
      "status": "completed",
      "progress": 100,
      "duration": 1800000,
      "phasesCompleted": 4,
      "totalPhases": 4,
      "phases": [
        {
          "name": "Planning",
          "startTime": "2024-01-01T10:00:00Z",
          "endTime": "2024-01-01T10:05:00Z",
          "status": "completed",
          "tasks": [
            {
              "taskId": "task-1",
              "status": "completed"
            }
          ]
        }
      ]
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1,
    "hasMore": false
  },
  "statistics": {
    "total": 1,
    "running": 0,
    "completed": 1,
    "failed": 0,
    "stopped": 0,
    "averageProgress": 100,
    "patterns": ["feature-development"]
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 2.2 Get Execution Details
```http
GET /api/executions/:id
```
**Description**: Get detailed information about a specific execution.

#### 2.3 Start New Execution
```http
POST /api/executions
```
**Description**: Start a new ForgeFlow execution.

**Request Body**:
```json
{
  "epicId": "12345",
  "pattern": "feature-development",
  "priority": "normal"
}
```

**Response**:
```json
{
  "execution": {
    "id": "exec-1704110400000-abc123",
    "epicId": "12345",
    "pattern": "feature-development",
    "startTime": "2024-01-01T10:00:00Z",
    "status": "running",
    "progress": 0,
    "phases": []
  },
  "message": "Execution started successfully",
  "timestamp": "2024-01-01T10:00:00Z"
}
```

#### 2.4 Stop Execution
```http
POST /api/executions/:id/stop
```
**Description**: Stop a running execution.

**Request Body**:
```json
{
  "reason": "User requested stop"
}
```

#### 2.5 Execution Patterns
```http
GET /api/executions/patterns
```
**Description**: Get all available execution patterns with usage metrics.

**Response**:
```json
{
  "patterns": [
    {
      "name": "feature-development",
      "description": "Full feature development with parallel execution",
      "phases": [
        {
          "name": "Planning",
          "parallel": false,
          "agents": ["strategic-planner", "system-architect"],
          "estimatedDuration": null,
          "requiredAgents": 2,
          "parallelCapable": false
        }
      ],
      "metrics": {
        "totalExecutions": 50,
        "successRate": 95.5,
        "averageDuration": 1800000,
        "lastUsed": "2024-01-01T10:00:00Z"
      }
    }
  ],
  "total": 1,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 2.6 Execution History
```http
GET /api/executions/history
```
**Description**: Get historical execution data with analytics.

**Query Parameters**:
- `days`: Number of days to include (default: 30)
- `pattern`: Filter by pattern
- `group_by`: Group data by `day`, `hour`, or `week`

### 3. Agents API

#### 3.1 List All Agents
```http
GET /api/agents
```
**Description**: Get all ForgeFlow agents with status and performance metrics.

**Query Parameters**:
- `type`: Filter by agent type
- `status`: Filter by status (`idle`, `busy`, `error`)
- `include_metrics`: Include performance metrics (`true`, `false`)

**Response**:
```json
{
  "agents": [
    {
      "id": "strategic-planner-001",
      "type": "strategic-planner",
      "status": "idle",
      "capabilities": ["epic-analysis", "task-breakdown", "priority-assessment"],
      "version": "2.0.0",
      "currentTask": null,
      "lastActive": "2024-01-01T11:55:00Z",
      "uptime": 300000,
      "isHealthy": true,
      "metrics": {
        "agentId": "strategic-planner-001",
        "type": "strategic-planner",
        "tasksCompleted": 25,
        "tasksFailed": 1,
        "averageTime": 45000,
        "successRate": 96.15,
        "lastActive": "2024-01-01T11:55:00Z"
      },
      "recentActivity": {
        "tasksLast24h": 5,
        "averageTaskTime": 42000,
        "lastTaskCompleted": {
          "taskId": "task-123",
          "executionId": "exec-456",
          "startTime": "2024-01-01T11:00:00Z",
          "status": "completed"
        }
      }
    }
  ],
  "summary": {
    "total": 10,
    "idle": 8,
    "busy": 2,
    "error": 0,
    "healthy": 10,
    "byType": {
      "strategic-planner": 1,
      "system-architect": 1,
      "code-implementer": 2
    }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 3.2 Get Agent Details
```http
GET /api/agents/:id
```
**Description**: Get comprehensive details about a specific agent.

**Query Parameters**:
- `history_limit`: Number of recent history entries (default: 50)

#### 3.3 Agent Analytics
```http
GET /api/agents/analytics
```
**Description**: Get agent performance analytics over time.

**Query Parameters**:
- `agent_type`: Filter by agent type
- `days`: Number of days (default: 30)
- `group_by`: Group data by time period
- `metric_type`: Type of metrics to include

#### 3.4 Agent Health Status
```http
GET /api/agents/health
```
**Description**: Get overall agent health status and recommendations.

#### 3.5 Update Agent Status
```http
PUT /api/agents/:id/status
```
**Description**: Update agent status (for monitoring integration).

**Request Body**:
```json
{
  "status": "busy",
  "currentTask": "task-123",
  "errorMessage": null
}
```

### 4. System Metrics API

#### 4.1 Current System Metrics
```http
GET /api/metrics/current
```
**Description**: Get current system performance and health metrics.

**Response**:
```json
{
  "system": {
    "uptime": 86400,
    "memoryUsage": {
      "heapUsed": 50000000,
      "heapTotal": 100000000,
      "external": 5000000
    },
    "cpuUsage": {
      "user": 1000000,
      "system": 500000
    },
    "memoryUsagePercent": 50,
    "uptimeHours": 24,
    "totalRequests": 1000,
    "totalErrors": 5,
    "errorRate": 0.5,
    "averageResponseTime": 150,
    "peakMemoryUsage": 60000000,
    "currentConnections": 5,
    "connectionsPeak": 10
  },
  "health": {
    "github": true,
    "repository": true,
    "agents": true,
    "quality": true,
    "protocols": true,
    "overall": true
  },
  "performance": {
    "requestsPerSecond": 0.012,
    "averageMemoryGrowth": 0,
    "cpuLoadAverage": 0.5
  },
  "forgeflow": {
    "activeExecutions": 2,
    "totalAgents": 10,
    "healthyAgents": 10,
    "queuedTasks": 0
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### 4.2 Historical Metrics
```http
GET /api/metrics/historical
```
**Description**: Get historical system metrics with time range filtering.

**Query Parameters**:
- `start_date`: ISO 8601 start date
- `end_date`: ISO 8601 end date
- `granularity`: Data granularity (`minute`, `hour`, `day`)
- `metrics_type`: Type of metrics (`system`, `performance`, `forgeflow`)

#### 4.3 Performance Benchmarks
```http
GET /api/metrics/performance
```
**Description**: Get API endpoint performance benchmarks.

**Query Parameters**:
- `sort_by`: Sort field (default: `averageResponseTime`)
- `order`: Sort order (`asc`, `desc`)
- `limit`: Number of results (default: 50)

#### 4.4 System Health Check
```http
GET /api/metrics/health
```
**Description**: Comprehensive system health check with detailed status.

**Response**:
```json
{
  "overall": {
    "status": "healthy",
    "score": 100,
    "message": "All systems operational"
  },
  "categories": {
    "system": {
      "name": "System Resources",
      "status": "healthy",
      "checks": [
        {
          "name": "Memory Usage",
          "status": "healthy",
          "message": "50.0% of heap used",
          "value": 50.0,
          "threshold": 75
        }
      ]
    },
    "api": {
      "name": "API Performance",
      "status": "healthy",
      "checks": [
        {
          "name": "Error Rate",
          "status": "healthy",
          "message": "0.50% error rate",
          "value": 0.5,
          "threshold": 5
        }
      ]
    },
    "forgeflow": {
      "name": "ForgeFlow Services",
      "status": "healthy",
      "checks": [
        {
          "name": "GitHub Integration",
          "status": "healthy",
          "message": "Connected and operational"
        }
      ]
    }
  },
  "summary": {
    "totalChecks": 6,
    "healthyChecks": 6,
    "warningChecks": 0,
    "criticalChecks": 0
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 5. GitHub Webhook Integration

#### 5.1 Webhook Endpoint
```http
POST /webhook/github
```
**Description**: Receive GitHub webhook events for real-time integration.

**Headers**:
- `X-GitHub-Event`: Event type
- `X-Hub-Signature-256`: HMAC signature for verification

**Supported Events**:
- `issues`: Issue creation, updates, and closure
- `pull_request`: PR creation, updates, and merges
- `push`: Code pushes to repositories
- `milestone`: Milestone changes
- `repository`: Repository events
- `ping`: Webhook verification

## WebSocket Events

The ForgeFlow dashboard supports real-time updates via WebSocket connections.

### Connection
```javascript
const socket = io('ws://localhost:3000');
```

### Event Channels

#### System Metrics
```javascript
socket.emit('subscribe', 'system');
socket.on('system:metrics', (data) => {
  // Real-time system metrics
});
```

#### Execution Updates
```javascript
socket.emit('subscribe', 'executions');
socket.on('execution:started', (execution) => {
  // New execution started
});
socket.on('execution:progress', (execution) => {
  // Execution progress update
});
socket.on('execution:completed', (execution) => {
  // Execution completed
});
socket.on('execution:failed', (execution) => {
  // Execution failed
});
```

#### Agent Status
```javascript
socket.emit('subscribe', 'agents');
socket.on('agents:status', (status) => {
  // Agent status updates
});
```

#### GitHub Events
```javascript
socket.emit('subscribe', 'github');
socket.on('github:issues', (data) => {
  // GitHub issue events
});
socket.on('github:pull_request', (data) => {
  // GitHub PR events
});
socket.on('github:push', (data) => {
  // GitHub push events
});
```

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2024-01-01T12:00:00Z",
  "details": {
    "additional": "context"
  }
}
```

**Common HTTP Status Codes**:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `404`: Not Found
- `500`: Internal Server Error
- `503`: Service Unavailable

## Rate Limiting

The API implements rate limiting to ensure fair usage:
- **GitHub API**: Respects GitHub's rate limits
- **ForgeFlow API**: 1000 requests per hour per IP
- **WebSocket**: 100 connections per IP

## Data Persistence

The API includes built-in data persistence for:
- **Execution History**: Last 90 days of execution data
- **Agent Performance**: Daily performance metrics
- **System Metrics**: 30-day rolling window of system data
- **GitHub Data**: Cached for performance optimization

## Performance Considerations

- **Response Times**: Target <200ms for API responses
- **WebSocket**: Real-time updates with <100ms latency
- **Data Volume**: Handles up to 10,000 executions per month
- **Concurrent Users**: Supports up to 100 simultaneous WebSocket connections

## Security

- **GitHub Integration**: Secure token-based authentication
- **Webhook Verification**: HMAC signature verification for GitHub webhooks
- **Input Validation**: All inputs validated and sanitized
- **Error Handling**: Sensitive information excluded from error responses
- **CORS**: Configurable CORS policy for web clients

## Examples

### Starting a ForgeFlow Execution
```bash
curl -X POST http://localhost:3000/api/executions \
  -H "Content-Type: application/json" \
  -d '{"epicId": "12345", "pattern": "feature-development"}'
```

### Getting System Health
```bash
curl http://localhost:3000/api/metrics/health
```

### Subscribing to Real-time Updates
```javascript
const socket = io('ws://localhost:3000');
socket.emit('subscribe', 'executions');
socket.on('execution:started', (data) => console.log('New execution:', data));
```

This API documentation provides comprehensive coverage of all available endpoints and real-time capabilities in the ForgeFlow v2 backend architecture.