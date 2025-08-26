# Redis Cloud Setup Guide for ForgeFlow v2

**Complete guide to setting up Redis Cloud for distributed team collaboration**

## 📋 Overview

Redis Cloud is the recommended database solution for ForgeFlow v2 remote teams. It provides:

- **Global Accessibility**: Team members can connect from anywhere
- **High Availability**: 99.9% uptime guarantee
- **Automatic Scaling**: Handles team growth seamlessly
- **Security**: Built-in TLS encryption and authentication
- **Free Tier**: 30MB free - perfect for most teams

## 🚀 Quick Setup (5 minutes)

### Step 1: Create Redis Cloud Account

1. **Visit Redis Cloud**: Go to [https://redis.com/try-free/](https://redis.com/try-free/)
2. **Sign Up**: Create your free account
3. **Verify Email**: Check your email and verify your account
4. **Login**: Access the Redis Cloud console

### Step 2: Create Your Database

1. **New Subscription**: Click "New subscription"
2. **Cloud Provider**: Choose your preferred provider:
   - **AWS** (Recommended): Global coverage, reliable
   - **Google Cloud**: Good performance
   - **Azure**: Enterprise integration

3. **Region**: Choose closest to your team:
   - **US East** (Virginia): Good for US teams
   - **EU West** (Ireland): Good for European teams
   - **Asia Pacific**: Good for Asian teams

4. **Plan**: Select "Fixed size" → "30MB" (Free tier)
5. **Database Name**: Enter `forgeflow-team-db`
6. **Create**: Click "Create subscription"

### Step 3: Configure Database Access

1. **Wait for Deployment**: Takes 2-3 minutes
2. **Access Database**: Click on your database name
3. **Copy Connection Details**:
   - **Endpoint**: `redis-xxxxx.c1.region.cache.amazonaws.com`
   - **Port**: Usually `6379` or `6380` (TLS)
   - **Password**: Auto-generated secure password

4. **Test Connection** (Optional):
   ```bash
   # Install redis-cli if needed
   # Test connection
   redis-cli -h your-endpoint -p your-port -a your-password ping
   ```

### Step 4: Configure ForgeFlow v2

1. **Run Team Setup**: Execute the setup wizard
   ```bash
   node setup-team-mode.js
   ```

2. **Choose Redis Cloud**: Select "Redis Cloud (Recommended for remote teams)"

3. **Enter Connection Details**:
   ```
   Host: redis-xxxxx.c1.region.cache.amazonaws.com
   Port: 6379 (or 6380 for TLS)
   Password: [your-redis-password]
   Database: 0
   ```

4. **Verify Connection**: The setup will test your connection

### Step 5: Create Your Team

```bash
# Create your first team
./ff2.bat team init --name "Your Remote Team"

# Check status (should show Redis Cloud)
./ff2.bat team status

# Invite team members
./ff2.bat team invite developer@company.com
```

## 🔧 Configuration Options

### Connection Settings

#### Standard Connection (Most Common)
```json
{
  "host": "redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com",
  "port": 6379,
  "password": "your-secure-password",
  "db": 0
}
```

#### TLS Connection (Enhanced Security)
```json
{
  "host": "redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com", 
  "port": 6380,
  "password": "your-secure-password",
  "db": 0,
  "tls": {}
}
```

### Environment Variables

After setup, your `.env.team` file will contain:

```env
# Redis Cloud Configuration
REDIS_HOST=redis-12345.c1.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
REDIS_DB=0
REDIS_TYPE=cloud
```

## 🌍 Multi-Region Setup

### For Global Teams

If your team is distributed across continents, consider:

1. **Primary Region**: Choose where most team members are located
2. **Replication**: Upgrade to paid plan for cross-region replication
3. **Performance**: Monitor latency from different locations

### Regional Recommendations

| Team Location | Recommended Region | Endpoint Example |
|---------------|-------------------|------------------|
| **US/Canada** | `us-east-1` | `redis-xxxxx.c1.us-east-1-2.ec2.cloud.redislabs.com` |
| **Europe** | `eu-west-1` | `redis-xxxxx.c1.eu-west-1-2.ec2.cloud.redislabs.com` |
| **Asia Pacific** | `ap-southeast-1` | `redis-xxxxx.c1.ap-southeast-1-2.ec2.cloud.redislabs.com` |

## 🔐 Security Best Practices

### Password Security
- **Use Generated Passwords**: Don't change the auto-generated password
- **Store Securely**: Use environment variables, never commit passwords
- **Team Sharing**: Share passwords through secure channels (1Password, etc.)
- **Rotate Regularly**: Change passwords every 90 days for production teams

### Network Security
```bash
# Test connection security
redis-cli -h your-host -p your-port -a your-password --tls info server

# Verify TLS encryption
redis-cli -h your-host -p 6380 -a your-password --tls ping
```

### Access Control
- **Principle of Least Privilege**: Only team members need access
- **Monitor Access**: Review connection logs in Redis Cloud console
- **IP Whitelisting**: Enable for production environments
- **VPC Peering**: Consider for enterprise deployments

## 📊 Monitoring & Management

### Redis Cloud Dashboard

Access monitoring at [https://app.redislabs.com/](https://app.redislabs.com/):

1. **Memory Usage**: Monitor against your 30MB limit
2. **Connections**: Track active team member connections  
3. **Operations**: View read/write operations per second
4. **Slow Queries**: Identify performance bottlenecks

### ForgeFlow v2 Monitoring

```bash
# Check team collaboration status
./ff2.bat team status

# View Redis configuration
cat .ff2/team-config.json

# Test connection manually
node -e "
const Redis = require('ioredis');
const config = require('./.ff2/team-config.json');
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls
});
redis.ping().then(console.log).catch(console.error);
"
```

## 📈 Scaling & Upgrades

### When to Upgrade

**Upgrade from Free Tier when**:
- **Memory**: Exceeding 25MB consistently
- **Connections**: Need more than 30 concurrent connections
- **Performance**: Experiencing latency issues
- **Features**: Need advanced features (replication, modules)

### Upgrade Options

| Plan | Memory | Connections | Price | Best For |
|------|--------|-------------|-------|----------|
| **Free** | 30MB | 30 | $0/month | Small teams (2-5 people) |
| **Fixed 100MB** | 100MB | 100 | $5/month | Medium teams (5-15 people) |
| **Fixed 1GB** | 1GB | 500 | $15/month | Large teams (15-50 people) |
| **Flexible** | Variable | Variable | Usage-based | Enterprise teams |

### Migration Process

1. **Backup Data**: Export team data before upgrade
2. **Upgrade Plan**: Use Redis Cloud console
3. **Test Connection**: Verify endpoint remains same
4. **Update Config**: No changes needed for same database
5. **Verify Teams**: Ensure all teams are accessible

## 🛠️ Troubleshooting

### Common Issues

#### Connection Timeout
```bash
Error: Redis connection failed: Connection timeout
```

**Solutions**:
1. **Check Internet**: Verify stable internet connection
2. **Firewall**: Ensure ports 6379/6380 are not blocked
3. **Endpoint**: Verify host address is correct
4. **Region**: Check if database region is accessible

#### Authentication Failed
```bash
Error: Redis authentication failed: WRONGPASS invalid username-password pair
```

**Solutions**:
1. **Password**: Double-check password is correct
2. **Username**: Redis Cloud uses default user (leave empty)
3. **Copy-Paste**: Avoid typing password manually
4. **Reset**: Generate new password in Redis Cloud console

#### TLS/SSL Issues
```bash
Error: unable to verify the first certificate
```

**Solutions**:
1. **TLS Port**: Use port 6380 for TLS connections
2. **TLS Config**: Enable TLS in configuration
3. **Certificates**: Use built-in certificate validation
4. **Fallback**: Try non-TLS port 6379 if available

### Advanced Troubleshooting

#### Connection Testing Script
```javascript
// test-redis-cloud.js
const Redis = require('ioredis');

async function testConnection() {
  const redis = new Redis({
    host: 'your-redis-host',
    port: 6379,
    password: 'your-password',
    db: 0,
    connectTimeout: 10000,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  });

  try {
    console.log('Connecting to Redis Cloud...');
    await redis.connect();
    console.log('✅ Connected successfully');

    console.log('Testing PING...');
    const pong = await redis.ping();
    console.log('✅ PING response:', pong);

    console.log('Testing SET/GET...');
    await redis.set('test-key', 'test-value', 'EX', 10);
    const value = await redis.get('test-key');
    console.log('✅ SET/GET test:', value);

    console.log('Getting server info...');
    const info = await redis.info('server');
    console.log('✅ Server version:', info.match(/redis_version:([^\r\n]+)/)?.[1]);

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  } finally {
    redis.disconnect();
  }
}

testConnection();
```

Run with: `node test-redis-cloud.js`

#### Performance Testing
```bash
# Test latency
redis-cli -h your-host -p your-port -a your-password --latency

# Test throughput  
redis-cli -h your-host -p your-port -a your-password eval "return redis.call('ping')" 0
```

## 💡 Best Practices

### Team Collaboration

1. **Shared Credentials**: Use team password manager
2. **Environment Separation**: Different databases for dev/staging/prod
3. **Data Cleanup**: Regular cleanup of old team data
4. **Backup Strategy**: Export important team configurations

### Performance Optimization

1. **Connection Pooling**: Reuse Redis connections
2. **Data Structure**: Use appropriate Redis data types
3. **Expiration**: Set TTL on temporary data
4. **Monitoring**: Regular monitoring of memory usage

### Security Hardening

1. **VPC Setup**: Use VPC peering for production
2. **IP Whitelist**: Restrict access by IP address
3. **Audit Logs**: Enable and review access logs
4. **Compliance**: Ensure meets your compliance requirements

## 📞 Support & Help

### Redis Cloud Support
- **Documentation**: [Redis Cloud Docs](https://docs.redislabs.com/)
- **Support Portal**: [Support Center](https://support.redislabs.com/)
- **Status Page**: [Redis Cloud Status](https://status.redislabs.com/)

### ForgeFlow v2 Support
- **Team Manual**: [docs/TEAM_MANUAL.md](./TEAM_MANUAL.md)
- **GitHub Issues**: [Create Issue](https://github.com/YourOrg/forgeflow-v2/issues)
- **Troubleshooting**: [docs/TEAM_MANUAL.md#troubleshooting](./TEAM_MANUAL.md#troubleshooting)

## 🎯 Quick Reference

### Essential Commands
```bash
# Setup with Redis Cloud
node setup-team-mode.js

# Test connection
./ff2.bat team status  

# Create team
./ff2.bat team init

# Invite members
./ff2.bat team invite user@company.com

# Join team session
./ff2.bat team join
```

### Configuration Files
- **Team Config**: `.ff2/team-config.json`
- **Environment**: `.env.team`
- **Documentation**: `docs/TEAM_MANUAL.md`

### Important URLs
- **Redis Cloud Console**: https://app.redislabs.com/
- **Free Tier Signup**: https://redis.com/try-free/
- **Documentation**: https://docs.redislabs.com/

---

## 🏆 Success Checklist

After completing setup, you should have:

- [ ] ✅ Redis Cloud database created and running
- [ ] ✅ ForgeFlow v2 connected to Redis Cloud  
- [ ] ✅ Team configuration file created
- [ ] ✅ First team created successfully
- [ ] ✅ Team members can connect from remote locations
- [ ] ✅ Team status shows "Remote team collaboration enabled"
- [ ] ✅ All team operations working (create, invite, join, status)

**🎉 Congratulations! Your team is ready for distributed collaboration with Redis Cloud!**

---

*Last updated: August 2025 | Version: 2.1.0 | Supports: Redis Cloud Free & Paid Tiers*