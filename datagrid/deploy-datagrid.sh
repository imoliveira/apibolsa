#!/bin/bash

set -e

NAMESPACE="apibolsa"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploy Data Grid - API Bolsa${NC}"
echo "=============================="
echo ""

# Verificar se está no namespace correto
echo "1. Verificando namespace..."
oc project $NAMESPACE > /dev/null 2>&1 || oc create namespace $NAMESPACE
echo -e "${GREEN}✅ Namespace OK${NC}"
echo ""

# Criar Infinispan Cluster
echo "2. Criando Infinispan Cluster..."
oc apply -f infinispan-cluster.yaml
echo -e "${GREEN}✅ Infinispan Cluster criado${NC}"
echo ""

# Aguardar cluster ficar pronto
echo "3. Aguardando Infinispan Cluster ficar pronto..."
oc wait --for=condition=Ready infinispan/apibolsa-cache -n $NAMESPACE --timeout=300s || {
  echo -e "${YELLOW}⚠️  Timeout aguardando cluster. Verificando status...${NC}"
  oc get infinispan -n $NAMESPACE
}
echo ""

# Obter credenciais
echo "4. Obtendo credenciais do Data Grid..."
SECRET_NAME=$(oc get infinispan apibolsa-cache -n $NAMESPACE -o jsonpath='{.status.security.endpointSecretName}' 2>/dev/null || echo "")
if [ -z "$SECRET_NAME" ]; then
  echo -e "${YELLOW}⚠️  Secret não encontrado. Usando credenciais padrão.${NC}"
  echo "   Usuário: developer"
  echo "   Senha: developer"
else
  echo -e "${GREEN}✅ Secret encontrado: $SECRET_NAME${NC}"
  oc get secret $SECRET_NAME -n $NAMESPACE -o jsonpath='{.data.identities\.yaml}' | base64 -d | grep -A 2 "developer" || echo "   Usando credenciais padrão"
fi
echo ""

# Criar Cache
echo "5. Criando configuração de Cache..."
oc apply -f cache-config.yaml
echo -e "${GREEN}✅ Cache configurado${NC}"
echo ""

# Status final
echo "6. Status dos recursos:"
echo ""
echo "Infinispan Cluster:"
oc get infinispan -n $NAMESPACE
echo ""
echo "Cache:"
oc get cache -n $NAMESPACE
echo ""
echo "Pods:"
oc get pods -n $NAMESPACE | grep -E "apibolsa-cache|NAME"
echo ""

# Obter URL do serviço
SERVICE_NAME=$(oc get infinispan apibolsa-cache -n $NAMESPACE -o jsonpath='{.status.service.serviceName}' 2>/dev/null || echo "apibolsa-cache")
echo -e "${GREEN}✅ Data Grid deployado!${NC}"
echo ""
echo "Configuração para Node.js:"
echo "  DATAGRID_URL=http://${SERVICE_NAME}:11222"
echo "  DATAGRID_USER=developer"
echo "  DATAGRID_PASSWORD=developer"
echo ""
echo "Para testar:"
echo "  oc port-forward svc/${SERVICE_NAME} 11222:11222 -n $NAMESPACE"
echo ""



