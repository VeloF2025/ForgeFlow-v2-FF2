#!/bin/bash

# Generate TLS certificates for Redis SSL/TLS encryption
# ForgeFlow v2 Production Security Setup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/tls"
DAYS_VALID=365

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔐 Generating TLS certificates for Redis${NC}"

# Create certificate directory
mkdir -p "${CERT_DIR}"
cd "${CERT_DIR}"

# Generate CA private key
echo -e "${YELLOW}📝 Generating CA private key...${NC}"
openssl genrsa -out ca.key 4096

# Generate CA certificate
echo -e "${YELLOW}📝 Generating CA certificate...${NC}"
openssl req -new -x509 -days ${DAYS_VALID} -key ca.key -out ca.crt \
    -subj "/C=US/ST=CA/L=San Francisco/O=ForgeFlow/OU=DevOps/CN=ForgeFlow-Redis-CA"

# Generate Redis server private key
echo -e "${YELLOW}📝 Generating Redis server private key...${NC}"
openssl genrsa -out redis.key 2048

# Generate Redis server certificate signing request
echo -e "${YELLOW}📝 Generating Redis server CSR...${NC}"
openssl req -new -key redis.key -out redis.csr \
    -subj "/C=US/ST=CA/L=San Francisco/O=ForgeFlow/OU=DevOps/CN=redis-server"

# Create extensions file for server certificate
cat > redis.ext << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = redis-master
DNS.3 = redis-replica-1
DNS.4 = redis-replica-2
DNS.5 = *.forgeflow-redis.svc.cluster.local
IP.1 = 127.0.0.1
IP.2 = 10.0.0.1
EOF

# Generate Redis server certificate
echo -e "${YELLOW}📝 Generating Redis server certificate...${NC}"
openssl x509 -req -in redis.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out redis.crt -days ${DAYS_VALID} -extensions v3_req -extfile redis.ext

# Generate Redis client private key
echo -e "${YELLOW}📝 Generating Redis client private key...${NC}"
openssl genrsa -out client.key 2048

# Generate Redis client certificate signing request
echo -e "${YELLOW}📝 Generating Redis client CSR...${NC}"
openssl req -new -key client.key -out client.csr \
    -subj "/C=US/ST=CA/L=San Francisco/O=ForgeFlow/OU=DevOps/CN=redis-client"

# Generate Redis client certificate
echo -e "${YELLOW}📝 Generating Redis client certificate...${NC}"
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out client.crt -days ${DAYS_VALID}

# Generate Sentinel private key
echo -e "${YELLOW}📝 Generating Sentinel private key...${NC}"
openssl genrsa -out sentinel.key 2048

# Generate Sentinel certificate signing request
echo -e "${YELLOW}📝 Generating Sentinel CSR...${NC}"
openssl req -new -key sentinel.key -out sentinel.csr \
    -subj "/C=US/ST=CA/L=San Francisco/O=ForgeFlow/OU=DevOps/CN=redis-sentinel"

# Generate Sentinel certificate
echo -e "${YELLOW}📝 Generating Sentinel certificate...${NC}"
openssl x509 -req -in sentinel.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out sentinel.crt -days ${DAYS_VALID}

# Set appropriate permissions
echo -e "${YELLOW}🔒 Setting certificate permissions...${NC}"
chmod 600 *.key
chmod 644 *.crt
chmod 644 ca.crt

# Clean up CSR and temporary files
rm -f *.csr *.srl redis.ext

# Generate DH parameters for enhanced security (optional but recommended)
echo -e "${YELLOW}🔐 Generating DH parameters (this may take a while)...${NC}"
openssl dhparam -out dhparam.pem 2048

# Create combined certificate files for some applications
echo -e "${YELLOW}📄 Creating combined certificate files...${NC}"
cat redis.crt ca.crt > redis-bundle.crt
cat client.crt ca.crt > client-bundle.crt
cat sentinel.crt ca.crt > sentinel-bundle.crt

# Generate certificate information summary
echo -e "${YELLOW}📋 Generating certificate information...${NC}"
cat > certificate-info.txt << EOF
TLS Certificate Information for ForgeFlow Redis
============================================

Generated: $(date)
Validity: ${DAYS_VALID} days
CA Subject: $(openssl x509 -in ca.crt -noout -subject | cut -d' ' -f2-)
CA Validity: $(openssl x509 -in ca.crt -noout -dates)

Server Certificate Subject: $(openssl x509 -in redis.crt -noout -subject | cut -d' ' -f2-)
Client Certificate Subject: $(openssl x509 -in client.crt -noout -subject | cut -d' ' -f2-)
Sentinel Certificate Subject: $(openssl x509 -in sentinel.crt -noout -subject | cut -d' ' -f2-)

Files generated:
- ca.crt: Certificate Authority certificate
- ca.key: Certificate Authority private key (KEEP SECURE)
- redis.crt: Redis server certificate
- redis.key: Redis server private key (KEEP SECURE)
- client.crt: Redis client certificate
- client.key: Redis client private key (KEEP SECURE)
- sentinel.crt: Redis Sentinel certificate
- sentinel.key: Redis Sentinel private key (KEEP SECURE)
- redis-bundle.crt: Combined server certificate with CA
- client-bundle.crt: Combined client certificate with CA
- sentinel-bundle.crt: Combined sentinel certificate with CA
- dhparam.pem: DH parameters for enhanced security

Usage:
- Copy these certificates to your Redis servers
- Configure Redis with tls-cert-file and tls-key-file
- Configure clients with ca.crt for server verification
- Use client certificates for mutual TLS authentication

Security Notes:
- Keep all .key files secure and never expose them
- Regularly rotate certificates before expiration
- Use proper file permissions (600 for keys, 644 for certificates)
- Consider using a proper PKI system for production
EOF

# Verify certificates
echo -e "${YELLOW}🔍 Verifying certificates...${NC}"
echo "CA Certificate:"
openssl x509 -in ca.crt -noout -text | grep -E "(Subject:|Not Before|Not After)"

echo -e "\nServer Certificate:"
openssl x509 -in redis.crt -noout -text | grep -E "(Subject:|Not Before|Not After)"

echo -e "\nVerifying server certificate against CA:"
if openssl verify -CAfile ca.crt redis.crt; then
    echo -e "${GREEN}✅ Server certificate verification: PASSED${NC}"
else
    echo -e "${RED}❌ Server certificate verification: FAILED${NC}"
fi

echo -e "\nVerifying client certificate against CA:"
if openssl verify -CAfile ca.crt client.crt; then
    echo -e "${GREEN}✅ Client certificate verification: PASSED${NC}"
else
    echo -e "${RED}❌ Client certificate verification: FAILED${NC}"
fi

echo -e "\n${GREEN}🎉 TLS certificate generation completed!${NC}"
echo -e "${YELLOW}📍 Certificates are located in: ${CERT_DIR}${NC}"
echo -e "${YELLOW}📖 Certificate information saved to: certificate-info.txt${NC}"
echo -e "\n${RED}⚠️  IMPORTANT: Keep all .key files secure and never commit them to version control!${NC}"

# Create .gitignore for security
cat > .gitignore << EOF
# Private keys - NEVER commit these
*.key
ca.key
redis.key
client.key
sentinel.key

# Certificate Serial files
*.srl

# Temporary files
*.csr
*.tmp
EOF

echo -e "\n${GREEN}🛡️  Created .gitignore to protect private keys${NC}"